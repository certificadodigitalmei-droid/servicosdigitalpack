import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type FieldKey =
  | 'EMAIL' | 'NOME_EMPRESARIAL' | 'RAZAO_SOCIAL' | 'NOME_TITULAR'
  | 'CNPJ' | 'DATA_ABERTURA' | 'DATA_SITUACAO' | 'SITUACAO'
  | 'MUNICIPIO' | 'UF' | 'LINK_PUBLICO' | 'LINK_CHECKOUT' | 'TOKEN';

const ALIASES: Record<FieldKey, string[]> = {
  EMAIL: ['EMAIL', 'E-MAIL', 'EMAILS', 'ENDERECO ELETRONICO', 'ENDERECO ELETRONICO 1'],
  NOME_EMPRESARIAL: ['NOME EMPRESARIAL', 'NOME EMPRESA', 'NOME FANTASIA'],
  RAZAO_SOCIAL: ['RAZAO SOCIAL'],
  NOME_TITULAR: ['NOME DO TITULAR', 'NOME TITULAR', 'NOME'],
  CNPJ: ['CNPJ'],
  DATA_ABERTURA: ['DATA DE ABERTURA', 'DATA ABERTURA', 'INICIO ATIVIDADE', 'INICIO DE ATIVIDADE'],
  DATA_SITUACAO: ['DATA DA SITUACAO CADASTRAL', 'DATA SITUACAO CADASTRAL', 'DATA SITUACAO'],
  SITUACAO: ['SITUACAO CADASTRAL', 'SITUACAO'],
  MUNICIPIO: ['MUNICIPIO', 'CIDADE'],
  UF: ['UF', 'ESTADO'],
  LINK_PUBLICO: ['LINK_PUBLICO', 'LINK PUBLICO', 'LINKPUBLICO'],
  LINK_CHECKOUT: ['LINK_CHECKOUT', 'LINK CHECKOUT', 'LINKCHECKOUT'],
  TOKEN: ['TOKEN'],
};

export const FIELD_KEYS = Object.keys(ALIASES) as FieldKey[];

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

export function autoMap(headers: string[]): Record<FieldKey, string | null> {
  const map = {} as Record<FieldKey, string | null>;
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const key of FIELD_KEYS) {
    const aliases = ALIASES[key].map(norm);
    const found = normalized.find((h) => aliases.includes(h.n));
    map[key] = found ? found.raw : null;
  }
  return map;
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

export type ParsedFile = {
  headers: string[];
  rows: Record<string, any>[];
};

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) =>
          resolve({
            headers: (res.meta.fields || []) as string[],
            rows: res.data as Record<string, any>[],
          }),
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export type NormalizedRow = Record<FieldKey, string> & { _raw: Record<string, any> };

export function normalizeRows(
  rows: Record<string, any>[],
  mapping: Record<FieldKey, string | null>,
): NormalizedRow[] {
  return rows.map((r) => {
    const out = { _raw: r } as NormalizedRow;
    for (const k of FIELD_KEYS) {
      const col = mapping[k];
      out[k] = col ? String(r[col] ?? '').trim() : '';
    }
    return out;
  });
}

export type AnalysisStats = {
  total: number;
  validEmails: number;
  invalidEmails: number;
  missingLink: number;
  duplicates: number;
  ready: number;
};

export function analyzeRows(rows: NormalizedRow[]): AnalysisStats {
  const seen = new Set<string>();
  let validEmails = 0,
    invalidEmails = 0,
    missingLink = 0,
    duplicates = 0,
    ready = 0;
  for (const r of rows) {
    const ok = isValidEmail(r.EMAIL);
    if (ok) validEmails++;
    else invalidEmails++;
    if (!r.LINK_PUBLICO) missingLink++;
    const key = (r.EMAIL || '').toLowerCase();
    if (key && seen.has(key)) duplicates++;
    else if (key) seen.add(key);
    if (ok && r.LINK_PUBLICO) ready++;
  }
  return { total: rows.length, validEmails, invalidEmails, missingLink, duplicates, ready };
}

export function genReference(i: number): string {
  return `MEI-${String(Date.now()).slice(-6)}${String(i).padStart(4, '0')}`;
}
