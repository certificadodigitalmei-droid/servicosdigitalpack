// Lógica pura das campanhas de WhatsApp.
// Sem rede, sem banco — usada pelo worker do servidor e pela interface.

import { validateBrazilianMobile, extractValidBrazilianMobile } from '@/lib/phone/brazilian-mobile';

export const MIN_INTERVAL_SECONDS = 5;
export const DEFAULT_DAILY_UNIQUE_CAP = 250;
export const SENDABLE_TEMPLATE_STATUS = 'APPROVED';

export type PacePresetId = 'cautious' | 'recommended' | 'moderate' | 'custom';

export type PacePreset = {
  id: PacePresetId;
  label: string;
  intervalSeconds: number;
  perHour: number;
  description: string;
};

export const PACE_PRESETS: Record<Exclude<PacePresetId, 'custom'>, PacePreset> = {
  cautious: {
    id: 'cautious',
    label: 'Cauteloso',
    intervalSeconds: 60,
    perHour: 60,
    description: '1 mensagem por minuto (60 por hora)',
  },
  recommended: {
    id: 'recommended',
    label: 'Recomendado',
    intervalSeconds: 30,
    perHour: 120,
    description: '1 mensagem a cada 30 segundos (120 por hora)',
  },
  moderate: {
    id: 'moderate',
    label: 'Moderado',
    intervalSeconds: 15,
    perHour: 240,
    description: '1 mensagem a cada 15 segundos (240 por hora)',
  },
};

export const PACE_LIST: PacePreset[] = [
  PACE_PRESETS.cautious,
  PACE_PRESETS.recommended,
  PACE_PRESETS.moderate,
];

export const QUANTITY_OPTIONS = [20, 50, 100, 200, 500] as const;

/** Intervalo final em segundos, nunca abaixo do mínimo seguro. */
export function resolveIntervalSeconds(preset: PacePresetId, customSeconds?: number | null): number {
  if (preset === 'custom') {
    const v = Math.floor(Number(customSeconds ?? MIN_INTERVAL_SECONDS));
    if (!Number.isFinite(v)) return MIN_INTERVAL_SECONDS;
    return Math.max(MIN_INTERVAL_SECONDS, Math.min(3600, v));
  }
  return PACE_PRESETS[preset].intervalSeconds;
}

export function messagesPerHour(intervalSeconds: number): number {
  const s = Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
  return Math.floor(3600 / s);
}

/** Duração estimada da campanha em segundos (o 1º envio é imediato). */
export function estimateDurationSeconds(count: number, intervalSeconds: number): number {
  const n = Math.max(0, Math.floor(count));
  if (n <= 1) return 0;
  return (n - 1) * Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

export type TemplateLike = {
  name: string;
  status?: string | null;
  language?: string | null;
  category?: string | null;
};

export function normalizeTemplateStatus(status: unknown): string {
  return String(status ?? 'PENDING').trim().toUpperCase() || 'PENDING';
}

export function isSendableTemplate(t: TemplateLike | null | undefined): boolean {
  return !!t && normalizeTemplateStatus(t.status) === SENDABLE_TEMPLATE_STATUS;
}

/** Só modelos aprovados podem ser escolhidos para envio. */
export function approvedTemplates<T extends TemplateLike>(list: T[] | null | undefined): T[] {
  return (list ?? []).filter((t) => isSendableTemplate(t));
}

export function otherTemplates<T extends TemplateLike>(list: T[] | null | undefined): T[] {
  return (list ?? []).filter((t) => !isSendableTemplate(t));
}

// ---------------------------------------------------------------------------
// Seleção de empresas elegíveis
// ---------------------------------------------------------------------------

export type CompanyLike = {
  id: string;
  cnpj?: string | null;
  razao_social_original?: string | null;
  nome_titular_exibicao?: string | null;
  nome_fantasia?: string | null;
  ddd?: string | null;
  telefones?: unknown;
  whatsapp_phone_e164?: string | null;
  created_at?: string | null;
};

export type EligibleCompany = {
  companyId: string;
  companyName: string;
  cnpj: string;
  phone: string;
  token: string;
  companyLinkId: string | null;
};

export type EligibilityResult = {
  selected: EligibleCompany[];
  skipped: {
    noPhone: number;
    blocked: number;
    noCnpj: number;
    noLink: number;
    duplicate: number;
  };
};

export function companyDisplayName(c: CompanyLike): string {
  return (
    c.nome_titular_exibicao ||
    c.nome_fantasia ||
    c.razao_social_original ||
    'Empresa'
  );
}

/** Celular válido da empresa (E.164 sem "+"), ou null. */
export function companyMobile(c: CompanyLike): string | null {
  const stored = c.whatsapp_phone_e164 ? validateBrazilianMobile(c.whatsapp_phone_e164) : null;
  if (stored?.valid) return stored.e164;
  const list = Array.isArray(c.telefones) ? (c.telefones as unknown[]) : [];
  const r = extractValidBrazilianMobile(list as never, c.ddd ?? null);
  return r.valid ? r.e164 : null;
}

/**
 * Escolhe as primeiras X empresas elegíveis (mais antigas primeiro).
 * Ignora sem celular válido, bloqueadas, sem CNPJ, sem link ativo e duplicadas.
 */
export function selectEligibleCompanies(input: {
  companies: CompanyLike[];
  linkByCompany: Map<string, { id: string; token: string }>;
  blockedPhones: Set<string>;
  alreadyUsedPhones?: Set<string>;
  alreadyUsedCompanyIds?: Set<string>;
  limit: number;
}): EligibilityResult {
  const usedPhones = new Set(input.alreadyUsedPhones ?? []);
  const usedCompanies = new Set(input.alreadyUsedCompanyIds ?? []);
  const selected: EligibleCompany[] = [];
  const skipped = { noPhone: 0, blocked: 0, noCnpj: 0, noLink: 0, duplicate: 0 };

  const ordered = [...input.companies].sort((a, b) =>
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
  );

  for (const c of ordered) {
    if (selected.length >= input.limit) break;
    if (usedCompanies.has(c.id)) {
      skipped.duplicate++;
      continue;
    }
    const phone = companyMobile(c);
    if (!phone) {
      skipped.noPhone++;
      continue;
    }
    if (input.blockedPhones.has(phone)) {
      skipped.blocked++;
      continue;
    }
    if (usedPhones.has(phone)) {
      skipped.duplicate++;
      continue;
    }
    const cnpj = String(c.cnpj ?? '').trim();
    if (!cnpj) {
      skipped.noCnpj++;
      continue;
    }
    const link = input.linkByCompany.get(c.id);
    if (!link || !link.token) {
      skipped.noLink++;
      continue;
    }
    usedPhones.add(phone);
    usedCompanies.add(c.id);
    selected.push({
      companyId: c.id,
      companyName: companyDisplayName(c),
      cnpj,
      phone,
      token: link.token,
      companyLinkId: link.id ?? null,
    });
  }

  return { selected, skipped };
}

// ---------------------------------------------------------------------------
// Limites e falhas
// ---------------------------------------------------------------------------

export function remainingDailyCap(cap: number, sentLast24h: number): number {
  return Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(sentLast24h)));
}

