import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { PipelineState, PendingSendRow } from './pipeline.server';

export type { PipelineState, PendingSendRow };

/** Estado único do funil: importadas -> links -> fila -> enviados (com a trava de importação). */
export const getPipelineState = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PipelineState> => {
    const { computePipelineState } = await import('./pipeline.server');
    return computePipelineState(context.supabase);
  });

/** Links já gerados aguardando entrar na fila de envio. */
export const getPendingSendTargets = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().min(1).max(200).optional() }).parse(data ?? {}),
  )
  .handler(async ({ context, data }): Promise<PendingSendRow[]> => {
    const { listPendingSendTargets } = await import('./pipeline.server');
    return listPendingSendTargets(context.supabase, data.limit ?? 50);
  });

/** Empresas importadas que ainda não têm link gerado. */
export const getCompaniesWithoutLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().min(1).max(200).optional() }).parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { listCompaniesWithoutLink } = await import('./pipeline.server');
    return listCompaniesWithoutLink(context.supabase, data.limit ?? 50);
  });

/** Fila única do painel (importadas + links prontos + fila de envio). */
export const getUnifiedQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().min(1).max(300).optional() }).parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { listUnifiedQueue } = await import('./pipeline.server');
    return listUnifiedQueue(context.supabase, data.limit ?? 100);
  });

/** Saúde do envio: enviados, erros e rate limit (HTTP 429). */
export const getSendHealth = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { computeSendHealth } = await import('./pipeline.server');
    return computeSendHealth(context.supabase);
  });

/** Configurações do fluxo (lote de importação e ritmo de envio). */
export const getFlowSettings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readFlowSettings } = await import('./pipeline.server');
    return readFlowSettings(context.supabase);
  });

export const updateFlowSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        importBatchSize: z.number().int().min(1).max(500).optional(),
        sendMode: z.enum(['burst', 'paced']).optional(),
        hourlyBatchSize: z.number().int().min(1).max(1000).optional(),
        pacedDelaySec: z.number().int().min(1).max(3600).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { id: 1 };
    if (data.importBatchSize !== undefined) patch.import_batch_size = data.importBatchSize;
    if (data.sendMode !== undefined) patch.send_mode = data.sendMode;
    if (data.hourlyBatchSize !== undefined) patch.hourly_batch_size = data.hourlyBatchSize;
    if (data.pacedDelaySec !== undefined) patch.paced_delay_sec = data.pacedDelaySec;
    const { error } = await context.supabase
      .from('cloud_automation_settings')
      .upsert(patch as any, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    const { readFlowSettings } = await import('./pipeline.server');
    return readFlowSettings(context.supabase);
  });
