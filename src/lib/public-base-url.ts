// Origem pública usada para montar TODOS os links enviados ao cliente
// (links /acesso/:token, checkout, imagens dos e-mails).
//
// O valor é resolvido em tempo de execução: quando o site é aberto em um
// domínio próprio, esse domínio vira automaticamente a base dos links —
// inclusive dos botões dos modelos de e-mail. Assim, trocar o domínio do
// projeto não exige nenhuma alteração de código.
import { shortToken } from './short-token';

/** Usado só enquanto o domínio real ainda não foi detectado/persistido. */
// Mantido igual ao domínio do remetente: alinhamento entre o domínio dos links
// e o domínio que assina o e-mail (SPF/DKIM/DMARC) é o que mais reduz spam.
export const DEFAULT_PUBLIC_BASE_URL = 'https://seuceritificadodigitalmei.online';

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Domínios internos/temporários nunca devem virar base de links públicos. */
export function isUsablePublicOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1') return false;
    if (h.endsWith('.lovable.app') || h.endsWith('.lovableproject.com')) return false;
    if (h.endsWith('.lovable.dev')) return false;
    return h.includes('.');
  } catch {
    return false;
  }
}

let runtimeBaseUrl: string | null = null;

/** Define a origem detectada (navegador ou servidor). Ignora domínios internos. */
export function setRuntimePublicBaseUrl(origin: string | null | undefined): void {
  if (!isUsablePublicOrigin(origin)) return;
  runtimeBaseUrl = normalize(origin!);
}

export function getPublicBaseUrl(): string {
  if (typeof window !== 'undefined' && isUsablePublicOrigin(window.location.origin)) {
    return normalize(window.location.origin);
  }
  if (runtimeBaseUrl) return runtimeBaseUrl;
  const envUrl =
    typeof process !== 'undefined' ? process.env?.PUBLIC_APP_URL || undefined : undefined;
  if (isUsablePublicOrigin(envUrl)) return normalize(envUrl!);
  return DEFAULT_PUBLIC_BASE_URL;
}

export function buildPublicUrl(token: string): string {
  return `${getPublicBaseUrl()}/acesso/${shortToken(token)}`;
}

export function buildCheckoutUrl(token: string): string {
  return `${getPublicBaseUrl()}/checkout/${shortToken(token)}`;
}

/** Converte caminho relativo em URL absoluta usando o domínio atual. */
export function toAbsolutePublicUrl(path: string): string {
  const s = String(path || '').trim();
  if (!s) return '';
  if (/^(https?:|data:|cid:)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  const base = getPublicBaseUrl();
  return s.startsWith('/') ? `${base}${s}` : `${base}/${s}`;
}