/** Retry-After em milissegundos (segundos ou data HTTP). */
export function parseRetryAfterMs(header: string | null | undefined, now = Date.now()): number | null {
  const raw = String(header ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Math.max(0, Number(raw) * 1000);
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return Math.max(0, t - now);
}

export const MAX_TEMPORARY_ATTEMPTS = 4;

export type FailureAction =
  | { action: 'retry'; delayMs: number; reason: string }
  | { action: 'fail'; delayMs: 0; reason: string }
  | { action: 'block'; delayMs: 0; reason: string }
  | { action: 'pause'; delayMs: 0; reason: string };

/**
 * Decide o destino de um item após falha.
 * - 429: respeita Retry-After com backoff exponencial mínimo.
 * - 5xx/rede: retry temporário limitado.
 * - 401/403/config/template: pausa a campanha (não culpa o contato).
 * - destinatário inexistente: bloqueio permanente.
 */
export function decideFailureAction(input: {
  kind: 'temporary' | 'config' | 'permanent_recipient';
  status: number | null;
  attempts: number;
  retryAfterMs?: number | null;
  maxAttempts?: number;
}): FailureAction {
  const maxAttempts = input.maxAttempts ?? MAX_TEMPORARY_ATTEMPTS;

  if (input.kind === 'permanent_recipient') {
    return { action: 'block', delayMs: 0, reason: 'Número sem WhatsApp válido — bloqueado permanentemente' };
  }
  if (input.kind === 'config' || input.status === 401 || input.status === 403) {
    return { action: 'pause', delayMs: 0, reason: 'Falha de configuração ou modelo — campanha pausada' };
  }
  if (input.attempts >= maxAttempts) {
    return { action: 'fail', delayMs: 0, reason: 'Limite de tentativas atingido' };
  }
  const backoff = Math.min(15 * 60_000, 30_000 * Math.pow(2, Math.max(0, input.attempts - 1)));
  if (input.status === 429) {
    const wait = Math.max(input.retryAfterMs ?? 0, backoff);
    return { action: 'retry', delayMs: wait, reason: 'Limite de velocidade do WhatsApp — aguardando' };
  }
  return { action: 'retry', delayMs: backoff, reason: 'Falha temporária — nova tentativa agendada' };
}

/** A campanha só importa novas empresas quando a fila atual acabou. */
export function canImportNextBatch(input: {
  continuousMode: boolean;
  pendingItems: number;
  status: string;
}): boolean {
  return input.continuousMode && input.status === 'running' && input.pendingItems === 0;
}
