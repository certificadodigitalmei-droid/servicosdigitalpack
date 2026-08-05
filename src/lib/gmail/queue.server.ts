// Server-only: processa a fila de e-mails do Google Workspace (Gmail API).
// Usado tanto pelo painel (admin) quanto pelo cron automático.

const RATE_WINDOW_MS = 1_000;
let lastSendAt = 0;

type QueueRow = {
  id: string;
  to_email: string;
  subject: string;
  html: string | null;
  text: string | null;
  attempts: number;
};

export async function sendOneNow(row: QueueRow, opts: { burst?: boolean } = {}) {
  const { sendGmailMessage, GmailError } = await import('./gmail.server');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  if (!opts.burst) {
    const wait = Math.max(0, RATE_WINDOW_MS - (Date.now() - lastSendAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSendAt = Date.now();
  }

  await supabaseAdmin
    .from('email_send_queue')
    .update({ status: 'sending', attempts: row.attempts + 1 })
    .eq('id', row.id);

  // Log de auditoria: Iniciando Envio
  const { data: qRow } = await supabaseAdmin.from('email_send_queue').select('idempotency_key').eq('id', row.id).maybeSingle();
  const companyCnpj = qRow?.idempotency_key?.replace('mass-email-', '');

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
    
    // Log de auditoria: E-mail Enviado
    if (companyCnpj) {
      await supabaseAdmin.from('automation_audit_logs').insert({
        cnpj: companyCnpj,
        event_type: 'email_sent',
        details: { message_id: result.messageId }
      });
    }
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

    // Log de auditoria: Falha no Envio
    if (companyCnpj) {
      await supabaseAdmin.from('automation_audit_logs').insert({
        cnpj: companyCnpj,
        event_type: 'email_failed',
        details: { error: err.message, code: err.code, final: shouldGiveUp }
      });
    }
    return { ok: false as const, retry: !shouldGiveUp };
  }
}

/** Teto rígido de envios por hora. */
export const HOURLY_LIMIT = 100;

/** Quantos e-mails já saíram na última hora (janela deslizante). */
export async function sentInLastHour(): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('email_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('updated_at', since);
  return count ?? 0;
}

/**
 * Processa até `maxBatch` e-mails pendentes da fila, respeitando o teto de
 * `HOURLY_LIMIT` envios na janela de 60 minutos.
 */
export async function processQueueInternal(
  maxBatch = 10,
  hourlyLimit = HOURLY_LIMIT,
  opts: { burst?: boolean; concurrency?: number } = {},
) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const lastHour = await sentInLastHour();
  const remaining = Math.max(0, hourlyLimit - lastHour);
  if (remaining === 0) {
    return { processed: 0, sent: 0, failed: 0, lastHour, remaining: 0, throttled: true };
  }
  const batch = Math.min(maxBatch, remaining);

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('email_send_queue')
    .select('id, to_email, subject, html, text, attempts')
    .in('status', ['queued', 'pending'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(batch);
  if (error) throw new Error(error.message);

  const list = (rows ?? []) as QueueRow[];
  let sent = 0;
  let failed = 0;

  if (opts.burst) {
    // Rajada: dispara em paralelo (blocos) até esgotar a cota da hora.
    const concurrency = Math.max(1, Math.min(20, opts.concurrency ?? 10));
    for (let i = 0; i < list.length; i += concurrency) {
      const chunk = list.slice(i, i + concurrency);
      const res = await Promise.all(chunk.map((row) => sendOneNow(row, { burst: true })));
      for (const r of res) r.ok ? sent++ : failed++;
    }
  } else {
    for (const row of list) {
      const r = await sendOneNow(row);
      if (r.ok) sent++;
      else failed++;
    }
  }

  return {
    processed: list.length,
    sent,
    failed,
    lastHour: lastHour + sent,
    remaining: Math.max(0, remaining - sent),
    throttled: false,
  };
}
