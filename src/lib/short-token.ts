// Tokens públicos são UUID-hex de 32 caracteres — deixam a URL do e-mail
// enorme e "quebrada" em vários clientes. Nas URLs enviadas ao cliente usamos
// apenas o prefixo curto; a resolução no servidor aceita os dois formatos
// (prefixo curto ou token completo), então links antigos continuam válidos.
export const SHORT_TOKEN_LEN = 10;

export function shortToken(token: string | null | undefined): string {
  return (token || '').slice(0, SHORT_TOKEN_LEN);
}

/**
 * Aplica o filtro correto em uma query do Supabase sobre `public_token`:
 * igualdade quando recebe o token completo, prefixo quando recebe o código curto.
 */
export function filterByPublicToken<T>(query: T, token: string): T {
  const q = query as any;
  if (token.length >= 32) return q.eq('public_token', token);
  return q.like('public_token', `${token}%`);
}
