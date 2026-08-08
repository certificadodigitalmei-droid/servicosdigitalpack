// Pure helpers for the automation worker.
// No supabase / no fetch — safe to unit-test with mocks.
import { extractValidBrazilianMobile } from '@/lib/phone/brazilian-mobile';

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
  const prev = out[date];
  // Never regress a cursor: keep the further position (page, then item_offset).
  if (prev) {
    const prevKey = (Number(prev.page) || 1) * 1_000_000 + (Number(prev.item_offset) || 0);
    const nextKey = (Number(next.page) || 1) * 1_000_000 + (Number(next.itemOffset) || 0);
    if (nextKey < prevKey) return out;
  }
  out[date] = {
    page: next.page,
    item_offset: next.itemOffset,
    last_cnpj: next.lastCnpj,
    updated_at: new Date().toISOString(),
  };
  return out;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickAny(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function descOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const s = pickStr(o, ['situacao_atual', 'descricao', 'description', 'nome', 'sigla', 'texto', 'valor', 'codigo']);
    if (s) return s;
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
  // v4: contato_email: [{ email, valido, dominio }]
  const contatoEmail = (item as any).contato_email;
  if (Array.isArray(contatoEmail)) {
    for (const e of contatoEmail) {
      if (e && typeof e === 'object') {
        const s = pickStr(e as Record<string, unknown>, ['email']);
        if (isEmailLike(s)) return s;
      } else if (typeof e === 'string' && isEmailLike(e)) return e.trim();
    }
  }
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
  const contato = (item as any).contato;
  if (contato && typeof contato === 'object') {
    const s = pickStr(contato as Record<string, unknown>, ['email']);
    if (isEmailLike(s)) return s;
  }
  const estab = (item as any).estabelecimento;
  if (estab && typeof estab === 'object') {
    const s = pickStr(estab as Record<string, unknown>, ['email']);
    if (isEmailLike(s)) return s;
  }
  return null;
}

/** Reúne todos os contatos telefônicos do payload preservando tipo e DDD. */
export function collectPhoneCandidates(item: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  const push = (v: unknown) => {
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  };
  push((item as any).contato_telefonico);
  push((item as any).telefones);
  push((item as any).telefone);
  push((item as any).telefone_contato);
  const contato = (item as any).contato;
  if (contato && typeof contato === 'object') {
    push((contato as any).telefones);
    push((contato as any).telefone);
    push((contato as any).ddd_telefone);
  }
  const estab = (item as any).estabelecimento;
  if (estab && typeof estab === 'object') {
    push((estab as any).telefones);
    push((estab as any).telefone);
    push((estab as any).ddd_telefone_1);
    push((estab as any).ddd_telefone);
  }
  return out;
}

function itemDdd(item: Record<string, unknown>): string | null {
  const direct = (item as any).ddd ?? (item as any).ddd_1;
  if (direct != null && String(direct).trim()) return String(direct);
  const estab = (item as any).estabelecimento;
  if (estab && typeof estab === 'object') {
    const v = (estab as any).ddd ?? (estab as any).ddd_1;
    if (v != null && String(v).trim()) return String(v);
  }
  return null;
}

/** Celular brasileiro válido (E.164 sem "+") extraído do payload, ou null. */
export function extractMobile(item: Record<string, unknown>): string | null {
  const r = extractValidBrazilianMobile(collectPhoneCandidates(item) as any, itemDdd(item));
  return r.valid ? r.e164 : null;
}

function extractPhone(item: Record<string, unknown>): string | null {
  return extractMobile(item);
}

export type NormalizedCompany = {
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  matriz_filial: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null; // YYYY-MM-DD when possible
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  capital_social: string | null;
  quadro_societario: unknown;
  email: string | null;
  telefone: string | null;
  /** Celular brasileiro validado em E.164 sem "+" (55DD9XXXXXXXX). */
  celular: string | null;
  raw: Record<string, unknown>;
};

function toISODate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

/**
 * Normalizes one raw item from Casa dos Dados (`response.cnpjs[i]` or a
 * detail payload) into a stable internal shape. Handles common variations:
 *   - top-level string fields ("municipio", "uf", "situacao_cadastral")
 *   - nested objects like `{codigo, descricao}` (municipio, situacao, natureza)
 *   - `estabelecimento.*` grouping used by some payload versions
 *   - alias keys (nome_empresarial ↔ razao_social, cnpj_completo ↔ cnpj)
 */
