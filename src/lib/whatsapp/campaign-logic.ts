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

/**
 * Pausa automática por taxa de falhas anormal.
 * Só avalia depois de um mínimo de tentativas para não pausar por azar inicial.
 */
export const FAILURE_RATE_LIMIT = 0.5;
export const FAILURE_RATE_MIN_ATTEMPTS = 6;

export function shouldPauseForFailureRate(input: {
  sent: number;
  failed: number;
  blocked: number;
  limit?: number;
  minAttempts?: number;
}): boolean {
  const limit = input.limit ?? FAILURE_RATE_LIMIT;
  const min = input.minAttempts ?? FAILURE_RATE_MIN_ATTEMPTS;
  const attempts = input.sent + input.failed + input.blocked;
  if (attempts < min) return false;
  return (input.failed + input.blocked) / attempts >= limit;
}

// ---------------------------------------------------------------------------
// Preenchimento da fila da campanha por déficit real
// ---------------------------------------------------------------------------

export type FillSummary = {
  /** Reservadas da fila de prontidão já existente (primeira rodada). */
  reusedFromQueue: number;
  /** Empresas importadas só para completar o que faltava. */
  imported: number;
  /** Total efetivamente reservado para a campanha. */
  reserved: number;
  /** Candidatos descartados (bloqueado, duplicado, sem link). */
  skipped: number;
  /** Quanto ainda falta para o alvo. */
  missing: number;
  complete: boolean;
  rounds: number;
};

/**
 * Reserva primeiro o que já está pronto e só importa o DÉFICIT real.
 * O alvo nunca é reusado inteiro: cada rodada pede apenas `target - reservado`.
 * Para sem laço quando a fonte não traz mais nada válido.
 */
export async function fillToTarget(input: {
  target: number;
  /** Reserva `limit` da fila de prontidão; devolve inseridos e ignorados. */
  build: (limit: number) => Promise<{ inserted: number; skipped: number }>;
  /** Importa no máximo `missing` empresas novas; devolve quantas entraram. */
  refill: (missing: number) => Promise<number>;
  maxRounds?: number;
}): Promise<FillSummary> {
  const maxRounds = input.maxRounds ?? 4;
  let reserved = 0;
  let skipped = 0;
  let imported = 0;
  let rounds = 0;

  const first = await input.build(input.target);
  reserved += first.inserted;
  skipped += first.skipped;
  const reusedFromQueue = first.inserted;

  while (reserved < input.target && rounds < maxRounds) {
    rounds += 1;
    const deficit = input.target - reserved;
    const got = await input.refill(deficit);
    imported += got;
    if (got <= 0) break;
    const again = await input.build(input.target - reserved);
    reserved += again.inserted;
    skipped += again.skipped;
    if (again.inserted <= 0) break;
  }

  return {
    reusedFromQueue,
    imported,
    reserved,
    skipped,
    missing: Math.max(0, input.target - reserved),
    complete: reserved >= input.target,
    rounds,
  };
}

// ---------------------------------------------------------------------------
// Piloto automático (lotes encadeados)
// ---------------------------------------------------------------------------

export type AutopilotSettings = {
  enabled: boolean;
  batch_size: number;
  rest_minutes: number;
  min_interval_seconds: number;
  max_interval_seconds: number;
  daily_cap: number;
  /** Hora local (0–23) em que o envio pode começar. */
  window_start: number;
  /** Hora local (0–23) em que o envio precisa parar. */
  window_end: number;
};

export const AUTOPILOT_DEFAULTS: AutopilotSettings = {
  enabled: false,
  batch_size: 20,
  rest_minutes: 25,
  min_interval_seconds: 40,
  max_interval_seconds: 110,
  daily_cap: DEFAULT_DAILY_UNIQUE_CAP,
  window_start: 8,
  window_end: 20,
};

/** Sorteia um intervalo diferente para cada mensagem, dentro da faixa segura. */
export function pickJitterInterval(
  minSeconds: number,
  maxSeconds: number,
  rand: () => number = Math.random,
): number {
  const min = Math.max(MIN_INTERVAL_SECONDS, Math.floor(Number(minSeconds) || MIN_INTERVAL_SECONDS));
  const maxRaw = Math.floor(Number(maxSeconds) || min);
  const max = Math.max(min, Math.min(3600, maxRaw));
  const r = Math.min(0.999999, Math.max(0, rand()));
  return min + Math.floor(r * (max - min + 1));
}

/** A hora local está dentro da janela permitida? Janela igual = 24 h. */
export function isWithinWindow(hour: number, start: number, end: number): boolean {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const s = ((Math.floor(start) % 24) + 24) % 24;
  const e = ((Math.floor(end) % 24) + 24) % 24;
  if (s === e) return true;
  if (s < e) return h >= s && h < e;
  return h >= s || h < e; // janela que atravessa a meia-noite
}

export type NextBatchDecision = {
  start: boolean;
  /** Quantas empresas o próximo lote deve tentar enviar. */
  size: number;
  reason:
    | 'ok'
    | 'disabled'
    | 'running'
    | 'resting'
    | 'daily_cap'
    | 'outside_window';
};

/**
 * Decide se o piloto pode criar o próximo lote agora.
 * Puro: recebe o relógio, o teto e a última conclusão.
 */
export function shouldStartNextBatch(input: {
  enabled: boolean;
  hasRunningCampaign: boolean;
  lastFinishedAt: number | null;
  restMinutes: number;
  sent24: number;
  dailyCap: number;
  batchSize: number;
  now: number;
  hourLocal: number;
  windowStart: number;
  windowEnd: number;
}): NextBatchDecision {
  if (!input.enabled) return { start: false, size: 0, reason: 'disabled' };
  if (input.hasRunningCampaign) return { start: false, size: 0, reason: 'running' };
  if (!isWithinWindow(input.hourLocal, input.windowStart, input.windowEnd)) {
    return { start: false, size: 0, reason: 'outside_window' };
  }
  const remaining = remainingDailyCap(input.dailyCap, input.sent24);
  if (remaining <= 0) return { start: false, size: 0, reason: 'daily_cap' };
  if (input.lastFinishedAt !== null) {
    const restMs = Math.max(0, Math.floor(input.restMinutes)) * 60_000;
    if (input.now - input.lastFinishedAt < restMs) {
      return { start: false, size: 0, reason: 'resting' };
    }
  }
  const size = Math.max(1, Math.min(Math.floor(input.batchSize), remaining));
  return { start: true, size, reason: 'ok' };
}

/** Nome legível do lote automático: "Auto 12/08 · lote 3". */
export function autopilotBatchName(sequence: number, date = new Date()): string {
  const d = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  return `Auto ${d} · lote ${Math.max(1, Math.floor(sequence))}`;
}
