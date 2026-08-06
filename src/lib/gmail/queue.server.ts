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
    // 429 (rate limit) NÃO é falha do e-mail: é só "tente mais tarde".
    // Não gasta tentativa e nunca vira "failed".
    const isRateLimit = err.status === 429 || err.code === 'rate_limited';
    const isRetryable = err.status >= 500 || err.code === 'oauth_refresh_failed';
    const shouldGiveUp = !isRateLimit && (attempts >= 5 || !isRetryable);
    const backoffSec = isRateLimit
      ? (err.retryAfterSeconds ?? 60)
      : (err.retryAfterSeconds ?? Math.min(3600, 30 * Math.pow(2, attempts)));
    await supabaseAdmin
      .from('email_send_queue')
      .update({
        status: shouldGiveUp ? 'failed' : 'queued',
        // devolve a tentativa quando foi apenas limite de taxa
        attempts: isRateLimit ? row.attempts : attempts,
        last_error: `${err.code ?? 'error'}: ${err.message}`.slice(0, 500),
        last_status_code: err.status || null,
        next_retry_at: shouldGiveUp ? null : new Date(Date.now() + backoffSec * 1000).toISOString(),
      })
      .eq('id', row.id);

    // Limite do provedor: pausa a fila INTEIRA até o horário indicado por ele.
    if (isRateLimit) {
      const until = new Date(Date.now() + backoffSec * 1000).toISOString();
      await supabaseAdmin
        .from('email_send_queue')
        .update({ next_retry_at: until })
        .in('status', ['queued', 'pending'])
        .or(`next_retry_at.is.null,next_retry_at.lt.${until}`);
    }

    // Log de auditoria: só registra falha real (rate limit não é falha)
    if (companyCnpj && !isRateLimit) {
      await supabaseAdmin.from('automation_audit_logs').insert({
        cnpj: companyCnpj,
        event_type: 'email_failed',
        details: { error: err.message, code: err.code, final: shouldGiveUp }
      });
    }
    return { ok: false as const, retry: !shouldGiveUp, rateLimited: isRateLimit, retryAfterSec: backoffSec };
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
 * Devolve para a fila itens presos em "sending" há mais de 10 minutos
 * (execução interrompida no meio do envio).
 */
export async function releaseStuckSending(minutes = 10): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('email_send_queue')
    .update({ status: 'queued' })
    .eq('status', 'sending')
    .lt('updated_at', cutoff)
    .select('id');
  return (data ?? []).length;
}

/** Máximo de e-mails disparados numa única execução do cron. */
export const MAX_PER_TICK = 5;

/** Espaçamento mínimo entre dois envios dentro da mesma execução. */
const SPACING_MS = 1_200;

/**
 * Despacho por SALDO da janela deslizante de 1 hora.
 *
 * A cada execução calculamos quantos e-mails saíram nos últimos 60 minutos e
 * enviamos o que falta para completar a cota (`hourlyLimit`), com no máximo
 * `maxBatch` por execução. Assim, se uma execução do agendador falhar ou
 * atrasar, a seguinte recupera o atraso — sem nunca ultrapassar o limite.
 */
export async function processQueueInternal(
  maxBatch = MAX_PER_TICK,
  hourlyLimit = HOURLY_LIMIT,
) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { computeSendWindow } = await import('@/lib/pipeline/pipeline.server');

  const released = await releaseStuckSending();

  const win = await computeSendWindow(supabaseAdmin as any, hourlyLimit);
  const lastHour = win.sentInWindow;
  const remaining = win.remaining;
  if (remaining === 0) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      released,
      lastHour,
      remaining: 0,
      throttled: true,
      windowStart: win.windowStart,
      windowEnd: win.windowEnd,
      secondsToReset: win.secondsToReset,
    };
  }
  const batch = Math.min(Math.max(1, maxBatch), remaining);

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

  for (let i = 0; i < list.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, SPACING_MS));
    const r = await sendOneNow(list[i]!);
    if (r.ok) sent++;
    else failed++;
  }

  return {
    processed: list.length,
    sent,
    failed,
    released,
    lastHour: lastHour + sent,
    remaining: Math.max(0, remaining - sent),
    throttled: false,
    windowStart: win.windowStart,
    windowEnd: win.windowEnd,
    secondsToReset: win.secondsToReset,
  };
}
