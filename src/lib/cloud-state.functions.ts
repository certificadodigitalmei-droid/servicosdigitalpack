import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getCloudState = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('user_cloud_state')
      .select('snapshot, updated_at')
      .eq('user_id', context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      snapshot: (data?.snapshot as Record<string, unknown> | null) ?? null,
      updatedAt: data?.updated_at ?? null,
    };
  });

export const saveCloudState = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { snapshot: Record<string, unknown> }) => {
    if (!input || typeof input.snapshot !== 'object' || input.snapshot === null) {
      throw new Error('snapshot inválido');
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('user_cloud_state')
      .upsert(
        { user_id: context.userId, snapshot: data.snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) throw new Error(error.message);
    return { ok: true, savedAt: new Date().toISOString() };
  });
