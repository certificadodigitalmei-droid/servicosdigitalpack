import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { WarmupStatus } from './warmup.server';
import type { BounceHealth } from './bounce-circuit-breaker.server';

export type GuardOverall = 'ok' | 'atencao' | 'parado';

export type SendGuardStatus = {
  updatedAt: string;
  overall: GuardOverall;
  /** Motivos que estão travando o envio agora. */
  blockers: string[];
  warnings: string[];
  warmup: WarmupStatus;
  bounce: BounceHealth;
  hourly: {
    limit: number;
    safeLimit: number;
    sentInWindow: number;
    remaining: number;
    secondsToReset: number;
    exhausted: boolean;
  };
  queue: {
    status: 'healthy' | 'warning' | 'blocked';
    reason: string | null;
    failureRate: number;
    naFila: number;
    enviando: number;
    falhas: number;
    suprimidos: number;
    enviadosUltimaHora: number;
  };
};

/** Painel de proteção do envio: aquecimento, bounce, cota e saúde da fila. */
export const getSendGuardStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SendGuardStatus> => {
    const [{ checkWarmup }, { checkBounceHealth }, pipeline] = await Promise.all([
      import('./warmup.server'),
      import('./bounce-circuit-breaker.server'),
      import('@/lib/pipeline/pipeline.server'),
    ]);

    const [warmup, bounce, report] = await Promise.all([
      checkWarmup(),
      checkBounceHealth(),
      pipeline.evaluateSendHealth(context.supabase),
    ]);

    const safeLimit = pipeline.safeHourlyLimit(report.window.limit);

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (bounce.blocked) blockers.push(bounce.reason ?? 'taxa de bounce acima do limite seguro');
    if (warmup.blocked) blockers.push(warmup.reason ?? 'cota de aquecimento do dia atingida');
    if (report.status === 'blocked' && report.reason) blockers.push(report.reason);

    if (report.status === 'warning' && report.reason) warnings.push(report.reason);
    if (!bounce.blocked && bounce.rate > 0.01 && bounce.sent >= 10) {
      warnings.push(`bounce em ${(bounce.rate * 100).toFixed(1)}% (limite seguro 2%)`);
    }
    if (!warmup.blocked && warmup.dailyLimit && warmup.remainingToday <= warmup.dailyLimit * 0.2) {
      warnings.push(`restam ${warmup.remainingToday} envios na cota de aquecimento de hoje`);
    }

    return {
      updatedAt: new Date().toISOString(),
      overall: blockers.length ? 'parado' : warnings.length ? 'atencao' : 'ok',
      blockers,
      warnings,
      warmup,
      bounce,
      hourly: {
        limit: report.window.limit,
        safeLimit,
        sentInWindow: report.window.sentInWindow,
        remaining: Math.max(0, safeLimit - report.window.sentInWindow),
        secondsToReset: report.window.secondsToReset,
        exhausted: report.quotaExhausted,
      },
      queue: {
        status: report.status,
        reason: report.reason,
        failureRate: report.failureRate,
        naFila: report.health.naFila,
        enviando: report.health.enviando,
        falhas: report.health.falhas,
        suprimidos: report.health.suprimidos,
        enviadosUltimaHora: report.health.enviadosUltimaHora,
      },
    };
  });

/** Liga/desliga o aquecimento gradual e permite reiniciar a contagem. */
export const setWarmupConfig = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ enabled: z.boolean().optional(), restart: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof data.enabled === 'boolean') payload.warmup_enabled = data.enabled;
    if (data.restart) payload.warmup_started_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('cloud_automation_settings')
      .update(payload as never)
      .eq('id', 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
