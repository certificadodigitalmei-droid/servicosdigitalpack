import { CAMPAIGN_VARIANTS, getVariant, type CampaignVariant } from './variants';
import { substitute, type Vars } from './template';

/**
 * Verificação automática dos assuntos dos Modelos de campanha (rotação).
 *
 * Garante que a rotação sempre use assuntos diferentes entre si, sem
 * repetição, sem variáveis quebradas e sem gatilhos clássicos de spam.
 */

export type SubjectIssue = {
  level: 'error' | 'warn';
  variantId: string;
  variantName: string;
  message: string;
};

export type SubjectAudit = {
  ok: boolean;
  total: number;
  uniqueSubjects: number;
  issues: SubjectIssue[];
};

/** Palavras que costumam disparar filtros de spam em assuntos. */
const SPAM_TRIGGERS = [
  'grátis',
  'gratis',
  'promoção',
  'promocao',
  'desconto',
  'urgente',
  'última chance',
  'ultima chance',
  'clique aqui',
  'ganhe',
  'imperdível',
  'imperdivel',
  'multa',
  'bloqueio',
  'cancelamento',
  'r$',
];

const MIN_LEN = 20;
const MAX_LEN = 70;

const PREVIEW_VARS: Vars = {
  EMPRESA: 'Empresa Exemplo LTDA',
  CNPJ: '12.345.678/0001-90',
  REFERENCIA: 'REF-000000',
  LINK_PUBLICO: 'https://exemplo.com/acesso/token',
  LINK_CHECKOUT: 'https://exemplo.com/checkout/token',
} as unknown as Vars;

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Roda a auditoria sobre os modelos informados (ou todos, se vazio). */
export function auditSubjects(variantIds?: string[]): SubjectAudit {
  const pool: CampaignVariant[] =
    variantIds && variantIds.length > 0
      ? (variantIds.map(getVariant).filter(Boolean) as CampaignVariant[])
      : CAMPAIGN_VARIANTS;

  const issues: SubjectIssue[] = [];
  const seen = new Map<string, string>();

  for (const v of pool) {
    const push = (level: SubjectIssue['level'], message: string) =>
      issues.push({ level, variantId: v.id, variantName: v.name, message });

    const raw = (v.subject ?? '').trim();

    if (!raw) {
      push('error', 'Assunto vazio.');
      continue;
    }

    // Variáveis não fechadas / desconhecidas
    const openCount = (raw.match(/\{\{/g) ?? []).length;
    const closeCount = (raw.match(/\}\}/g) ?? []).length;
    if (openCount !== closeCount) push('error', 'Variável mal formada no assunto.');

    const rendered = substitute(raw, PREVIEW_VARS);
    if (/\{\{|\}\}/.test(rendered)) {
      push('error', 'Assunto contém variável desconhecida que não é substituída.');
    }

    // Duplicidade (comparando o texto renderizado, sem as variáveis)
    const key = normalize(rendered);
    const dup = seen.get(key);
    if (dup) {
      push('error', `Assunto repetido — igual ao modelo "${dup}".`);
    } else {
      seen.set(key, v.name);
    }

    if (rendered.length < MIN_LEN) push('warn', `Assunto muito curto (${rendered.length} caracteres).`);
    if (rendered.length > MAX_LEN) push('warn', `Assunto muito longo (${rendered.length} caracteres) — pode ser cortado.`);

    if (raw === raw.toUpperCase() && /[A-ZÀ-Ü]/.test(raw)) {
      push('warn', 'Assunto todo em MAIÚSCULAS — gatilho de spam.');
    }
    if (/[!]{1,}/.test(raw)) push('warn', 'Evite ponto de exclamação no assunto.');

    const lower = normalize(raw);
    for (const t of SPAM_TRIGGERS) {
      if (lower.includes(t)) push('warn', `Palavra de risco no assunto: "${t}".`);
    }
  }

  return {
    ok: issues.every((i) => i.level !== 'error'),
    total: pool.length,
    uniqueSubjects: seen.size,
    issues,
  };
}

/**
 * Filtra a lista ativa mantendo apenas modelos com assunto válido e único,
 * de forma que a rotação nunca envie dois assuntos idênticos.
 */
export function safeVariantIds(activeIds: string[]): string[] {
  const ids = activeIds.length > 0 ? activeIds : CAMPAIGN_VARIANTS.map((v) => v.id);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of ids) {
    const v = getVariant(id);
    if (!v) continue;
    const key = normalize(substitute(v.subject ?? '', PREVIEW_VARS));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }

  return out.length > 0 ? out : CAMPAIGN_VARIANTS.map((v) => v.id);
}
