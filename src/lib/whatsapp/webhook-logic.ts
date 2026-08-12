// Regras puras do webhook de status do WhatsApp (Meta/Chakra).
// Sem rede, sem banco, sem segredo — testável isoladamente.

export type WaDeliveryStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed';

export const DELIVERY_RANK: Record<WaDeliveryStatus, number> = {
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

/** Códigos da Meta que significam falha DEFINITIVA do destinatário. */
export const FINAL_FAILURE_CODES = new Set(['131026', '130472']);

export type ParsedStatusEvent = {
  wamid: string;
  status: WaDeliveryStatus;
  recipient: string | null;
  occurredAt: string;
  errorCode: string | null;
  errorTitle: string | null;
  errorDetails: string | null;
  finalFailure: boolean;
};

export type ParsedInboundMessage = {
  wamid: string;
  from: string | null;
  text: string | null;
  occurredAt: string;
};

export type ParsedWebhook = {
  statuses: ParsedStatusEvent[];
  inbound: ParsedInboundMessage[];
};

function toIso(ts: unknown): string {
  if (typeof ts === 'number') return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
  const s = String(ts ?? '').trim();
  if (!s) return new Date().toISOString();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}

function str(v: unknown): string | null {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s ? s : null;
}

export function normalizeDeliveryStatus(raw: unknown): WaDeliveryStatus | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'read' || s === 'seen') return 'read';
  if (s === 'delivered') return 'delivered';
  if (s === 'sent') return 'sent';
  if (s === 'accepted' || s === 'queued' || s === 'submitted' || s === 'pending') return 'accepted';
  if (
    s === 'failed' ||
    s === 'rejected' ||
    s === 'undeliverable' ||
    s === 'error' ||
    s.includes('reject') ||
    s.includes('fail')
  ) {
    return 'failed';
  }
  return null;
}

function parseError(entry: any): { code: string | null; title: string | null; details: string | null } {
  const errs = entry?.errors ?? entry?.error ?? null;
  const e = Array.isArray(errs) ? errs[0] : errs;
  if (!e) return { code: null, title: null, details: null };
  return {
    code: str(e.code ?? e.error_code ?? e.errorCode),
    title: str(e.title ?? e.message ?? e.error_title),
    details: str(e.error_data?.details ?? e.details ?? e.message ?? e.description),
  };
}

function pushStatus(out: ParsedStatusEvent[], raw: any) {
  const wamid = str(raw?.externalId ?? raw?.wamid ?? raw?.id ?? raw?.messageId ?? raw?.message_id);
  const status = normalizeDeliveryStatus(raw?.status ?? raw?.deliveryStatus ?? raw?.delivery_status);
  if (!wamid || !status) return;
  const err = parseError(raw);
  out.push({
    wamid,
    status,
    recipient: str(raw?.recipient_id ?? raw?.recipient ?? raw?.to ?? raw?.phoneNumber),
    occurredAt: toIso(raw?.timestamp ?? raw?.updatedAt ?? raw?.createdAt),
    errorCode: err.code,
    errorTitle: err.title,
    errorDetails: err.details,
    finalFailure: status === 'failed' && !!err.code && FINAL_FAILURE_CODES.has(String(err.code)),
  });
}

/**
 * Aceita o formato bruto da Meta (entry[].changes[].value.statuses[]),
 * o formato amigável da Chakra (_data / statuses no topo) e eventos avulsos.
 */
export function parseWhatsappWebhook(payload: unknown): ParsedWebhook {
  const statuses: ParsedStatusEvent[] = [];
  const inbound: ParsedInboundMessage[] = [];
  const body: any = payload ?? {};

  const entries: any[] = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      for (const s of Array.isArray(value.statuses) ? value.statuses : []) pushStatus(statuses, s);
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const wamid = str(m?.id);
        if (!wamid) continue;
        inbound.push({
          wamid,
          from: str(m?.from),
          text: str(m?.text?.body ?? m?.button?.text ?? m?.interactive?.button_reply?.title),
          occurredAt: toIso(m?.timestamp),
        });
      }
    }
  }

  // Formatos amigáveis / avulsos.
  for (const s of Array.isArray(body.statuses) ? body.statuses : []) pushStatus(statuses, s);
  const data = body._data ?? body.data ?? null;
  if (data && !Array.isArray(data)) pushStatus(statuses, data);
  if (Array.isArray(data)) for (const d of data) pushStatus(statuses, d);
  if (!entries.length && !Array.isArray(body.statuses)) pushStatus(statuses, body);

  // Deduplica por wamid+status mantendo o evento mais recente.
  const seen = new Map<string, ParsedStatusEvent>();
  for (const s of statuses) seen.set(`${s.wamid}::${s.status}`, s);

  return { statuses: Array.from(seen.values()), inbound };
}

/** Só avança na linha do tempo; falha é terminal e sempre aplicada. */
export function canApplyStatus(current: string | null | undefined, next: WaDeliveryStatus): boolean {
  const cur = normalizeDeliveryStatus(current);
  if (!cur) return true;
  if (cur === 'failed') return false;
  if (next === 'failed') return true;
  return DELIVERY_RANK[next] > DELIVERY_RANK[cur];
}

