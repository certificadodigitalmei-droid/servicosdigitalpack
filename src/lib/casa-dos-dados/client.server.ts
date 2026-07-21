// Casa dos Dados HTTP client — server-only.
// Official endpoint: POST https://api.casadosdados.com.br/v5/cnpj/pesquisa
// Auth: header `api-key: <secret>`.
// Response schema: { total: number, cnpjs: [...] }

export type CasaFilters = {
  only_mei?: boolean;
  only_active?: boolean;
  only_matriz?: boolean;
  require_email?: boolean;
};

export type SanitizedRequestLog = {
  url: string;
  method: 'POST' | 'GET';
  body: unknown | null;
};

export type CasaSearchResult = {
  status: number;
  ok: boolean;
  total: number | null;
  items: Array<Record<string, unknown>>;
  responseKeys: string[];
  rawPreview: unknown;
  request: SanitizedRequestLog;
};

function baseUrl(): string {
  const raw = process.env.CASA_DOS_DADOS_API_BASE_URL;
  if (!raw) throw new Error('CASA_DOS_DADOS_API_BASE_URL não configurado');
  return raw.replace(/\/+$/, '');
}

function apiKey(): string {
  const key = process.env.CASA_DOS_DADOS_API_KEY;
  if (!key) throw new Error('CASA_DOS_DADOS_API_KEY não configurado');
  return key;
}

function headers(): Record<string, string> {
  return {
    'api-key': apiKey(),
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

export function todayBR(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}


export async function checkSaldo(): Promise<{ status: number; body: unknown; ok: boolean }> {
  const url = `${baseUrl()}/v5/saldo`;
  const res = await fetch(url, { method: 'GET', headers: headers() });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body, ok: res.ok };
}

export async function countOpeningsToday(): Promise<{ status: number; body: unknown; ok: boolean }> {
  const url = `${baseUrl()}/v4/dashboard/cnpj/empresas-abertas/hoje`;
  const res = await fetch(url, { method: 'GET', headers: headers() });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body, ok: res.ok };
}

/**
 * Builds the official request body for /v5/cnpj/pesquisa according to the
 * documented schema (data_abertura.inicio/fim, situacao_cadastral[], matriz_filial,
 * mei.optante, mais_filtros.*, limite, pagina).
 */
export function buildSearchBody(opts: {
  filters: CasaFilters;
  limit: number;
  page?: number;
  date?: string; // YYYY-MM-DD (America/Sao_Paulo). Defaults to today.
}): Record<string, unknown> {
  const date = opts.date && isValidISODate(opts.date) ? opts.date : todayBR();
  const f = opts.filters ?? {};
  return {
    data_abertura: { inicio: date, fim: date },
    situacao_cadastral: f.only_active ? ['ATIVA'] : [],
    matriz_filial: f.only_matriz ? 'MATRIZ' : '',
    mei: {
      optante: !!f.only_mei,
      excluir_optante: false,
    },
    mais_filtros: {
      somente_matriz: !!f.only_matriz,
      somente_filial: false,
      com_email: !!f.require_email,
    },
    limite: opts.limit,
    pagina: opts.page ?? 1,
  };
}

// Back-compat alias.
export const buildOpeningsTodayBody = buildSearchBody;

export async function searchOpeningsByDate(opts: {
  filters: CasaFilters;
  limit: number;
  page?: number;
  date?: string;
}): Promise<CasaSearchResult> {
  const body = buildSearchBody(opts);
  const url = `${baseUrl()}/v5/cnpj/pesquisa`;
  const request: SanitizedRequestLog = { url, method: 'POST', body };

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let raw: unknown = text;
  try { raw = JSON.parse(text); } catch { /* keep text */ }

  const r = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const responseKeys = Object.keys(r);
  const total = typeof r.total === 'number' ? r.total : null;
  const items = Array.isArray(r.cnpjs) ? (r.cnpjs as Array<Record<string, unknown>>) : [];

  const rawPreview = typeof raw === 'string'
    ? (raw as string).slice(0, 400)
    : { keys: responseKeys, total, cnpjs_length: items.length };

  return { status: res.status, ok: res.ok, total, items, responseKeys, rawPreview, request };
}

// Back-compat alias.
export const searchOpeningsToday = searchOpeningsByDate;

/**
 * Consulta apenas o total (limite=1) para uma data específica.
 * Não importa dados, não gera token, não gera link.
 */
export async function countOpeningsByDate(opts: {
  filters: CasaFilters;
  date?: string;
}): Promise<{ status: number; ok: boolean; total: number | null; date: string; request: SanitizedRequestLog }> {
  const date = opts.date && isValidISODate(opts.date) ? opts.date : todayBR();
  const r = await searchOpeningsByDate({ filters: opts.filters, limit: 1, page: 1, date });
  return { status: r.status, ok: r.ok, total: r.total, date, request: r.request };
}

