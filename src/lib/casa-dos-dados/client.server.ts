// Casa dos Dados HTTP client — server-only.
// Uses official API base URL and API key from environment.
// Endpoints implemented (from official docs):
//   POST /v5/cnpj/pesquisa               — advanced search
//   GET  /v5/saldo                        — credit / status check
//   GET  /v4/dashboard/cnpj/empresas-abertas/hoje — count of companies opened today

export type CasaFilters = {
  only_mei?: boolean;
  only_active?: boolean;
  only_matriz?: boolean;
  require_email?: boolean;
};

export type CasaSearchResult = {
  status: number;
  ok: boolean;
  totalCount: number | null;
  items: Array<Record<string, unknown>>;
  raw: unknown;
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

function todayBR(): { start: string; end: string } {
  // Brazil day boundaries (America/Sao_Paulo). Casa dos Dados expects YYYY-MM-DD.
  const now = new Date();
  const brNowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return { start: brNowStr, end: brNowStr };
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

export async function searchOpeningsToday(opts: {
  filters: CasaFilters;
  limit: number;
  page?: number;
}): Promise<CasaSearchResult> {
  const { start, end } = todayBR();
  const filters = opts.filters ?? {};
  const naturezaJuridica: string[] = [];
  if (filters.only_mei) naturezaJuridica.push('213-5'); // Empresário Individual (MEI usa este código de natureza)

  const query: Record<string, unknown> = {
    query: {
      termo: [],
      atividade_principal: [],
      natureza_juridica: naturezaJuridica,
      uf: [],
      municipio: [],
      bairro: [],
      situacao_cadastral: filters.only_active ? 'ATIVA' : '',
      cep: [],
      ddd: [],
    },
    range_query: {
      data_abertura: { lte: end, gte: start },
      capital_social: { lte: null, gte: null },
    },
    extras: {
      somente_mei: !!filters.only_mei,
      excluir_mei: false,
      com_email: !!filters.require_email,
      com_contato_telefonico: false,
      somente_fixo: false,
      somente_celular: false,
      somente_matriz: !!filters.only_matriz,
      somente_filial: false,
    },
    page: opts.page ?? 1,
  };

  const url = `${baseUrl()}/v5/cnpj/pesquisa`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(query),
  });
  const text = await res.text();
  let raw: unknown = text;
  try { raw = JSON.parse(text); } catch { /* keep text */ }

  const items = extractItems(raw).slice(0, opts.limit);
  const totalCount = extractTotal(raw);

  return { status: res.status, ok: res.ok, totalCount, items, raw };
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const candidates = [r.data, r.results, r.items, r.hits, (r.data as any)?.items, (r.data as any)?.data];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Array<Record<string, unknown>>;
  }
  return [];
}

function extractTotal(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const c = [r.total, r.count, r.totalCount, (r.data as any)?.total, (r.data as any)?.count];
  for (const v of c) if (typeof v === 'number') return v;
  return null;
}
