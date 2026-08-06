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

    // 429 afeta APENAS este item (já reagendado acima). A fila inteira
    // não é mais congelada — isso derrubava o ritmo para bem menos de 100/h.



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

/** Modo único: no máximo 1 e-mail por execução do agendador. */
export const MAX_PER_TICK = 1;

/** Espaçamento padrão entre dois envios (36 s = 100 e-mails por hora). */
export const DEFAULT_SPACING_SEC = 36;

/** Horário do último e-mail enviado com sucesso. */
async function lastSentAt(): Promise<number | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('email_send_queue')
    .select('updated_at')
    .eq('status', 'sent')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.updated_at ? new Date(data.updated_at).getTime() : null;
}

/**
 * Libera itens que ficaram com espera agendada por causa de 429 antigo
 * (o congelamento em massa da fila foi removido).
 */
export async function clearRateLimitHolds(): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('email_send_queue')
    .update({ next_retry_at: null })
    .in('status', ['queued', 'pending'])
    .eq('last_status_code', 429)
    .not('next_retry_at', 'is', null)
    .select('id');
  return (data ?? []).length;
}

/**
 * Modo ÚNICO de envio: 1 e-mail a cada `spacingSec` segundos (padrão 36 s),
 * o que dá 100 e-mails por hora, sem lote e sem paralelismo.
 *
 * O teto da janela deslizante de 1 hora continua valendo como segurança.
 */
export async function processQueueInternal(
  _maxBatch = MAX_PER_TICK,
  hourlyLimit = HOURLY_LIMIT,
  spacingSec = DEFAULT_SPACING_SEC,
) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { computeSendWindow } = await import('@/lib/pipeline/pipeline.server');

  const released = await releaseStuckSending();

  const win = await computeSendWindow(supabaseAdmin as any, hourlyLimit);
  const lastHour = win.sentInWindow;
  const remaining = win.remaining;
  const base = {
    processed: 0,
    sent: 0,
    failed: 0,
    released,
    rateLimited: false,
    retryAfterSec: 0,
    lastHour,
    remaining,
    windowStart: win.windowStart,
    windowEnd: win.windowEnd,
    secondsToReset: win.secondsToReset,
  };

  if (remaining === 0) return { ...base, throttled: true };

  // O limite devolvido pelo Gmail vale para o remetente, não apenas para uma
  // mensagem. Enquanto existir um 429 recente ainda aguardando liberação, não
  // tentamos outros destinatários: isso evita criar uma sequência infinita de
  // novos 429 e permite que o provedor realmente libere a conta.
  const { data: activeRateLimit } = await supabaseAdmin
    .from('email_send_queue')
    .select('next_retry_at')
    .in('status', ['queued', 'pending'])
    .eq('last_status_code', 429)
    .gt('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeRateLimit?.next_retry_at) {
    const retryAt = new Date(activeRateLimit.next_retry_at).getTime();
    return {
      ...base,
      throttled: true,
      rateLimited: true,
      retryAfterSec: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)),
      nextRetryAt: activeRateLimit.next_retry_at,
    };
  }

  // Espaçamento: só envia se já passou o intervalo desde o último envio.
  const last = await lastSentAt();
  if (last !== null && Date.now() - last < spacingSec * 1000) {
    return { ...base, throttled: true, waitingSpacing: true };
  }

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('email_send_queue')
    .select('id, to_email, subject, html, text, attempts')
    .in('status', ['queued', 'pending'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);

  const row = (rows ?? [])[0] as QueueRow | undefined;
  if (!row) return { ...base, throttled: false };

  let sent = 0;
  let failed = 0;
  let rateLimited = false;
  let retryAfterSec = 0;

  const r = await sendOneNow(row);
  if (r.ok) sent++;
  else if ((r as any).rateLimited) {
    rateLimited = true;
    retryAfterSec = (r as any).retryAfterSec ?? 60;
  } else failed++;


  return {
    processed: 1,
    sent,
    failed,
    released,
    rateLimited,
    retryAfterSec,
    lastHour: lastHour + sent,
    remaining: Math.max(0, remaining - sent),
    throttled: false,
    windowStart: win.windowStart,
    windowEnd: win.windowEnd,
    secondsToReset: win.secondsToReset,
  };
}

