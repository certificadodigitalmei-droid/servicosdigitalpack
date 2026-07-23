// Server functions to manage payment gateway configurations (admin only).
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

export type PaymentGateway = {
  id: string;
  name: string;
  provider_type: 'uniaopay' | 'nexuspay';
  api_key_masked: string;
  base_url: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mask(key: string): string {
  if (!key) return '';
  if (key === 'USE_ENV_UNIAOPAY_API_KEY') return '••• (secret UNIAOPAY_API_KEY)';
  if (key.length <= 12) return '•'.repeat(key.length);
  return `${key.slice(0, 6)}${'•'.repeat(8)}${key.slice(-4)}`;
}

export const listPaymentGateways = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin
      .from('payment_gateways')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      provider_type: g.provider_type,
      api_key_masked: mask(g.api_key),
      base_url: g.base_url,
      is_active: g.is_active,
      notes: g.notes,
      created_at: g.created_at,
      updated_at: g.updated_at,
    })) as PaymentGateway[];
  });

export const upsertPaymentGateway = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(120),
        provider_type: z.enum(['uniaopay', 'nexuspay']),
        api_key: z.string().min(6).max(500).optional(),
        base_url: z.string().url().max(300).optional().or(z.literal('')),
        notes: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const patch: Record<string, unknown> = {
      name: data.name,
      provider_type: data.provider_type,
      base_url: data.base_url && data.base_url.length > 0 ? data.base_url : null,
      notes: data.notes ?? null,
    };
    if (data.api_key) patch.api_key = data.api_key;

    if (data.id) {
      const patch: any = {
        name: data.name,
        provider_type: data.provider_type,
        base_url: data.base_url && data.base_url.length > 0 ? data.base_url : null,
        notes: data.notes ?? null,
      };
      if (data.api_key) patch.api_key = data.api_key;
      const { error } = await supabaseAdmin.from('payment_gateways').update(patch).eq('id', data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    if (!data.api_key) throw new Error('api_key é obrigatório ao cadastrar');
    const { data: inserted, error } = await supabaseAdmin
      .from('payment_gateways')
      .insert({
        name: data.name,
        provider_type: data.provider_type,
        api_key: data.api_key,
        base_url: data.base_url && data.base_url.length > 0 ? data.base_url : null,
        notes: data.notes ?? null,
        is_active: false,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });


export const activatePaymentGateway = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // desativa todos e ativa apenas o escolhido
    const { error: e1 } = await supabaseAdmin
      .from('payment_gateways')
      .update({ is_active: false })
      .neq('id', data.id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from('payment_gateways')
      .update({ is_active: true })
      .eq('id', data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const deletePaymentGateway = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: row } = await supabaseAdmin
      .from('payment_gateways')
      .select('is_active')
      .eq('id', data.id)
      .maybeSingle();
    if (row?.is_active) throw new Error('Não é possível excluir o gateway ativo. Ative outro antes.');
    const { error } = await supabaseAdmin.from('payment_gateways').delete().eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
