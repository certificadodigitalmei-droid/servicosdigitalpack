// Server-only Gmail API helpers. Never import from browser code.
// Uses HTTPS-only Google APIs (no SMTP/TCP — not supported on Workers).

type TokenCache = { accessToken: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

export class GmailError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GmailError';
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new GmailError(`Segredo ausente: ${name}`, 500, 'missing_secret');
  return v;
}

export function getSenderEmail(): string {
  return requireEnv('GOOGLE_SENDER_EMAIL');
}

export function hasAllGoogleSecrets(): { ok: boolean; missing: string[] } {
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_SENDER_EMAIL'];
  const missing = names.filter((n) => !process.env[n]);
  return { ok: missing.length === 0, missing };
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.accessToken;

  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const refreshToken = requireEnv('GOOGLE_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GmailError(
      `Falha ao renovar token OAuth (status ${res.status})`,
      res.status,
      'oauth_refresh_failed',
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

export async function fetchGmailProfile(): Promise<{ emailAddress: string; messagesTotal?: number }> {
  const token = await getAccessToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new GmailError(`Gmail profile falhou (status ${res.status})`, res.status, 'profile_failed');
  }
  return (await res.json()) as { emailAddress: string; messagesTotal?: number };
}

// RFC 2822 header injection guard: any CR/LF in a header field is a hard reject.
function assertHeaderSafe(name: string, value: string) {
  if (/[\r\n]/.test(value)) {
    throw new GmailError(`Cabeçalho inválido em ${name}`, 400, 'header_injection');
  }
}

function base64UrlEncode(input: string): string {
  // btoa handles Latin-1; encode utf-8 bytes first.
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Standard base64 (RFC 4648) with CRLF line wrapping at 76 chars — required
 * by `Content-Transfer-Encoding: base64` MIME parts. URL-safe base64 breaks
 * Gmail's part decoder and was the root cause of the "</tr" leak seen in
 * the inbox.
 */
function base64MimeEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/(.{76})/g, '$1\r\n');
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export function buildRfc2822({
  to,
  subject,
  html,
  text,
  fromEmail,
  fromName,
  replyTo,
  listUnsubscribe,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  listUnsubscribe?: string;
}): string {
  assertHeaderSafe('to', to);
  assertHeaderSafe('subject', subject);
  assertHeaderSafe('from', fromEmail);
  if (fromName) assertHeaderSafe('fromName', fromName);
  if (replyTo) assertHeaderSafe('replyTo', replyTo);
  if (listUnsubscribe) assertHeaderSafe('listUnsubscribe', listUnsubscribe);

  const from = fromName ? `${encodeMimeHeader(fromName)} <${fromEmail}>` : fromEmail;
  const boundary = `bnd_${crypto.randomUUID().replace(/-/g, '')}`;
  const domain = fromEmail.split('@')[1] || 'localhost';

  const headerLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (replyTo) headerLines.push(`Reply-To: ${replyTo}`);
  if (listUnsubscribe) {
    headerLines.push(`List-Unsubscribe: ${listUnsubscribe}`);
    headerLines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }
  const headers = headerLines.join('\r\n');

  const textBody =
    text ||
    (html
      ? html
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+\n/g, '\n')
          .trim()
      : '');

  const parts: string[] = [];
  parts.push(
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64MimeEncode(textBody),
    ].join('\r\n'),
  );
  if (html) {
    parts.push(
      [
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        base64MimeEncode(html),
      ].join('\r\n'),
    );
  }
  parts.push(`--${boundary}--`);

  return `${headers}\r\n\r\n${parts.join('\r\n')}\r\n`;
}

export const DEFAULT_FROM_NAME = 'Certificado Digital MEI';

export async function sendGmailMessage(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
  listUnsubscribe?: string;
}): Promise<{ messageId: string }> {
  const fromEmail = getSenderEmail();
  const raw = buildRfc2822({
    ...opts,
    fromEmail,
    fromName: opts.fromName || DEFAULT_FROM_NAME,
  });
  const encoded = base64UrlEncode(raw);
  const token = await getAccessToken();

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    },
  );

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') || '60');
    throw new GmailError('Rate limit da Gmail API', 429, 'rate_limited', retryAfter);
  }
  if (res.status >= 500) {
    throw new GmailError(`Gmail 5xx (${res.status})`, res.status, 'server_error');
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    // Never log full body — could contain PII/token; store only status + short code
    throw new GmailError(`Gmail rejeitou envio (${res.status})`, res.status, `http_${res.status}`);
  }

  const json = (await res.json()) as { id: string };
  return { messageId: json.id };
}
