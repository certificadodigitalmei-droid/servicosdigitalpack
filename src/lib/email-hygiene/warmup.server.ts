// Aquecimento automático do domínio de envio.
//
// Domínio novo = reputação zero. Disparar centenas de e-mails logo no
// primeiro dia é o padrão clássico que joga tudo em spam. Aqui o limite
// DIÁRIO sobe sozinho conforme a idade do domínio de envio.

export type WarmupStage = {
  /** Dia inicial (contado a partir do início do aquecimento, base 1). */
  fromDay: number;
  /** Máximo de e-mails por dia nesta fase. */
  perDay: number;
};

/**
 * Teto diário definitivo depois do aquecimento.
 * O objetivo do projeto é 100 e-mails/dia TODOS os dias — volume estável e
 * previsível é exatamente o que o Gmail lê como "remetente legítimo".
 */
export const DAILY_CAP = 100;

/**
 * Escada de aquecimento até 100/dia (conservadora, pensada para Gmail/Outlook).
 * Volume constante e crescimento suave valem mais que volume alto.
 */
export const WARMUP_PLAN: WarmupStage[] = [
  { fromDay: 1, perDay: 15 },
  { fromDay: 3, perDay: 25 },
  { fromDay: 5, perDay: 40 },
  { fromDay: 7, perDay: 55 },
  { fromDay: 9, perDay: 70 },
  { fromDay: 11, perDay: 85 },
  { fromDay: 13, perDay: DAILY_CAP },
];

/** A partir daqui o aquecimento termina e vale o teto diário fixo. */
export const WARMUP_DAYS = 13;

/** Nunca devolve null: mesmo aquecido existe teto diário (proteção de reputação). */
export function dailyLimitForDay(day: number): number {
  if (day >= WARMUP_DAYS) return DAILY_CAP;
  let limit = WARMUP_PLAN[0].perDay;
  for (const stage of WARMUP_PLAN) if (day >= stage.fromDay) limit = stage.perDay;
  return limit;
}

/** Início do dia atual no fuso de São Paulo (UTC-3), em ISO. */
export function startOfLocalDay(now = new Date()): Date {
  const offsetMs = 3 * 60 * 60 * 1000; // UTC-3
  const local = new Date(now.getTime() - offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + offsetMs);
}

export type WarmupStatus = {
  enabled: boolean;
  /** Dia do aquecimento (1 = primeiro dia). */
  day: number;
  totalDays: number;
  startedAt: string | null;
  /** null = aquecimento concluído (sem teto diário). */
  dailyLimit: number | null;
  sentToday: number;
  remainingToday: number;
  /** Limite da próxima fase (informativo). */
  nextLimit: number | null;
  /** true = cota do dia esgotada, envio pausado até amanhã. */
  blocked: boolean;
  reason?: string;
  /** Segundos até a virada do dia (liberação da próxima cota). */
  secondsToReset: number;
};

export async function checkWarmup(): Promise<WarmupStatus> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: cfg } = await supabaseAdmin
    .from('cloud_automation_settings')
    .select('warmup_enabled, warmup_started_at, created_at')
    .eq('id', 1)
    .maybeSingle();

  const row = (cfg ?? {}) as any;
  const enabled = row.warmup_enabled !== false;
  const startedAt: string | null = row.warmup_started_at ?? row.created_at ?? null;

  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const secondsToReset = Math.max(
    0,
    Math.round((dayStart.getTime() + 24 * 3600 * 1000 - now.getTime()) / 1000),
  );

  const startMs = startedAt ? new Date(startedAt).getTime() : now.getTime();
  const day = Math.max(
    1,
    Math.floor((startOfLocalDay(now).getTime() - startOfLocalDay(new Date(startMs)).getTime()) / 86_400_000) + 1,
  );

  const dailyLimit = dailyLimitForDay(day);
  const nextStage = WARMUP_PLAN.find((s) => s.fromDay > day);

  const { count } = await supabaseAdmin
    .from('email_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .like('idempotency_key', 'mass-email-%')
    .gte('updated_at', dayStart.toISOString());

  const sentToday = count ?? 0;

  if (!enabled || dailyLimit === null) {
    return {
      enabled,
      day,
      totalDays: WARMUP_DAYS,
      startedAt,
      dailyLimit: null,
      sentToday,
      remainingToday: 999_999,
      nextLimit: nextStage?.perDay ?? null,
      blocked: false,
      secondsToReset,
    };
  }

  const remainingToday = Math.max(0, dailyLimit - sentToday);
  const blocked = remainingToday <= 0;

  return {
    enabled,
    day,
    totalDays: WARMUP_DAYS,
    startedAt,
    dailyLimit,
    sentToday,
    remainingToday,
    nextLimit: nextStage?.perDay ?? null,
    blocked,
    reason: blocked
      ? `cota de aquecimento do dia ${day} atingida (${sentToday}/${dailyLimit}). O envio volta sozinho amanhã com um limite maior.`
      : undefined,
    secondsToReset,
  };
}
