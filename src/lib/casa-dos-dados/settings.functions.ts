import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

function mask(v: string | null | undefined) {
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!data) throw new Error('Acesso restrito a administradores');
}

export const getCasaDosDadosSettings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin
      .from('casa_dos_dados_settings')
      .select('api_base_url, api_key, updated_at')
      .eq('id', 1)
      .maybeSingle();
    const row = (data ?? null) as { api_base_url: string | null; api_key: string | null; updated_at: string | null } | null;
    return {
      api_base_url: row?.api_base_url ?? '',
      api_key_preview: mask(row?.api_key),
      has_api_key: !!(row?.api_key && row.api_key.length > 0),
      updated_at: row?.updated_at ?? null,
      env_fallback: {
        api_base_url: process.env.CASA_DOS_DADOS_API_BASE_URL ?? '',
        has_api_key: !!process.env.CASA_DOS_DADOS_API_KEY,
      },
    };
  });

export const saveCasaDosDadosSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        api_base_url: z.string().trim().min(1).max(500).url(),
        api_key: z.string().trim().min(1).max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const patch: Record<string, unknown> = {
      api_base_url: data.api_base_url,
      updated_at: new Date().toISOString(),
    };
    if (data.api_key !== undefined) patch.api_key = data.api_key;
    const { error } = await supabaseAdmin
      .from('casa_dos_dados_settings')
      .update(patch)
      .eq('id', 1);
    if (error) throw new Error(error.message);
    const { invalidateCasaCredsCache } = await import('./client.server');
    invalidateCasaCredsCache();
    return { ok: true };
  });

export const testCasaDosDadosConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    try {
      const { checkSaldo, invalidateCasaCredsCache } = await import('./client.server');
      invalidateCasaCredsCache();
      const r = await checkSaldo({ timeoutMs: 10_000 });
      return { ok: r.ok, status: r.status, body: r.body };
    } catch (err: any) {
      return { ok: false, status: 0, body: err?.message ?? String(err) };
    }
  });
