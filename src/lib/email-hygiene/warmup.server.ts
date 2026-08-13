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

/** Escada de aquecimento (conservadora, pensada para Gmail/Outlook). */
export const WARMUP_PLAN: WarmupStage[] = [
  { fromDay: 1, perDay: 20 },
  { fromDay: 4, perDay: 40 },
  { fromDay: 8, perDay: 80 },
  { fromDay: 15, perDay: 150 },
  { fromDay: 22, perDay: 300 },
  { fromDay: 29, perDay: 600 },
  { fromDay: 36, perDay: 1200 },
];

/** A partir daqui o aquecimento termina e vale só o limite por hora. */
export const WARMUP_DAYS = 42;

export function dailyLimitForDay(day: number): number | null {
  if (day >= WARMUP_DAYS) return null; // aquecido
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
      remainingToday: Number.POSITIVE_INFINITY === 0 ? 0 : 999_999,
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
