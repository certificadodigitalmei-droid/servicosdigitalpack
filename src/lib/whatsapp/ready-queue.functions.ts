import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

export const getWaReadyOverview = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
        status: z.enum(['ready', 'reserved', 'sent']).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getReadyCounts, listReadyQueue } = await import('./ready-queue.server');
    const [counts, list] = await Promise.all([
      getReadyCounts(),
      listReadyQueue({
        page: data.page,
        pageSize: data.pageSize,
        ...(data.status ? { status: data.status } : {}),
      }),
    ]);
    return { counts, ...list, page: data.page, pageSize: data.pageSize };
  });

/** Prévia (não grava) ou aplicação explícita da reconciliação das empresas já importadas. */
export const reconcileWaReadyQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ apply: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { reconcileReadyQueue } = await import('./ready-queue.server');
    return reconcileReadyQueue({ apply: data.apply });
  });
