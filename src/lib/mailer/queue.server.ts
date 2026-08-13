// Server-only: processa a fila de e-mails pela infraestrutura da Lovable.
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
  const { sendMailMessage, MailError } = await import('./mailer.server');
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
    const result = await sendMailMessage({
      to: row.to_email,
      subject: row.subject,
      html: row.html ?? undefined,
      text: row.text ?? undefined,
      idempotencyKey: qRow?.idempotency_key ?? undefined,
      label: 'campanha-massa',
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
    const err = e as InstanceType<typeof MailError>;
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

/** Ritmo nominal exibido no painel (36 s entre envios = cerca de 100/h). */
export const HOURLY_LIMIT = 100;

/** Quantos e-mails principais saíram na última hora (somente métrica). */
export async function sentInLastHour(): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('email_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .like('idempotency_key', 'mass-email-%')
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
    .like('idempotency_key', 'mass-email-%')
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
 * Recupera automaticamente somente falhas técnicas temporárias, com teto por
 * ciclo e respeitando o tempo de espera pedido pelo provedor. Endereço
 * inválido e outras falhas definitivas permanecem visíveis para correção.
 */
export const MAX_RECOVER_PER_TICK = 10;

export async function recoverRetryableFailures(): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const nowIso = new Date().toISOString();
  const { data: candidates } = await supabaseAdmin
    .from('email_send_queue')
    .select('id')
    .eq('status', 'failed')
    .like('idempotency_key', 'mass-email-%')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .or('last_status_code.eq.429,last_status_code.gte.500,last_error.ilike.%oauth_refresh_failed%')
    .limit(MAX_RECOVER_PER_TICK);

  const ids = (candidates ?? []).map((r: any) => r.id);
  if (ids.length === 0) return 0;

  const { data } = await supabaseAdmin
    .from('email_send_queue')
    .update({ status: 'queued', next_retry_at: null })
    .in('id', ids)
    .select('id');
  return (data ?? []).length;
}


/** Verifica se o endereço consta na lista de supressão local. */
async function isSuppressed(email: string): Promise<boolean> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin
    .from('suppression_list')
    .select('email')
    .eq('email', normalized)
    .maybeSingle();
  return !!data;
}

/**
 * Modo ÚNICO de envio: 1 e-mail a cada `spacingSec` segundos (padrão 36 s).
 *
 * Duas travas garantem que o limite por hora NUNCA é ultrapassado:
 *  1. espaçamento mínimo entre dois envios;
 *  2. janela deslizante de 60 min lida do banco (vale para todas as abas),
 *     com margem de segurança abaixo do teto do provedor.
 */
export async function processQueueInternal(
  _maxBatch = MAX_PER_TICK,
  hourlyLimit = HOURLY_LIMIT,
  spacingSec = DEFAULT_SPACING_SEC,
) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { computeSendWindow, safeHourlyLimit } = await import('@/lib/pipeline/pipeline.server');

  const released = await releaseStuckSending();
  const recovered = await recoverRetryableFailures();
  const lastHour = await sentInLastHour();
  const win = await computeSendWindow(supabaseAdmin as any, hourlyLimit);
  const safeLimit = safeHourlyLimit(hourlyLimit);

  const base = {
    processed: 0,
    sent: 0,
    failed: 0,
    released,
    recovered,
    rateLimited: false,
    retryAfterSec: 0,
    lastHour,
    remaining: Math.max(0, safeLimit - win.sentInWindow),
    windowStart: win.windowStart,
    windowEnd: win.windowEnd,
    secondsToReset: win.secondsToReset,
    quotaExhausted: false,
  };

  // Trava de reputação: bounce alto = todos os e-mails passam a cair em spam.
  {
    const { checkBounceHealth } = await import(
      '@/lib/email-hygiene/bounce-circuit-breaker.server'
    );
    const health = await checkBounceHealth();
    if (health.blocked) {
      return {
        ...base,
        throttled: true,
        waitingSpacing: false,
        quotaExhausted: false,
        bounceBlocked: true,
        bounceRate: health.rate,
        bounceReason: health.reason,
      };
    }
  }

  // Aquecimento do domínio: teto DIÁRIO que cresce com a idade do domínio.
  {
    const { checkWarmup } = await import('@/lib/email-hygiene/warmup.server');
    const warm = await checkWarmup();
    if (warm.blocked) {
      return {
        ...base,
        throttled: true,
        waitingSpacing: false,
        quotaExhausted: false,
        warmupBlocked: true,
        warmupDay: warm.day,
        warmupDailyLimit: warm.dailyLimit,
        warmupSentToday: warm.sentToday,
        warmupReason: warm.reason,
      };
    }
  }

  // Trava rígida: cota da hora (com margem) esgotada -> nada sai.
  if (win.sentInWindow >= safeLimit) {
    return { ...base, throttled: true, waitingSpacing: false, quotaExhausted: true };
  }


  // Espaçamento: só envia se já passou o intervalo desde o último envio.
  const last = await lastSentAt();
  if (last !== null && Date.now() - last < spacingSec * 1000) {
    return { ...base, throttled: true, waitingSpacing: true };
  }


  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('email_send_queue')
    .select('id, to_email, subject, html, text, attempts, idempotency_key')
    .in('status', ['queued', 'pending'])
    .like('idempotency_key', 'mass-email-%')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(_maxBatch);
  if (error) throw new Error(error.message);

  const row = (rows ?? [])[0] as (QueueRow & { idempotency_key?: string }) | undefined;
  if (!row) return { ...base, throttled: false };

  // Nunca envia para endereços suprimidos localmente (bounce/complaint/unsubscribe).
  // Isso protege a reputação do domínio e evita loops de reenvio.
  if (await isSuppressed(row.to_email)) {
    await supabaseAdmin
      .from('email_send_queue')
      .update({ status: 'suppressed', last_error: 'destinatário suprimido (bounce/complaint/unsubscribe)' })
      .eq('id', row.id);
    return { ...base, processed: 1, throttled: false };
  }

  // VARREDURA ANTES DO ENVIO: sintaxe, domínio temporário, erro de digitação
  // e existência de servidor de e-mail (MX). Havendo risco de bounce, o envio
  // é cancelado e a empresa (importação + links) é apagada e bloqueada.
  {
    const { assessBounceRisk, discardRiskyCompany } = await import(
      '@/lib/email-hygiene/pre-send-scan.server'
    );
    const verdict = await assessBounceRisk(row.to_email);
    if (!verdict.ok) {
      const companyId = row.idempotency_key?.startsWith('mass-email-')
        ? row.idempotency_key.slice('mass-email-'.length)
        : null;
      const reason = verdict.reason ?? 'risco de bounce';
      // marca antes de descartar para o registro sobreviver à limpeza
      await supabaseAdmin
        .from('email_send_queue')
        .update({ status: 'suppressed', last_error: `varredura pré-envio: ${reason}`.slice(0, 500) })
        .eq('id', row.id);
      await discardRiskyCompany(verdict.email, reason, companyId);
      return { ...base, processed: 1, throttled: false };
    }
  }


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
    recovered,
    rateLimited,
    retryAfterSec,
    lastHour: lastHour + sent,
    remaining: Math.max(0, safeLimit - (win.sentInWindow + sent)),
    throttled: false,
    windowStart: win.windowStart,
    windowEnd: win.windowEnd,
    secondsToReset: win.secondsToReset,
    quotaExhausted: false,
  };

}

