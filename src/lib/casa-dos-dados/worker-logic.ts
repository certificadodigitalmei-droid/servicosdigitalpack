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
  autoImportEnabled: boolean,
): boolean {
  // "quantity" always means NEW companies processed (or link-reused when
  // auto-import is off and we still want to iterate quantity items).
  if (autoImportEnabled) return state.newImported >= requested;
  // When auto-import is off, we only queue CNPJs — consider each unique
  // non-duplicate as a processed unit.
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
