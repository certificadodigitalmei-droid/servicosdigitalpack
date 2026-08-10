// Lógica pura da conexão de números remetentes (testável sem rede/banco).

export type ChakraPhoneNumber = {
  phoneNumberId: string;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: string | null;
  chakraStatus: string | null;
  qualityScore: string | null;
  messagingLimitTier: string | null;
  accountMode: string | null;
  nameStatus: string | null;
  raw: unknown;
};

/** IDs desconectados que nunca podem voltar como padrão automático. */
export const FORBIDDEN_SENDER_IDS = new Set(['1290004607527438', '1184158611458577']);
export const FORBIDDEN_WABA_IDS = new Set(['1996285911002627', '2078957462693945']);

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const inner = o['id'] ?? o['value'] ?? o['name'];
    return inner === undefined || inner === null ? null : String(inner);
  }
  const s = String(v).trim();
  return s ? s : null;
}

export function parseChakraPhoneNumber(item: any): ChakraPhoneNumber | null {
  const id = str(item?.id ?? item?.phoneNumberId ?? item?.whatsappPhoneNumberId);
  if (!id) return null;
  return {
    phoneNumberId: id,
    wabaId: str(item?.waba ?? item?.wabaId ?? item?.whatsappBusinessAccountId),
    displayPhoneNumber: str(item?.displayPhoneNumber ?? item?.display_phone_number),
    verifiedName: str(item?.verifiedName ?? item?.verified_name),
    status: str(item?.status)?.toUpperCase() ?? null,
    chakraStatus: str(item?.chakraStatus)?.toUpperCase() ?? null,
    qualityScore: str(item?.qualityScore ?? item?.quality_rating)?.toUpperCase() ?? null,
    messagingLimitTier: str(item?.messagingLimitTier ?? item?.messaging_limit_tier),
    accountMode: str(item?.accountMode),
    nameStatus: str(item?.nameStatus),
    raw: item ?? null,
  };
}

export function parseChakraPhoneNumbers(json: any): ChakraPhoneNumber[] {
  const raw = json?._data ?? json?.data ?? json;
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : raw ? [raw] : [];
  const out: ChakraPhoneNumber[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const parsed = parseChakraPhoneNumber(item);
    if (!parsed || seen.has(parsed.phoneNumberId)) continue;
    seen.add(parsed.phoneNumberId);
    out.push(parsed);
  }
  return out;
}

/** Elegível: Meta CONNECTED e, quando informado, Chakra CONNECTED. */
export function isEligibleSender(n: ChakraPhoneNumber): boolean {
  if (FORBIDDEN_SENDER_IDS.has(n.phoneNumberId)) return false;
  if (n.wabaId && FORBIDDEN_WABA_IDS.has(n.wabaId)) return false;
  if (!n.wabaId) return false;
  if (n.status !== 'CONNECTED') return false;
  if (n.chakraStatus && n.chakraStatus !== 'CONNECTED') return false;
  return true;
}

export type SelectionDecision = {
  selected: ChakraPhoneNumber | null;
  blocked: boolean;
  reason: string | null;
};

/**
 * 0 elegíveis → bloqueia; 1 → escolhe sozinho; vários → preserva a escolha
 * atual se ainda for elegível, senão bloqueia até o admin escolher.
 */
export function decideSenderSelection(
  eligible: ChakraPhoneNumber[],
  currentSelectedId: string | null,
): SelectionDecision {
  if (eligible.length === 0) {
    return { selected: null, blocked: true, reason: 'Nenhum número conectado no Chakra — envio bloqueado.' };
  }
  if (eligible.length === 1) {
    return { selected: eligible[0]!, blocked: false, reason: null };
  }
  const kept = currentSelectedId ? eligible.find((e) => e.phoneNumberId === currentSelectedId) : undefined;
  if (kept) return { selected: kept, blocked: false, reason: null };
  return {
    selected: null,
    blocked: true,
    reason: 'Vários números conectados e nenhuma seleção válida — escolha o remetente para liberar o envio.',
  };
}

export type SenderGuardInput = {
  sender: {
    phone_number_id?: string | null;
    waba_id?: string | null;
    status?: string | null;
    chakra_status?: string | null;
    is_active?: boolean | null;
    is_selected?: boolean | null;
  } | null;
  template: { name?: string | null; status?: string | null; waba_id?: string | null } | null;
  templateName: string | null;
};

/** Validação obrigatória antes de qualquer envio. */
export function validateSenderForSend(input: SenderGuardInput): { ok: boolean; error: string | null } {
  const s = input.sender;
  if (!s || !s.phone_number_id || !s.waba_id) {
    return { ok: false, error: 'Nenhum número remetente conectado e selecionado — sincronize a conexão.' };
  }
  if (FORBIDDEN_SENDER_IDS.has(String(s.phone_number_id)) || FORBIDDEN_WABA_IDS.has(String(s.waba_id))) {
    return { ok: false, error: 'Número remetente antigo/desconectado — selecione o número atual.' };
  }
  if (!s.is_active || !s.is_selected) {
    return { ok: false, error: 'O número remetente selecionado não está ativo — sincronize a conexão.' };
  }
  if (String(s.status ?? '').toUpperCase() !== 'CONNECTED') {
    return { ok: false, error: 'O número remetente não está CONNECTED no WhatsApp — envio bloqueado.' };
  }
  const chakra = String(s.chakra_status ?? '').toUpperCase();
  if (chakra && chakra !== 'CONNECTED') {
    return { ok: false, error: 'O número remetente não está conectado no Chakra — envio bloqueado.' };
  }
  const t = input.template;
  if (!input.templateName || !t) {
    return { ok: false, error: 'Modelo não encontrado nesta conta do WhatsApp — sincronize os modelos.' };
  }
  if (String(t.waba_id ?? '') !== String(s.waba_id)) {
    return { ok: false, error: 'O modelo pertence a outra conta do WhatsApp (WABA) — envio bloqueado.' };
  }
  if (String(t.status ?? '').toUpperCase() !== 'APPROVED') {
    return {
      ok: false,
      error: `Modelo com status ${String(t.status ?? 'PENDING').toUpperCase()}: envio bloqueado até a aprovação do WhatsApp.`,
    };
  }
  return { ok: true, error: null };
}

/** Confirmação recente da conexão (padrão: 30 minutos). */
export function isConnectionFresh(lastSeenAt: string | null | undefined, now: number, maxAgeMs = 30 * 60 * 1000): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t <= maxAgeMs;
}
