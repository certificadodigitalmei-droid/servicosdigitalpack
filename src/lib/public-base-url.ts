// Domínio publicado usado para montar URLs públicas (links /c/:token e checkout).
// Sempre use esta constante — nunca `window.location.origin` — para evitar
// links quebrados quando a página é aberta em iframe/preview ou o origin
// retorna vazio.
export const PUBLIC_BASE_URL = 'https://certificadodigitalccmei.online';

export function buildPublicUrl(token: string): string {
  return `${PUBLIC_BASE_URL}/acesso/${token}`;
}


export function buildCheckoutUrl(token: string): string {
  return `${PUBLIC_BASE_URL}/checkout/${token}`;
}
