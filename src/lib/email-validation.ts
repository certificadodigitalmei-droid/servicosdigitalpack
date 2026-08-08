// Validação de e-mail para reduzir bounce.
// Use apenas regras locais (sem verificação de MX) para manter a velocidade
// e compatibilidade com o runtime edge.

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'mailinator.com',
  'yopmail.com',
  'throwawaymail.com',
  'fakeinbox.com',
  'sharklasers.com',
  'getairmail.com',
  'burnermail.io',
  'tempmail.com',
  'tempmailaddress.com',
  'dispostable.com',
  'mailnesia.com',
  'getnada.com',
  'inboxbear.com',
  'trashmail.com',
  'mytrashmail.com',
  'mailcatch.com',
  'spamgourmet.com',
  'boun.cr',
  'boximail.com',
  'deadaddress.com',
  'emailondeck.com',
  'fake-email.pp.ua',
  'getemaildomain.com',
  'gettempmail.com',
  'gmailinator.com',
  'harakirimail.com',
  'maildrop.cc',
  'mailforspam.com',
  'mailhog.biz',
  'mailtothis.com',
  'mintemail.com',
  'mohmal.com',
  'nada.email',
  'nada.ltd',
  'neverbox.com',
  'owlpic.com',
  'pokemail.net',
  'proxymail.eu',
  'reconmail.com',
  'rtrtr.com',
  's0ny.net',
  'smashmail.de',
  'snakemail.com',
  'spambog.com',
  'spambox.us',
  'spamex.com',
  'spamhereplease.com',
  'spamstack.net',
  'supermailer.jp',
  'tempinbox.com',
  'temporaryemail.us',
  'tempymail.com',
  'thraml.com',
  'trash2009.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'trashmail.org',
  'trashmail.ws',
  'upliftnow.com',
  'uplipht.com',
  'venompen.com',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'whtjddn.33mail.com',
  'willhackforfood.biz',
  'wmail.club',
  'xagloo.com',
  'yopmail.fr',
  'yopmail.net',
  'yopmail.pp.ua',
]);

const ROLE_LOCAL_PARTS = new Set([
  'admin',
  'administrador',
  'contato',
  'contact',
  'info',
  'suporte',
  'support',
  'vendas',
  'sales',
  'atendimento',
  'financeiro',
  'rh',
  'recursos_humanos',
  'comercial',
  'marketing',
  'sac',
  'ouvidoria',
  'help',
  'postmaster',
  'webmaster',
  'hostmaster',
  'abuse',
  'no-reply',
  'noreply',
  'naoresponder',
  'nao-responder',
]);

const GENERIC_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'ig.com.br',
  'r7.com',
  'zipmail.com.br',
  'globo.com',
  'globomail.com',
  'oi.com.br',
]);

export type EmailValidationResult =
  | { valid: true; normalized: string; reason: null }
  | { valid: false; normalized: string | null; reason: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  // Regex conservador: rejeita espaços, caracteres estranhos e requer TLD.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function hasValidLocalPart(email: string): boolean {
  const local = email.split('@')[0];
  if (!local) return false;
  // Rejeita local part com pontos consecutivos, começando/terminando com ponto,
  // ou com caracteres muito estranhos.
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (local.length > 64) return false;
  return true;
}

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

export function isRoleEmail(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase();
  if (!local) return false;
  return ROLE_LOCAL_PARTS.has(local);
}

export function isGenericConsumerDomain(domain: string): boolean {
  return GENERIC_DOMAINS.has(domain.toLowerCase());
}

export function validateEmailForSending(email: string): EmailValidationResult {
  const normalized = normalizeEmail(email);

  if (!normalized || !normalized.includes('@')) {
    return { valid: false, normalized, reason: 'e-mail em branco ou sem @' };
  }

  if (!isValidEmailFormat(normalized)) {
    return { valid: false, normalized, reason: 'formato de e-mail inválido' };
  }

  if (!hasValidLocalPart(normalized)) {
    return { valid: false, normalized, reason: 'parte local do e-mail inválida' };
  }

  const domain = normalized.split('@')[1];
  if (!domain) {
    return { valid: false, normalized, reason: 'domínio ausente' };
  }

  if (isDisposableDomain(domain)) {
    return { valid: false, normalized, reason: 'domínio descartável' };
  }

  // E-mails de papel (contato@, admin@, etc.) têm alta chance de bounce
  // quando a pessoa responsável muda. Rejeitamos para campanhas em massa.
  if (isRoleEmail(normalized)) {
    return { valid: false, normalized, reason: 'e-mail genérico de departamento' };
  }

  return { valid: true, normalized, reason: null };
}

export function validateEmailForImport(email: string): EmailValidationResult {
  // Na importação somos um pouco menos restritivos: aceitamos domínios
  // genéricos de consumidor (gmail, hotmail...) porque MEIs frequentemente
  // usam e-mails pessoais. Mas rejeitamos descartáveis e formatos inválidos.
  const normalized = normalizeEmail(email);

  if (!normalized || !normalized.includes('@')) {
    return { valid: false, normalized, reason: 'e-mail em branco ou sem @' };
  }

  if (!isValidEmailFormat(normalized)) {
    return { valid: false, normalized, reason: 'formato de e-mail inválido' };
  }

  if (!hasValidLocalPart(normalized)) {
    return { valid: false, normalized, reason: 'parte local do e-mail inválida' };
  }

  const domain = normalized.split('@')[1];
  if (!domain) {
    return { valid: false, normalized, reason: 'domínio ausente' };
  }

  if (isDisposableDomain(domain)) {
    return { valid: false, normalized, reason: 'domínio descartável' };
  }

  return { valid: true, normalized, reason: null };
}
