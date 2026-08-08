import { extractValidBrazilianMobile, validateBrazilianMobile } from '@/lib/phone/brazilian-mobile';

// Helpers server-only para envio oficial de WhatsApp via ChakraHQ (WhatsApp Business API).
// Nunca registrar o Bearer token em logs ou mensagens de erro.

export type WaApiSettings = {
  id: number;
  provider: string;
  base_url: string;
  template_name: string | null;
  template_language: string;
  template_body: string | null;
  template_status: string;
  plugin_id: string | null;
  whatsapp_phone_number_id: string | null;
  waba_id: string | null;
  whatsapp_api_version: string;
  button_base_url: string;
  active: boolean;
  daily_limit: number;
  batch_size: number;
  min_delay_ms: number;
  last_error: string | null;
};

export function normalizePhone(raw: string | null | undefined, ddd?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  // Remove prefixo internacional 55 já presente (evita duplicar depois)
  let national = digits;
  if (national.length > 11 && national.startsWith('55')) national = national.slice(2);

  // Completa com o DDD separado apenas se ainda for número local (8 ou 9 dígitos)
  if ((national.length === 8 || national.length === 9) && ddd) {
    const d = String(ddd).replace(/\D/g, '');
    if (d.length === 2) national = d + national;
  }

  // Remove DDD duplicado (ex.: 1111999999999)
  if (
    (national.length === 12 || national.length === 13) &&
    national.slice(0, 2) === national.slice(2, 4)
  ) {
    national = national.slice(2);
  }

  if (national.length !== 10 && national.length !== 11) return null;
  return '55' + national;
}

export function pickCompanyPhone(company: { ddd?: string | null; telefones?: unknown }): string | null {
  const list = Array.isArray(company.telefones) ? (company.telefones as any[]) : [];
  const celular = list.find((t) => String(t?.tipo ?? '').toLowerCase() === 'celular') ?? list[0];
  return normalizePhone(celular?.numero ?? null, celular?.ddd ?? company.ddd ?? null);
}

export function formatCnpj(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return String(raw ?? '').trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function renderTemplateBody(body: string | null, vars: string[]): string {
  if (!body) return vars.join(' | ');
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, i) => vars[Number(i) - 1] ?? '');
}

export function buildSendTemplateUrl(apiBaseUrl: string, pluginId: string, phone: string): string {
  const base = (apiBaseUrl || 'https://api.chakrahq.com').replace(/\/+$/, '');
  return `${base}/v1/ext/plugin/whatsapp/${pluginId}/phoneNumber/${phone}/send-template-message`;
}

export function extractMessageId(json: any): string | null {
  const d = json?._data ?? {};
  const id =
    d.externalId ??
    d.id ??
    d.whatsappMessageId ??
    json?.messages?.[0]?.id ??
    json?.message_id ??
    json?.id ??
    json?.data?.id ??
    null;
  return id ? String(id) : null;
}

export function extractErrorMessage(json: any, fallback: string): string {
  const errs = json?._errors ?? json?.errors ?? null;
  if (Array.isArray(errs) && errs.length) {
    return errs
      .map((e: any) => e?.message ?? e?.detail ?? e?.code ?? (typeof e === 'string' ? e : JSON.stringify(e)))
      .join(' | ')
      .slice(0, 500);
  }
  if (errs && typeof errs === 'object') {
    return String(errs.message ?? JSON.stringify(errs)).slice(0, 500);
  }
  const single = json?.error?.message ?? json?.message ?? null;
  if (single) return String(single).slice(0, 500);
  return fallback.slice(0, 500);
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

export async function sendChakraTemplate(opts: {
  apiBaseUrl: string;
  apiKey: string;
  pluginId: string;
  whatsappPhoneNumberId: string;
  to: string;
  templateName: string;
  language: string;
  razao: string;
  cnpj: string;
  buttonToken: string;
  fetchImpl?: typeof fetch;
}): Promise<SendResult> {
  if (!opts.pluginId) return { ok: false, error: 'Plugin ID não configurado' };
  if (!opts.whatsappPhoneNumberId) return { ok: false, error: 'Phone Number ID não configurado' };
  if (!opts.buttonToken) return { ok: false, error: 'Item sem token de link — envio bloqueado' };
  if (!normalizePhone(opts.to)) return { ok: false, error: 'Telefone inválido — envio bloqueado' };
  if (!String(opts.razao ?? '').trim()) return { ok: false, error: 'Item sem razão social — envio bloqueado' };
  if (!String(opts.cnpj ?? '').trim()) return { ok: false, error: 'Item sem CNPJ — envio bloqueado' };

  const url = buildSendTemplateUrl(opts.apiBaseUrl, opts.pluginId, opts.to);
  const payload = {
    whatsappPhoneNumberId: opts.whatsappPhoneNumberId,
    templateName: opts.templateName,
    mapping: [
      { schemaPropertyName: 'razao', schemaPropertyValue: String(opts.razao).trim() },
      { schemaPropertyName: 'cnpj', schemaPropertyValue: formatCnpj(opts.cnpj) },
    ],
    buttonMapping: [{ schemaPropertyName: '1', schemaPropertyValue: opts.buttonToken }],
    language: opts.language,
  };


  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    return { ok: false, error: `falha de rede: ${e?.message ?? 'desconhecida'}` };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* resposta não-JSON */
  }

  if (!res.ok) {
    return { ok: false, error: `[${res.status}] ${extractErrorMessage(json, text)}` };
  }
  const errs = json?._errors;
  if (Array.isArray(errs) && errs.length) {
    return { ok: false, error: extractErrorMessage(json, 'erro desconhecido') };
  }
  return { ok: true, messageId: extractMessageId(json) };
}

export type TemplateStatusResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

export async function fetchChakraTemplateStatus(opts: {
  apiBaseUrl: string;
  apiKey: string;
  apiVersion: string;
  wabaId: string;
  templateName: string;
  fetchImpl?: typeof fetch;
}): Promise<TemplateStatusResult> {
  if (!opts.wabaId) return { ok: false, error: 'WABA ID não configurado' };
  const base = (opts.apiBaseUrl || 'https://api.chakrahq.com').replace(/\/+$/, '');
  const url = `${base}/v1/ext/plugin/whatsapp/api/${opts.apiVersion}/${opts.wabaId}/message_templates?limit=100`;
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { headers: { Authorization: `Bearer ${opts.apiKey}` } });
  } catch (e: any) {
    return { ok: false, error: `falha de rede: ${e?.message ?? 'desconhecida'}` };
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `[${res.status}] ${extractErrorMessage(json, text)} (verifique a versão da API "${opts.apiVersion}")`,
    };
  }
  const list: any[] = json?._data?.data ?? json?.data ?? json?._data ?? [];
  const found = Array.isArray(list) ? list.find((t: any) => t?.name === opts.templateName) : null;
  if (!found) return { ok: false, error: `Template "${opts.templateName}" não encontrado na WABA` };
  return { ok: true, status: String(found.status ?? 'PENDING').toUpperCase() };
}
