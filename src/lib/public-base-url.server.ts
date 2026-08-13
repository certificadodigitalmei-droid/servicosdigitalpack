import {
  getPublicBaseUrl,
  isUsablePublicOrigin,
  setRuntimePublicBaseUrl,
} from '@/lib/public-base-url';

let cachedAt = 0;
const TTL_MS = 60_000;

/**
 * Carrega o domínio público atual (persistido em site_settings.public_base_url
 * sempre que o site é aberto no domínio real) e o aplica no resolvedor global.
 * Assim, e-mails enviados pelo servidor/cron usam sempre o domínio atual.
 */
export async function ensurePublicBaseUrl(): Promise<string> {
  if (Date.now() - cachedAt < TTL_MS) return getPublicBaseUrl();
  cachedAt = Date.now();
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('public_base_url')
      .not('public_base_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRuntimePublicBaseUrl((data as any)?.public_base_url ?? null);
  } catch (err) {
    console.error('[public-base-url] falha ao carregar domínio atual', err);
  }
  return getPublicBaseUrl();
}

/** Persiste a origem detectada no navegador para uso pelos envios automáticos. */
export async function persistPublicBaseUrl(origin: string): Promise<string> {
  if (!isUsablePublicOrigin(origin)) return getPublicBaseUrl();
  const normalized = origin.trim().replace(/\/+$/, '');
  setRuntimePublicBaseUrl(normalized);
  cachedAt = Date.now();
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: existing } = await supabaseAdmin
    .from('site_settings')
    .select('id, public_base_url')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    if ((existing as any).public_base_url === normalized) return normalized;
    await supabaseAdmin
      .from('site_settings')
      .update({ public_base_url: normalized, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('site_settings').insert({ public_base_url: normalized } as any);
  }
  return normalized;
}