/** Situação do item da fila a partir do status de entrega. */
export function itemStatusForDelivery(status: WaDeliveryStatus, finalFailure: boolean): string {
  if (status === 'failed') return finalFailure ? 'blocked' : 'failed';
  return 'sent';
}

export type QueueItem = {
  status: string;
  wamid?: string | null;
  delivery_status?: string | null;
  locked_at?: string | null;
  next_attempt_at?: string | null;
};

export type PendingBreakdown = {
  /** Itens realmente aguardando envio (não aceitos pela API). */
  pending: number;
  /** Itens travados em "sending" sem wamid há mais que o timeout. */
  stuck: number;
  /** Itens em "sending" que já têm wamid — tratados como aceitos. */
  acceptedButUnflushed: number;
};

/**
 * Conta a fila real: só pending/sending sem wamid entram.
 * sent/delivered/read/failed/blocked nunca contam.
 */
export function computePendingQueue(
  items: QueueItem[],
  opts: { nowMs?: number; stuckMs?: number } = {},
): PendingBreakdown {
  const now = opts.nowMs ?? Date.now();
  const stuckMs = opts.stuckMs ?? 10 * 60 * 1000;
  let pending = 0;
  let stuck = 0;
  let acceptedButUnflushed = 0;

  for (const it of items) {
    const st = String(it.status ?? '');
    if (st !== 'pending' && st !== 'sending') continue;
    if (it.wamid) {
      acceptedButUnflushed++;
      continue;
    }
    const delivery = normalizeDeliveryStatus(it.delivery_status);
    if (delivery && delivery !== 'accepted') continue;
    if (st === 'sending') {
      const lockedAt = it.locked_at ? Date.parse(it.locked_at) : NaN;
      if (!Number.isNaN(lockedAt) && now - lockedAt > stuckMs) {
        stuck++;
        continue;
      }
    }
    pending++;
  }

  return { pending, stuck, acceptedButUnflushed };
}

// ---------------------------------------------------------------------------
// Correlação por destinatário e métricas cumulativas
// ---------------------------------------------------------------------------

/**
 * Chave de comparação de telefone tolerante ao 9º dígito.
 * A Meta devolve o `wa_id` sem o 9 em vários DDDs, então o número enviado
 * (5571982836954) e o número do evento (557182836954) precisam bater.
 */
export function phoneMatchKey(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const national = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length < 10) return national;
  return national.slice(0, 2) + national.slice(-8);
}

export type CorrelationCandidate = { id: string; phone?: string | null; wamid?: string | null };

/**
 * Só correlaciona quando o telefone identifica UM único item sem wamid.
 * Empate ou ausência devolve null — nunca adivinha.
 */
export function correlateByRecipient(
  recipient: string | null | undefined,
  candidates: CorrelationCandidate[],
): string | null {
  const key = phoneMatchKey(recipient);
  if (!key) return null;
  const matches = candidates.filter((c) => !c.wamid && phoneMatchKey(c.phone) === key);
  return matches.length === 1 ? String(matches[0]!.id) : null;
}

export type MetricItem = {
  status?: string | null;
  delivery_status?: string | null;
  wamid?: string | null;
  accepted_at?: string | null;
  sent_at?: string | null;
  attempt_started_at?: string | null;
};

export type CumulativeMetrics = {
  /** Itens da campanha (inclui os que nunca foram tentados). */
  total: number;
  /** Chamadas realmente entregues à API (aceitas ou rejeitadas). */
  attempts: number;
  /** Aceitas pela API da Chakra. */
  accepted: number;
  /** Rejeitadas pela API ou pela Meta. */
  rejected: number;
  /** Confirmadas como enviadas pela Meta (sent + delivered + read). */
  metaSent: number;
  delivered: number;
  read: number;
  /** Aceitas sem nenhuma confirmação — nunca reenviar automaticamente. */
  confirmationPending: number;
  /** Ainda na fila, sem nenhuma tentativa. */
  queued: number;
  cancelled: number;
};

/** Contagem cumulativa da campanha inteira — não é janela de 24 h. */
export function cumulativeCampaignMetrics(items: MetricItem[]): CumulativeMetrics {
  const m: CumulativeMetrics = {
    total: 0, attempts: 0, accepted: 0, rejected: 0, metaSent: 0,
    delivered: 0, read: 0, confirmationPending: 0, queued: 0, cancelled: 0,
  };
  for (const it of items) {
    m.total++;
    const status = String(it.status ?? '');
    const delivery = normalizeDeliveryStatus(it.delivery_status);
    const tried = Boolean(it.wamid || it.accepted_at || it.sent_at || it.attempt_started_at) ||
      status === 'sent' || status === 'failed' || status === 'blocked' || status === 'confirmation_pending';

    if (status === 'cancelled') { m.cancelled++; continue; }
    if (!tried) { m.queued++; continue; }

    m.attempts++;
    if (status === 'confirmation_pending') { m.confirmationPending++; continue; }
    if (status === 'failed' || status === 'blocked' || delivery === 'failed') { m.rejected++; continue; }
    m.accepted++;
    if (delivery === 'sent' || delivery === 'delivered' || delivery === 'read') m.metaSent++;
    if (delivery === 'delivered' || delivery === 'read') m.delivered++;
    if (delivery === 'read') m.read++;
  }
  return m;
}
