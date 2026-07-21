// Pure helpers for the automation worker.
// No supabase / no fetch — safe to unit-test with mocks.

export type ItemClassification =
  | { kind: 'missing_cnpj' }
  | { kind: 'invalid_length'; cnpj: string; len: number }
  | { kind: 'ok'; cnpj: string };

export function digitsOnly(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\D+/g, '') : '';
}

export function classifyItem(item: Record<string, unknown>): ItemClassification {
  const raw = (item as any).cnpj ?? (item as any).cnpj_completo;
  const cnpj = digitsOnly(raw);
  if (!cnpj) return { kind: 'missing_cnpj' };
  if (cnpj.length !== 14) return { kind: 'invalid_length', cnpj, len: cnpj.length };
  return { kind: 'ok', cnpj };
}

export type WalkState = {
  page: number;
  itemOffset: number;
  newImported: number;
  linksReused: number;
  pagesFetched: number;
};

export function shouldStopForRequested(
  state: Pick<WalkState, 'newImported' | 'linksReused'>,
  requested: number,
  _autoImportEnabled: boolean,
): boolean {
  return state.newImported >= requested;
}

export function shouldStopForPages(state: Pick<WalkState, 'pagesFetched'>, max: number): boolean {
  return state.pagesFetched >= Math.max(1, max);
}

export type CursorMap = Record<string, { page: number; item_offset: number; last_cnpj: string | null; updated_at: string }>;

export function readCursor(map: CursorMap | null | undefined, date: string): { page: number; itemOffset: number } {
  const c = map?.[date];
  if (!c) return { page: 1, itemOffset: 0 };
  const page = Math.max(1, Number(c.page) || 1);
  const itemOffset = Math.max(0, Number(c.item_offset) || 0);
  return { page, itemOffset };
}

export function writeCursor(
  map: CursorMap | null | undefined,
  date: string,
  next: { page: number; itemOffset: number; lastCnpj: string | null },
): CursorMap {
  const out: CursorMap = { ...(map ?? {}) };
  out[date] = {
    page: next.page,
    item_offset: next.itemOffset,
    last_cnpj: next.lastCnpj,
    updated_at: new Date().toISOString(),
  };
  return out;
}

// ---------------------------------------------------------------------------
// Data-quality validation
// ---------------------------------------------------------------------------

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function isEmailLike(s: string | null | undefined): s is string {
  if (!s) return false;
  const v = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function extractEmail(item: Record<string, unknown>): string | null {
  const direct = pickStr(item, ['email', 'email_contato']);
  if (isEmailLike(direct)) return direct;
  const emails = (item as any).emails;
  if (Array.isArray(emails)) {
    for (const e of emails) {
      if (typeof e === 'string' && isEmailLike(e)) return e.trim();
      if (e && typeof e === 'object') {
        const s = pickStr(e as Record<string, unknown>, ['email', 'endereco']);
        if (isEmailLike(s)) return s;
      }
    }
  }
  return null;
}

function hasMatrizFlag(item: Record<string, unknown>): boolean {
  const v =
    (item as any).matriz_filial ??
    (item as any).matriz ??
    (item as any).is_matriz ??
    (item as any).tipo;
  return v !== undefined && v !== null && v !== '';
}

export type DataQualityResult = {
  complete: boolean;
  missingFields: string[];
  email: string | null;
};

export type ValidationFilters = { require_email?: boolean; only_matriz?: boolean };

/**
 * Validates the raw Casa dos Dados item against the required-fields spec.
 * Called BEFORE upsert — determines whether the record can flow as "complete"
 * in normal mode or must be quarantined as `pending_enrichment`.
 */
export function validateCompanyItem(
  item: Record<string, unknown>,
  filters?: ValidationFilters,
): DataQualityResult {
  const missing: string[] = [];

  const razao = pickStr(item, ['razao_social', 'nome_empresarial']);
  if (!razao) missing.push('razao_social');

  const situacao = pickStr(item, ['situacao_cadastral', 'situacao', 'situacao_cadastral_desc']);
  if (!situacao) missing.push('situacao_cadastral');

  const abertura = pickStr(item, ['data_abertura', 'abertura', 'inicio_atividade']);
  if (!abertura) missing.push('data_abertura');

  // Filtro "somente matriz" já garante matriz na API, mas o campo em si
  // precisa vir para podermos identificar. Se o filtro está ligado, aceitamos
  // o próprio filtro como fonte da informação.
  if (!filters?.only_matriz && !hasMatrizFlag(item)) missing.push('matriz_filial');

  const municipio = pickStr(item, ['municipio', 'cidade', 'municipio_descricao']);
  if (!municipio) missing.push('municipio');

  const uf = pickStr(item, ['uf']);
  if (!uf) missing.push('uf');

  const email = extractEmail(item);
  if (filters?.require_email && !email) missing.push('email');

  return { complete: missing.length === 0, missingFields: missing, email };
}