export function normalizeCasaDosDadosCompany(item: Record<string, unknown>): NormalizedCompany {
  const estab = (item as any).estabelecimento && typeof (item as any).estabelecimento === 'object'
    ? ((item as any).estabelecimento as Record<string, unknown>)
    : null;
  // v4 /v4/cnpj/{cnpj} nests address under `endereco` and contact under `contato`.
  const enderecoObj = (item as any).endereco && typeof (item as any).endereco === 'object' && !Array.isArray((item as any).endereco)
    ? ((item as any).endereco as Record<string, unknown>)
    : null;
  const contatoObj = (item as any).contato && typeof (item as any).contato === 'object'
    ? ((item as any).contato as Record<string, unknown>)
    : null;

  const scope = (keys: string[]): unknown => {
    const direct = pickAny(item, keys);
    if (direct !== null && direct !== undefined && direct !== '') return direct;
    if (enderecoObj) {
      const v = pickAny(enderecoObj, keys);
      if (v !== null && v !== undefined && v !== '') return v;
    }
    if (estab) {
      const v = pickAny(estab, keys);
      if (v !== null && v !== undefined && v !== '') return v;
    }
    return null;
  };

  const cnpj = pickStr(item, ['cnpj', 'cnpj_completo'])
    ?? (estab ? pickStr(estab, ['cnpj', 'cnpj_completo']) : null);

  const municipioRaw = scope(['municipio', 'cidade', 'municipio_descricao']);
  // v4: situacao_cadastral is an object with an inner `situacao_cadastral` string ("ATIVA", ...)
  const situacaoNode = (item as any).situacao_cadastral;
  const situacaoRaw = (situacaoNode && typeof situacaoNode === 'object' && !Array.isArray(situacaoNode))
    ? ((situacaoNode as any).situacao_cadastral ?? (situacaoNode as any).situacao ?? (situacaoNode as any).descricao ?? situacaoNode)
    : scope(['situacao_cadastral', 'situacao', 'situacao_cadastral_desc']);
  const matrizRaw = scope(['matriz_filial', 'matriz', 'tipo', 'identificador_matriz_filial']);
  const naturezaRaw = pickAny(item, ['natureza_juridica', 'descricao_natureza_juridica']);

  const enderecoParts = [
    descOf(scope(['tipo_logradouro'])),
    descOf(scope(['logradouro'])),
    descOf(scope(['numero'])),
    descOf(scope(['complemento'])),
    descOf(scope(['bairro'])),
  ].filter(Boolean);
  const enderecoDirect = descOf(scope(['endereco_completo']));
  const endereco = enderecoDirect ?? (enderecoParts.length ? enderecoParts.join(', ') : null);

  let matrizStr: string | null = null;
  if (matrizRaw === 1 || matrizRaw === '1') matrizStr = 'MATRIZ';
  else if (matrizRaw === 2 || matrizRaw === '2') matrizStr = 'FILIAL';
  else matrizStr = descOf(matrizRaw);
  if (matrizStr === '1') matrizStr = 'MATRIZ';
  else if (matrizStr === '2') matrizStr = 'FILIAL';

  // Contato override — v4 exposes contato.{email,telefone}
  const contatoEmail = contatoObj ? pickStr(contatoObj, ['email']) : null;

  return {
    cnpj: cnpj ? cnpj.replace(/\D+/g, '') : null,
    razao_social: pickStr(item, ['razao_social', 'nome_empresarial', 'razao_social_original'])
      ?? (estab ? pickStr(estab, ['razao_social', 'nome_empresarial']) : null),
    nome_fantasia: pickStr(item, ['nome_fantasia'])
      ?? (estab ? pickStr(estab, ['nome_fantasia']) : null),
    matriz_filial: matrizStr,
    situacao_cadastral: descOf(situacaoRaw),
    data_abertura: toISODate(scope(['data_abertura', 'abertura', 'inicio_atividade']))
      ?? toISODate((item as any)?.situacao_cadastral?.data),
    municipio: descOf(municipioRaw),
    uf: descOf(scope(['uf', 'sigla_uf'])),
    endereco,
    capital_social: descOf(pickAny(item, ['capital_social'])),
    quadro_societario: (item as any).qsa ?? (item as any).quadro_societario ?? null,
    email: (isEmailLike(contatoEmail) ? contatoEmail : null) ?? extractEmail(item),
    // Só expomos telefone quando é celular válido — fixo nunca entra no fluxo.
    telefone: extractMobile(item),
    celular: extractMobile(item),
    raw: item,
  };
}

export type DataQualityResult = {
  complete: boolean;
  missingFields: string[];
  email: string | null;
  /** Celular validado (E.164 sem "+") ou null. */
  mobile: string | null;
  normalized: NormalizedCompany;
};

export type ValidationFilters = {
  require_email?: boolean;
  only_matriz?: boolean;
  require_mobile_phone?: boolean;
};

/**
 * Validates the raw Casa dos Dados item against the seven required fields:
 *   cnpj, razao_social, situacao_cadastral, data_abertura,
 *   matriz_filial, municipio, uf.
 * E-mail continua OPCIONAL. Celular é obrigatório quando
 * `require_mobile_phone` está ativo (fluxo real de importação p/ WhatsApp).
 */
export function validateCompanyItem(
  item: Record<string, unknown>,
  filters?: ValidationFilters,
): DataQualityResult {
  const n = normalizeCasaDosDadosCompany(item);
  const missing: string[] = [];
  if (!n.cnpj) missing.push('cnpj');
  if (!n.razao_social) missing.push('razao_social');
  if (!n.situacao_cadastral) missing.push('situacao_cadastral');
  if (!n.data_abertura) missing.push('data_abertura');
  if (!filters?.only_matriz && !n.matriz_filial) missing.push('matriz_filial');
  if (!n.municipio) missing.push('municipio');
  if (!n.uf) missing.push('uf');
  if (filters?.require_mobile_phone && !n.celular) missing.push('celular');
  return {
    complete: missing.length === 0,
    missingFields: missing,
    email: n.email,
    mobile: n.celular,
    normalized: n,
  };
}

