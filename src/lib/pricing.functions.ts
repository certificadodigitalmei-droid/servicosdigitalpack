import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type PricingSettings = {
  product_amount: number; // em reais (ex: 97.00)
};

export const DEFAULT_PRICING: PricingSettings = {
  product_amount: 97.0,
};

export const getPricing = createServerFn({ method: 'GET' }).handler(async (): Promise<PricingSettings> => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('product_amount')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const raw = data?.product_amount;
  const amount = raw != null ? Number(raw) : DEFAULT_PRICING.product_amount;
  return { product_amount: Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_PRICING.product_amount };
});

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

export const savePricing = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        product_amount: z
          .number({ invalid_type_error: 'Valor inválido' })
          .positive('Valor deve ser maior que zero')
          .max(100000, 'Valor muito alto'),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: existing } = await supabaseAdmin
      .from('site_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('site_settings')
        .update({ product_amount: data.product_amount, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from('site_settings')
        .insert({ product_amount: data.product_amount });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
