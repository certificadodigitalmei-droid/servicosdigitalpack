import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type {
  PipelineState,
  PendingSendRow,
  UnifiedQueueRow,
  QueueStage,
  SendHealth,
  SendWindow,
  FlowSettings,
} from './pipeline.server';

export type {
  PipelineState,
  PendingSendRow,
  UnifiedQueueRow,
  QueueStage,
  SendHealth,
  SendWindow,
  FlowSettings,
};

/** Janela de 1 hora ancorada no primeiro e-mail enviado. */
export const getSendWindow = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SendWindow> => {
    const { computeSendWindow } = await import('./pipeline.server');
    return computeSendWindow(context.supabase);
  });



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
        hourlyBatchSize: z.number().int().min(1).max(1000).optional(),
        pacedDelaySec: z.number().int().min(1).max(3600).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { readFlowSettings } = await import('./pipeline.server');
    const patch: Record<string, unknown> = {
      id: 1,
      // Modo único: espaçado, sem paralelismo.
      send_mode: 'paced',
      send_profile: 'moderado',
      burst_concurrency: 1,
    };

    // Lote e envio são o MESMO número; o intervalo é derivado (3600/lote).
    const batch = data.hourlyBatchSize ?? data.importBatchSize;
    if (batch !== undefined) {
      patch.hourly_batch_size = batch;
      patch.import_batch_size = batch;
      patch.paced_delay_sec = Math.max(1, Math.round(3600 / batch));
    }


    const { error } = await context.supabase
      .from('cloud_automation_settings')
      .upsert(patch as any, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    return readFlowSettings(context.supabase);
  });
