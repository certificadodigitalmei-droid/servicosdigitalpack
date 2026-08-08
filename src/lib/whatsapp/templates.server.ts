// Sincronização dos modelos oficiais de WhatsApp (ChakraHQ / WABA).
// Server-only: a chave da API nunca sai do servidor.

import { extractErrorMessage } from './chakra.server';

export type ChakraTemplate = {
  name: string;
  language: string;
  category: string | null;
  status: string;
  header_text: string | null;
  body_text: string | null;
  footer_text: string | null;
  button_label: string | null;
  button_url_base: string | null;
  variables: string[];
  raw: unknown;
};

export type FetchTemplatesResult =
  | { ok: true; templates: ChakraTemplate[] }
  | { ok: false; error: string };

function componentsOf(t: any): any[] {
  const c = t?.components ?? t?.component ?? [];
  return Array.isArray(c) ? c : [];
}

function textOf(comp: any): string | null {
  const v = comp?.text ?? comp?.format_text ?? null;
  return v ? String(v) : null;
}

export function parseChakraTemplate(t: any): ChakraTemplate {
  const comps = componentsOf(t);
  const header = comps.find((c) => String(c?.type ?? '').toUpperCase() === 'HEADER');
  const body = comps.find((c) => String(c?.type ?? '').toUpperCase() === 'BODY');
  const footer = comps.find((c) => String(c?.type ?? '').toUpperCase() === 'FOOTER');
  const buttons = comps.find((c) => String(c?.type ?? '').toUpperCase() === 'BUTTONS');
  const firstButton = Array.isArray(buttons?.buttons) ? buttons.buttons[0] : null;

  const bodyText = textOf(body);
  const declared = Array.isArray(t?.variables)
    ? (t.variables as unknown[]).map((v) => String(v))
    : [];
  const fromBody = bodyText
    ? Array.from(bodyText.matchAll(/\{\{\s*([\w\d_]+)\s*\}\}/g)).map((m) => String(m[1]))
    : [];
  const variables = Array.from(new Set([...declared, ...fromBody]));

  return {
    name: String(t?.name ?? '').trim(),
    language: String(t?.language ?? t?.language_code ?? 'pt_BR'),
    category: t?.category ? String(t.category) : null,
    status: String(t?.status ?? 'PENDING').toUpperCase(),
    header_text: textOf(header),
    body_text: bodyText,
    footer_text: textOf(footer),
    button_label: firstButton?.text ? String(firstButton.text) : null,
    button_url_base: firstButton?.url ? String(firstButton.url) : null,
    variables,
    raw: t ?? null,
  };
}

export async function fetchChakraTemplates(opts: {
  apiBaseUrl: string;
  apiKey: string;
  apiVersion: string;
  wabaId: string;
  fetchImpl?: typeof fetch;
}): Promise<FetchTemplatesResult> {
  if (!opts.wabaId) return { ok: false, error: 'WABA ID não configurado' };
  const base = (opts.apiBaseUrl || 'https://api.chakrahq.com').replace(/\/+$/, '');
  const url = `${base}/v1/ext/plugin/whatsapp/api/${opts.apiVersion}/${opts.wabaId}/message_templates?limit=200`;
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
    /* resposta não-JSON */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `[${res.status}] ${extractErrorMessage(json, text)} (verifique a versão da API "${opts.apiVersion}")`,
    };
  }

  const list: any[] = json?._data?.data ?? json?.data ?? json?._data ?? [];
  if (!Array.isArray(list)) return { ok: false, error: 'Resposta inesperada da API de modelos' };
  return { ok: true, templates: list.map(parseChakraTemplate).filter((t) => t.name) };
}
