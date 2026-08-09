// Consulta server-only da saúde da conta WhatsApp (número + WABA) via ChakraHQ/Meta.
// A chave da API nunca é exposta ao cliente nem registrada em logs.

import { extractErrorMessage } from './chakra.server';
import { emptyHealth, parseHealthPayload, type AccountHealth } from './health-logic';

const PHONE_FIELDS =
  'display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,status,platform_type,throughput';
const WABA_FIELDS = 'name,account_review_status,status,message_template_namespace';

async function getJson(
  url: string,
  apiKey: string,
  doFetch: typeof fetch,
): Promise<{ json: any; error: string | null }> {
  try {
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* resposta não-JSON */
    }
    if (!res.ok) return { json: null, error: `[${res.status}] ${extractErrorMessage(json, text)}` };
    return { json, error: null };
  } catch (e: any) {
    return { json: null, error: `falha de rede: ${e?.message ?? 'desconhecida'}` };
  }
}

export async function fetchAccountHealth(opts: {
  apiBaseUrl: string;
  apiKey: string;
  apiVersion: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  fetchImpl?: typeof fetch;
}): Promise<AccountHealth> {
  const base = (opts.apiBaseUrl || 'https://api.chakrahq.com').replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const prefix = `${base}/v1/ext/plugin/whatsapp/api/${opts.apiVersion}`;

  if (!opts.phoneNumberId && !opts.wabaId) {
    return emptyHealth('Conexão incompleta: informe Phone Number ID e WABA ID.');
  }

  const [phone, waba] = await Promise.all([
    opts.phoneNumberId
      ? getJson(`${prefix}/${opts.phoneNumberId}?fields=${PHONE_FIELDS}`, opts.apiKey, doFetch)
      : Promise.resolve({ json: null, error: null as string | null }),
    opts.wabaId
      ? getJson(`${prefix}/${opts.wabaId}?fields=${WABA_FIELDS}`, opts.apiKey, doFetch)
      : Promise.resolve({ json: null, error: null as string | null }),
  ]);

  const error = phone.error ?? waba.error ?? null;
  return parseHealthPayload(phone.json, waba.json, error);
}

// Cache curto: o painel pode atualizar sem martelar a API.
let cache: { at: number; value: AccountHealth } | null = null;
const TTL_MS = 60_000;

export async function loadAccountHealth(force = false): Promise<AccountHealth> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const apiKey = process.env['CHAKRA_API_KEY'];
  if (!apiKey) return emptyHealth('Chave da API não configurada no servidor.');

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: cfg } = await (supabaseAdmin as any)
    .from('whatsapp_api_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (!cfg) return emptyHealth('Configuração da conta não encontrada.');

  const value = await fetchAccountHealth({
    apiBaseUrl: cfg.base_url,
    apiKey,
    apiVersion: cfg.whatsapp_api_version ?? 'v19.0',
    phoneNumberId: cfg.whatsapp_phone_number_id ?? null,
    wabaId: cfg.waba_id ?? null,
  });
  cache = { at: Date.now(), value };
  return value;
}
