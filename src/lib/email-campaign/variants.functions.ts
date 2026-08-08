import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const loadCampaignVariantSelection = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ variantIds: string[]; updatedAt: string | null }> => {
    const { data, error } = await context.supabase
      .from('campaign_variant_settings')
      .select('variant_ids, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      variantIds: Array.isArray(data?.variant_ids) ? (data!.variant_ids as string[]) : [],
      updatedAt: (data?.updated_at as string) ?? null,
    };
  });

export const saveCampaignVariantSelection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ variantIds: z.array(z.string().max(60)).max(50) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from('campaign_variant_settings')
      .upsert(
        { id: 1, variant_ids: data.variantIds, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
