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
