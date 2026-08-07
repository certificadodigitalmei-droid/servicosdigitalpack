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
  provider_type: 'mercadopago';
  environment: 'test' | 'production';
  public_key_masked: string;
  secret_key_masked: string;
  has_webhook_secret: boolean;
  base_url: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mask(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(6)}${key.slice(-4)}`;
}

function splitKeys(apiKey: string): { publicKey: string; secretKey: string } {
  const [publicKey = '', secretKey = ''] = (apiKey || '').split('|');
  return { publicKey: publicKey.trim(), secretKey: secretKey.trim() };
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
    return (data ?? []).map((g: any) => {
      const { publicKey, secretKey } = splitKeys(g.api_key);
      return {
        id: g.id,
        name: g.name,
        provider_type: g.provider_type,
        environment: g.environment ?? 'test',
        public_key_masked: mask(publicKey),
        secret_key_masked: mask(secretKey),
        // Nunca devolvemos o segredo do webhook ao frontend, apenas se existe.
        has_webhook_secret: Boolean(g.webhook_secret),
        base_url: g.base_url,
        is_active: g.is_active,
        notes: g.notes,
        created_at: g.created_at,
        updated_at: g.updated_at,
      };
    }) as PaymentGateway[];
  });

export const upsertPaymentGateway = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(120),
        provider_type: z.literal('mercadopago').default('mercadopago'),
        environment: z.enum(['test', 'production']).default('test'),
        public_key: z.string().min(4).max(300).optional(),
        secret_key: z.string().min(4).max(300).optional(),
        webhook_secret: z.string().min(4).max(500).optional(),
        base_url: z.string().url().max(300).optional().or(z.literal('')),
        notes: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    if (data.id) {
      const patch: any = {
        name: data.name,
        provider_type: data.provider_type,
        environment: data.environment,
        base_url: data.base_url && data.base_url.length > 0 ? data.base_url : null,
        notes: data.notes ?? null,
      };
      if (data.webhook_secret?.trim()) patch.webhook_secret = data.webhook_secret.trim();
      if (data.public_key || data.secret_key) {
        // Merge com valores atuais quando um dos dois vier em branco.
        const { data: existing } = await supabaseAdmin
          .from('payment_gateways')
          .select('api_key')
          .eq('id', data.id)
          .maybeSingle();
        const current = splitKeys(existing?.api_key || '');
        const pub = data.public_key?.trim() || current.publicKey;
        const sec = data.secret_key?.trim() || current.secretKey;
        if (!pub || !sec) throw new Error('Informe as duas credenciais');
        patch.api_key = `${pub}|${sec}`;
      }
      const { error } = await supabaseAdmin.from('payment_gateways').update(patch).eq('id', data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    if (!data.public_key || !data.secret_key) {
      throw new Error('Informe as duas credenciais');
    }
    const combined = `${data.public_key.trim()}|${data.secret_key.trim()}`;
    const { data: inserted, error } = await supabaseAdmin
      .from('payment_gateways')
      .insert({
        name: data.name,
        provider_type: data.provider_type,
        environment: data.environment,
        api_key: combined,
        webhook_secret: data.webhook_secret?.trim() || null,
        base_url: data.base_url && data.base_url.length > 0 ? data.base_url : null,
        notes: data.notes ?? null,
        is_active: false,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

/** Testa a conexão com o provedor usando as credenciais já salvas. */
export const testPaymentGatewayConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: row, error } = await supabaseAdmin
      .from('payment_gateways')
      .select('api_key, base_url, provider_type')
      .eq('id', data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error('Gateway não encontrado');

    if (row.provider_type === 'mercadopago') {
      const { testMercadoPagoCredentials } = await import('@/lib/payments/mercadopago.server');
      return await testMercadoPagoCredentials(row.api_key, row.base_url);
    }
    return { ok: false, message: 'Provedor não suportado. Use o Mercado Pago.' };

  });



export const activatePaymentGateway = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
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

/** Desativa um gateway (nenhum provedor fica ativo até que outro seja escolhido). */
export const deactivatePaymentGateway = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('payment_gateways')
      .update({ is_active: false })
      .eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
