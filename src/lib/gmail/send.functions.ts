// Server functions for Google Workspace (Gmail API) sending.
// All handlers require admin role. Sender is fixed by GOOGLE_SENDER_EMAIL.
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const enqueueSchema = z.object({
  to: z
    .string()
    .trim()
    .max(320)
    .refine((v) => emailRegex.test(v), 'e-mail inválido')
    .refine((v) => !/[\r\n]/.test(v), 'caractere inválido'),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((v) => !/[\r\n]/.test(v), 'assunto inválido'),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const workspaceStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { hasAllGoogleSecrets, getSenderEmail } = await import('./gmail.server');
    const status = hasAllGoogleSecrets();
    return {
      site: 'https://certificadodigitalccmei.online',
      sender: status.ok ? getSenderEmail() : null,
      configured: status.ok,
      missing: status.missing,
    };
  });

export const testWorkspaceConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { fetchGmailProfile, getSenderEmail, GmailError } = await import('./gmail.server');
    try {
      const profile = await fetchGmailProfile();
      const expected = getSenderEmail().toLowerCase();
      const ok = profile.emailAddress.toLowerCase() === expected;
      return {
        ok,
        connectedAs: profile.emailAddress,
        expected,
        warning: ok
          ? null
          : 'O refresh_token pertence a uma conta diferente do GOOGLE_SENDER_EMAIL.',
      };
    } catch (e) {
      const err = e as InstanceType<typeof GmailError>;
      return {
        ok: false,
        connectedAs: null,
        expected: null,
        warning: null,
        error: `${err.code ?? 'error'}: ${err.message}`,
      };
    }
  });

export const sendWorkspaceTestEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { sendGmailMessage, getSenderEmail, GmailError } = await import('./gmail.server');
    const sender = getSenderEmail();
    try {
      const result = await sendGmailMessage({
        to: sender,
        subject: 'Teste de conexão — Google Workspace',
        text: 'Envio de teste do Painel. Se você recebeu este e-mail, a integração Gmail API está funcionando.',
        html: '<p>Envio de teste do Painel.</p><p>Se você recebeu este e-mail, a integração <strong>Gmail API</strong> está funcionando.</p>',
      });
      return { sent: true, to: sender, messageId: result.messageId };
    } catch (e) {
      const err = e as InstanceType<typeof GmailError>;
      return {
        sent: false,
        to: sender,
        error: `${err.code ?? 'error'}: ${err.message}`,
        retryAfterSeconds: err.retryAfterSeconds,
      };
    }
  });

export const enqueueWorkspaceEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => enqueueSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const idempotencyKey = data.idempotencyKey || crypto.randomUUID();
    const { data: row, error } = await supabaseAdmin
      .from('email_send_queue')
      .insert({
        to_email: data.to,
        subject: data.subject,
        html: data.html ?? null,
        text: data.text ?? null,
        idempotency_key: idempotencyKey,
        status: 'queued',
        created_by: context.userId,
      })
      .select('id')
      .single();
    if (error) {
      if ((error as any).code === '23505') {
        return { queued: false, reason: 'duplicate_idempotency_key' as const, idempotencyKey };
      }
      throw new Error(error.message);
    }
    return { queued: true, id: row!.id, idempotencyKey };
  });

// Simple in-worker rate limit (per isolate). Not a substitute for provider quotas.
const RATE_WINDOW_MS = 1_000;
let lastSendAt = 0;

async function sendOneNow(row: {
  id: string;
  to_email: string;
  subject: string;
  html: string | null;
  text: string | null;
  attempts: number;
}) {
  const { sendGmailMessage, GmailError } = await import('./gmail.server');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const wait = Math.max(0, RATE_WINDOW_MS - (Date.now() - lastSendAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSendAt = Date.now();

  await supabaseAdmin
    .from('email_send_queue')
    .update({ status: 'sending', attempts: row.attempts + 1 })
    .eq('id', row.id);

  try {
    const result = await sendGmailMessage({
      to: row.to_email,
      subject: row.subject,
      html: row.html ?? undefined,
      text: row.text ?? undefined,
    });
    await supabaseAdmin
      .from('email_send_queue')
      .update({
        status: 'sent',
        sent_message_id: result.messageId,
        last_error: null,
        last_status_code: 200,
        next_retry_at: null,
      })
      .eq('id', row.id);
    return { ok: true as const };
  } catch (e) {
    const err = e as InstanceType<typeof GmailError>;
    const attempts = row.attempts + 1;
    const isRetryable =
      err.status === 429 || err.status >= 500 || err.code === 'oauth_refresh_failed';
    const shouldGiveUp = attempts >= 5 || !isRetryable;
    const backoffSec = err.retryAfterSeconds ?? Math.min(3600, 30 * Math.pow(2, attempts));
    await supabaseAdmin
      .from('email_send_queue')
      .update({
        status: shouldGiveUp ? 'failed' : 'queued',
        last_error: `${err.code ?? 'error'}: ${err.message}`.slice(0, 500),
        last_status_code: err.status || null,
        next_retry_at: shouldGiveUp ? null : new Date(Date.now() + backoffSec * 1000).toISOString(),
      })
      .eq('id', row.id);
    return { ok: false as const, retry: !shouldGiveUp };
  }
}

export const processWorkspaceQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ maxBatch: z.number().int().min(1).max(50).default(10) }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const nowIso = new Date().toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from('email_send_queue')
      .select('id, to_email, subject, html, text, attempts')
      .eq('status', 'queued')
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(data.maxBatch);
    if (error) throw new Error(error.message);

    let sent = 0;
    let failed = 0;
    for (const row of rows ?? []) {
      const r = await sendOneNow(row as any);
      if (r.ok) sent++;
      else failed++;
    }
    return { processed: rows?.length ?? 0, sent, failed };
  });
