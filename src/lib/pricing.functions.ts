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

export type LinkPricing = {
  amount: number;
  originalAmount: number;
  discounted: boolean;
  discountExpiresAt: string | null;
};

/**
 * Preço efetivo de um link público: aplica o desconto promocional da campanha
 * quando ele existir e ainda estiver válido.
 */
export const getLinkPricing = createServerFn({ method: 'GET' })
  .inputValidator((input) => z.object({ token: z.string().max(200) }).parse(input))
  .handler(async ({ data }): Promise<LinkPricing> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: settings } = await supabaseAdmin
      .from('site_settings')
      .select('product_amount')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (settings as any)?.product_amount;
    const base =
      raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0
        ? Number(raw)
        : DEFAULT_PRICING.product_amount;

    const { data: link } = await supabaseAdmin
      .from('company_links')
      .select('discount_amount_cents, discount_expires_at')
      .eq('public_token', data.token)
      .maybeSingle();

    const cents = (link as any)?.discount_amount_cents as number | null | undefined;
    const exp = (link as any)?.discount_expires_at as string | null | undefined;
    const valid = !!cents && cents > 0 && (!exp || new Date(exp).getTime() > Date.now());

    return {
      amount: valid ? cents! / 100 : base,
      originalAmount: base,
      discounted: valid,
      discountExpiresAt: valid ? (exp ?? null) : null,
    };
  });
