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

export async function sendOneNow(row: QueueRow) {
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

/** Processa até `maxBatch` e-mails pendentes da fila. */
export async function processQueueInternal(maxBatch = 10) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('email_send_queue')
    .select('id, to_email, subject, html, text, attempts')
    .eq('status', 'queued')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(maxBatch);
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const r = await sendOneNow(row as QueueRow);
    if (r.ok) sent++;
    else failed++;
  }
  return { processed: rows?.length ?? 0, sent, failed };
}
