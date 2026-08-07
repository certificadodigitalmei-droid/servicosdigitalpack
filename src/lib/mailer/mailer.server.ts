// Server-only mailer. Envio 100% pela infraestrutura de e-mail da Lovable.
// Nenhuma dependência de Google/Gmail/OAuth.

import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js';

/** Subdomínio verificado e delegado aos nameservers da Lovable. */
export const SENDER_DOMAIN = 'notify.seu-certificado-mei-digital.online';

const DEFAULT_FROM_NAME = 'Certificado Digital MEI';
const DEFAULT_FROM_EMAIL = 'certificado.mei.estadual@seu-certificado-mei-digital.online';

export class MailError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

export function getSenderEmail(): string {
  return DEFAULT_FROM_EMAIL;
}

export function hasMailerConfigured(): { ok: boolean; missing: string[] } {
  const missing = process.env.LOVABLE_API_KEY ? [] : ['LOVABLE_API_KEY'];
  return { ok: missing.length === 0, missing };
}

async function resolveSender() {
  try {
    const { getEmailSenderSettings } = await import('@/lib/email-sender.functions');
    const s = await getEmailSenderSettings();
    return {
      name: s.from_name?.trim() || DEFAULT_FROM_NAME,
      email: s.from_email?.trim() || DEFAULT_FROM_EMAIL,
      reply_to: s.reply_to || null,
    };
  } catch {
    return { name: DEFAULT_FROM_NAME, email: DEFAULT_FROM_EMAIL, reply_to: null };
  }
}

/**
 * Envia uma mensagem já renderizada (html/texto) pela API gerenciada da Lovable.
 * Mantém a mesma assinatura usada pela fila de envio em massa.
 */
export async function sendMailMessage(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
  label?: string;
}): Promise<{ messageId: string; suppressed?: boolean }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new MailError('LOVABLE_API_KEY não configurada', 500, 'missing_secret');

  if (/[\r\n]/.test(opts.to) || /[\r\n]/.test(opts.subject)) {
    throw new MailError('Cabeçalho inválido', 400, 'header_injection');
  }

  const sender = await resolveSender();
  const idempotencyKey = opts.idempotencyKey || crypto.randomUUID();

  try {
    await sendLovableEmail(
      {
        to: opts.to,
        from: `${sender.name} <${sender.email}>`,
        sender_domain: SENDER_DOMAIN,
        subject: opts.subject,
        html: opts.html,
        text: opts.text || (opts.html ? opts.html.replace(/<[^>]+>/g, ' ') : ' '),
        purpose: 'transactional',
        label: opts.label ?? 'campanha',
        idempotency_key: idempotencyKey,
        ...(sender.reply_to ? { reply_to: sender.reply_to } : {}),
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    );
    return { messageId: idempotencyKey };
  } catch (e) {
    if (e instanceof EmailAPIError) {
      // Destinatário suprimido não é erro técnico: não adianta tentar de novo.
      if (e.code === 'recipient_suppressed') {
        return { messageId: idempotencyKey, suppressed: true };
      }
      const retryAfter = (e as any).retryAfterSeconds ?? (e.status === 429 ? 60 : undefined);
      throw new MailError(
        `${e.code ?? 'email_error'}: ${e.message}`,
        e.status ?? 500,
        e.status === 429 ? 'rate_limited' : e.code,
        retryAfter,
      );
    }
    throw new MailError((e as Error)?.message ?? 'erro desconhecido', 500, 'unknown_error');
  }
}
