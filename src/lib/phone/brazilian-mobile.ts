// Validador puro de celular brasileiro.
// Sem rede, sem banco — reutilizado na importação Casa dos Dados,
// no upsert de empresas, no enfileiramento e no envio de WhatsApp.

export const VALID_DDDS: ReadonlySet<string> = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export type MobileReason =
  | 'empty'
  | 'landline'
  | 'invalid_length'
  | 'invalid_ddd'
  | 'not_mobile'
  | 'repeated_digits'
  | 'sequential_digits'
  | 'landline_type';

export type MobileValidation =
  | { valid: true; e164: string; ddd: string; subscriber: string; reason: null }
  | { valid: false; e164: null; ddd: string | null; subscriber: string | null; reason: MobileReason };

function fail(reason: MobileReason, ddd: string | null = null, subscriber: string | null = null): MobileValidation {
  return { valid: false, e164: null, ddd, subscriber, reason };
}

function allSameDigits(s: string): boolean {
  return s.length > 0 && /^(\d)\1+$/.test(s);
}

function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < s.length; i += 1) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

/**
 * Valida um telefone brasileiro e devolve o celular em E.164 sem "+".
 * Aceita entrada com ou sem 55, com máscara, e DDD separado.
 * Só aprova parte nacional com 11 dígitos: DDD Anatel + assinante iniciando em 9.
 */
export function validateBrazilianMobile(
  raw: string | number | null | undefined,
  ddd?: string | number | null,
): MobileValidation {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return fail('empty');

  let national = digits;

  // Remove prefixo internacional já presente (nunca duplicar).
  if (national.length > 11 && national.startsWith('55')) national = national.slice(2);

  // Número local (8 ou 9 dígitos) + DDD informado separadamente.
  if ((national.length === 8 || national.length === 9) && ddd != null) {
    const d = String(ddd).replace(/\D/g, '');
    if (d.length === 2) national = d + national;
  }

  // DDD duplicado (ex.: 1111999999999).
  while (
    (national.length === 12 || national.length === 13) &&
    national.slice(0, 2) === national.slice(2, 4)
  ) {
    national = national.slice(2);
  }
  if (national.length > 11 && national.startsWith('55')) national = national.slice(2);

  if (national.length === 10) return fail('landline', national.slice(0, 2), national.slice(2));
  if (national.length !== 11) return fail('invalid_length');

  if (allSameDigits(national)) return fail('repeated_digits');
  if (isSequential(national)) return fail('sequential_digits');

  const d = national.slice(0, 2);
  const subscriber = national.slice(2);
  if (!VALID_DDDS.has(d)) return fail('invalid_ddd', d, subscriber);
  if (!subscriber.startsWith('9')) return fail('not_mobile', d, subscriber);
  if (allSameDigits(subscriber)) return fail('repeated_digits', d, subscriber);
  if (isSequential(subscriber)) return fail('sequential_digits', d, subscriber);

  return { valid: true, e164: `55${national}`, ddd: d, subscriber, reason: null };
}

const MOBILE_TYPE = /(celular|cel\b|movel|móvel|mobile|whats)/i;
const LANDLINE_TYPE = /(fixo|fixa|landline|fax|comercial fixo)/i;

type ContactLike = Record<string, unknown> | string | number | null | undefined;

function contactToCandidate(c: ContactLike, fallbackDdd?: string | null): { value: string; ddd: string | null; type: string } | null {
  if (c == null) return null;
  if (typeof c === 'string' || typeof c === 'number') {
    return { value: String(c), ddd: fallbackDdd ?? null, type: '' };
  }
  if (typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  const value = ['completo', 'numero', 'telefone', 'phone', 'number']
    .map((k) => o[k])
    .find((v) => typeof v === 'string' || typeof v === 'number');
  if (value == null) return null;
  const localDdd = ['ddd', 'ddd_telefone', 'area_code'].map((k) => o[k]).find((v) => v != null);
  const type = String(o['tipo'] ?? o['type'] ?? '');
  return { value: String(value), ddd: localDdd != null ? String(localDdd) : (fallbackDdd ?? null), type };
}

/**
 * Escolhe o melhor celular a partir de uma entrada solta ou de uma lista de
 * contatos. Prefere explicitamente tipo celular/mobile/whatsapp e NUNCA usa
 * contato marcado como fixo/fax.
 */
export function extractValidBrazilianMobile(
  input: ContactLike | ContactLike[],
  fallbackDdd?: string | null,
): MobileValidation {
  const list: ContactLike[] = Array.isArray(input) ? input : [input];
  const candidates = list
    .map((c) => contactToCandidate(c, fallbackDdd))
    .filter(Boolean) as Array<{ value: string; ddd: string | null; type: string }>;

  if (!candidates.length) return fail('empty');

  const mobileFirst = [
    ...candidates.filter((c) => MOBILE_TYPE.test(c.type)),
    ...candidates.filter((c) => !MOBILE_TYPE.test(c.type) && !LANDLINE_TYPE.test(c.type)),
  ];

  let lastFailure: MobileValidation = fail('empty');
  for (const c of mobileFirst) {
    const r = validateBrazilianMobile(c.value, c.ddd);
    if (r.valid) return r;
    lastFailure = r;
  }
  // Havia apenas contatos marcados como fixo.
  if (!mobileFirst.length) return fail('landline_type');
  return lastFailure;
}

/** Valor canônico para deduplicação quando o número não normaliza para E.164. */
export function canonicalPhoneKey(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits ? digits : null;
}
