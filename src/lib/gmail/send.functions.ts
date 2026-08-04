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
      site: 'https://seu-certificado-mei-digital.online',
      sender: status.ok ? getSenderEmail() : null,
      configured: status.ok,
      missing: status.missing,
    };
  });

export const testWorkspaceConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getAccessToken, getSenderEmail, GmailError } = await import('./gmail.server');
    const sender = getSenderEmail();
    const requiredScope = 'https://www.googleapis.com/auth/gmail.send';
    try {
      // 1) Trocar refresh_token por access_token (sem chamar users.getProfile).
      const accessToken = await getAccessToken();

      // 3) Validar o access_token no endpoint oficial tokeninfo.
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!res.ok) {
        return {
          ok: false,
          sender,
          error: `tokeninfo_failed: status ${res.status}`,
        };
      }
      const info = (await res.json()) as {
        aud?: string;
        scope?: string;
        expires_in?: string | number;
      };

      const scopes = (info.scope ?? '').split(/\s+/).filter(Boolean);
      const hasSendScope =
        scopes.includes(requiredScope) || scopes.includes('gmail.send');
      const audMatches = info.aud === process.env.GOOGLE_CLIENT_ID;

      if (!audMatches) {
        return {
          ok: false,
          sender,
          error:
            'client_mismatch: o access_token não pertence ao GOOGLE_CLIENT_ID configurado.',
        };
      }
      if (!hasSendScope) {
        return {
          ok: false,
          sender,
          error: `missing_scope: o token não possui ${requiredScope}.`,
        };
      }

      // 5) Token ativo, pertence ao client_id e possui gmail.send.
      return {
        ok: true,
        sender,
        message: 'Conexão autorizada para envio via Gmail API',
      };
    } catch (e) {
      const err = e as InstanceType<typeof GmailError>;
      // 2) Erro seguro — não expõe token nem segredos.
      return {
        ok: false,
        sender,
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

export const processWorkspaceQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ maxBatch: z.number().int().min(1).max(50).default(10) }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { processQueueInternal } = await import('./queue.server');
    return await processQueueInternal(data.maxBatch);
  });

