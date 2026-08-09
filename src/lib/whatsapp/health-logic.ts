// Regras puras de saúde da conta WhatsApp (sem rede, sem segredo).
// Usadas pelo painel e pelo motor de campanhas.

export type AccountHealth = {
  /** Número exibido pela Meta (ex.: +55 11 9...). null = não informado pela API. */
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  /** CONNECTED | DISCONNECTED | ... */
  connectionStatus: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  /** Limite numérico de conversas por 24h, quando a API informar. */
  messagingLimit: number | null;
  nameStatus: string | null;
  platformHealthStatus: string | null;
  wabaStatus: string | null;
  wabaReviewStatus: string | null;
  /** Erro de autenticação/rede na consulta (mostrado como alerta). */
  error: string | null;
  checkedAt: string;
};

export const NOT_REPORTED = 'Não informado pela API';

export function emptyHealth(error: string | null = null): AccountHealth {
  return {
    displayPhoneNumber: null,
    verifiedName: null,
    connectionStatus: null,
    qualityRating: null,
    messagingLimitTier: null,
    messagingLimit: null,
    nameStatus: null,
    platformHealthStatus: null,
    wabaStatus: null,
    wabaReviewStatus: null,
    error,
    checkedAt: new Date().toISOString(),
  };
}

const TIER_TO_LIMIT: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
};

/** Converte o "tier" oficial em número. Nunca inventa valor quando o tier não vier. */
export function limitFromTier(tier: unknown): number | null {
  const t = String(tier ?? '').toUpperCase().replace(/^MESSAGING_LIMIT_/, '');
  if (!t) return null;
  if (t === 'TIER_UNLIMITED' || t === 'UNLIMITED') return null;
  return TIER_TO_LIMIT[t] ?? null;
}

function str(v: unknown): string | null {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s ? s : null;
}

/** Extrai a saúde a partir das respostas cruas do número e da WABA. */
export function parseHealthPayload(phoneJson: any, wabaJson: any, error: string | null = null): AccountHealth {
  const p = phoneJson?._data ?? phoneJson ?? {};
  const w = wabaJson?._data ?? wabaJson ?? {};
  const tier = str(p.messaging_limit_tier ?? p.messaging_limit ?? null);
  return {
    displayPhoneNumber: str(p.display_phone_number),
    verifiedName: str(p.verified_name),
    connectionStatus: str(p.status ?? p.connection_status),
    qualityRating: str(p.quality_rating),
    messagingLimitTier: tier,
    messagingLimit: limitFromTier(tier),
    nameStatus: str(p.name_status),
    platformHealthStatus: str(p.health_status?.can_send_message ?? p.health_status),
    wabaStatus: str(w.status),
    wabaReviewStatus: str(w.account_review_status),
    error,
    checkedAt: new Date().toISOString(),
  };
}

export type HealthVerdict = {
  /** true = pode iniciar/continuar envios. */
  canSend: boolean;
  /** Motivo auditável do bloqueio (null quando pode enviar). */
  blockReason: string | null;
  warnings: string[];
};

/**
 * Só bloqueia com informação explícita e ruim. Campo ausente nunca bloqueia
 * (a API da Chakra pode simplesmente não devolver o dado).
 */
export function evaluateHealth(h: AccountHealth | null | undefined, used24h = 0): HealthVerdict {
  const warnings: string[] = [];
  if (!h) return { canSend: true, blockReason: null, warnings: ['Saúde da conta ainda não consultada.'] };

  if (h.error && /401|403|unauthor|forbidden|credential|token/i.test(h.error)) {
    return { canSend: false, blockReason: `Falha de autenticação na API: ${h.error}`, warnings };
  }
  if (h.error) warnings.push(`Não foi possível ler todos os dados da conta: ${h.error}`);

  const conn = (h.connectionStatus ?? '').toUpperCase();
  if (conn && /DISCONNECTED|BANNED|RESTRICTED|FLAGGED/.test(conn)) {
    return { canSend: false, blockReason: `Número com status "${h.connectionStatus}" na Meta.`, warnings };
  }

  const quality = (h.qualityRating ?? '').toUpperCase();
  if (quality === 'RED' || quality === 'LOW') {
    return { canSend: false, blockReason: 'Qualidade do número está baixa (vermelha) na Meta.', warnings };
  }
  if (quality === 'YELLOW' || quality === 'MEDIUM') warnings.push('Qualidade do número está média — reduza o ritmo.');

  const review = (h.wabaReviewStatus ?? '').toUpperCase();
  if (review && review !== 'APPROVED') {
    return { canSend: false, blockReason: `Conta WhatsApp Business com análise "${h.wabaReviewStatus}".`, warnings };
  }

  if (typeof h.messagingLimit === 'number' && h.messagingLimit > 0 && used24h >= h.messagingLimit) {
    return { canSend: false, blockReason: 'Limite oficial de conversas em 24 horas foi atingido.', warnings };
  }

  return { canSend: true, blockReason: null, warnings };
}

/** Rótulos em português para o painel. */
export function healthLabel(value: string | null | undefined): string {
  if (!value) return NOT_REPORTED;
  const v = String(value).toUpperCase();
  const map: Record<string, string> = {
    CONNECTED: 'Conectado',
    DISCONNECTED: 'Desconectado',
    PENDING: 'Aguardando',
    APPROVED: 'Aprovada',
    DECLINED: 'Recusada',
    GREEN: 'Alta',
    YELLOW: 'Média',
    RED: 'Baixa',
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    UNKNOWN: NOT_REPORTED,
    AVAILABLE: 'Disponível',
    TRUE: 'Sim',
    FALSE: 'Não',
  };
  return map[v] ?? String(value);
}

/** Máscara para logs/painel: mantém DDI/DDD e os 2 últimos dígitos. */
export function maskPhone(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (d.length < 6) return '—';
  return `${d.slice(0, 4)}•••••${d.slice(-2)}`;
}

/** Mensagem de erro amigável para o log operacional. */
export function friendlyError(message: string | null | undefined): string {
  const m = String(message ?? '').trim();
  if (!m) return '—';
  if (/429|rate/i.test(m)) return 'Muitas mensagens em pouco tempo (a Meta pediu para aguardar).';
  if (/401|403|unauthor|forbidden/i.test(m)) return 'Problema de autenticação com a API.';
  if (/template/i.test(m)) return 'Problema com o modelo de mensagem.';
  if (/not.*whatsapp|inv[aá]lido|invalid/i.test(m)) return 'O número não tem WhatsApp válido.';
  if (/timeout|network|fetch failed|ECONN/i.test(m)) return 'Falha de conexão com a API.';
  return m.length > 120 ? `${m.slice(0, 117)}…` : m;
}
