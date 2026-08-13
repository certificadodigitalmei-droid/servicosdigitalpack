import * as React from 'react'
import { render } from '@react-email/render'
import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js'
import { TEMPLATES } from './registry'
import { recordEmailAudit } from '@/lib/emails/email-audit'

// Server-only: reads LOVABLE_API_KEY. Never import from client components.

// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers. NEVER use the root domain.
const SENDER_DOMAIN = "notify.certificadodigitalccmei.online"
// Fallback From values when site_settings has no configured sender.
const DEFAULT_FROM_NAME = "Digital Certifica A1"
const DEFAULT_FROM_EMAIL = "certificado.mei.estadual@certificadodigitalccmei.online"

let cachedSender: { name: string; email: string; reply_to?: string | null; logo_url?: string | null } | null = null;
let cachedSenderAt = 0;

async function resolveSender(): Promise<{ name: string; email: string; reply_to?: string | null; logo_url?: string | null }> {
  const now = Date.now();
  if (cachedSender && now - cachedSenderAt < 60_000) return cachedSender;
  try {
    const { getEmailSenderSettings } = await import('@/lib/email-sender.functions');
    const s = await getEmailSenderSettings();
    cachedSender = {
      name: s.from_name?.trim() || DEFAULT_FROM_NAME,
      email: s.from_email?.trim() || DEFAULT_FROM_EMAIL,
      reply_to: s.reply_to,
      logo_url: s.logo_url,
    };
  } catch {
    cachedSender = { name: DEFAULT_FROM_NAME, email: DEFAULT_FROM_EMAIL };
  }
  cachedSenderAt = now;
  return cachedSender;
}

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Renders a registered template and sends it through Lovable's managed email
 * API. Suppression, retries, and rate limits are enforced by Lovable
 * server-side. A suppressed recipient is an expected outcome
 * ({ sent: false }); any other failure throws — EmailAPIError exposes
 * .code and .status for branching.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const disabledFollowUps = new Set([
    'pix-gerado',
    'pix-pendente',
    'oferta-desconto',
    'pagamento-confirmado',
  ])
  if (disabledFollowUps.has(templateName)) {
    console.info(`[email] envio desativado por regra do produto: ${templateName}`)
    return { sent: false, reason: 'recipient_suppressed' }
  }

  const sender = await resolveSender();
  const apiKey = process.env.LOVABLE_API_KEY
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, {
    logoUrl: sender.logo_url || undefined,
    ...templateData,
  })
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const idempotencyKey = options.idempotencyKey || crypto.randomUUID()

  try {
    await sendLovableEmail(
      {
        to: recipient,
        from: `${sender.name} <${sender.email}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: idempotencyKey,
        reply_to: options.replyTo ?? sender.reply_to ?? "contato@certificadodigitalccmei.online",
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL }
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      await recordEmailAudit({
        to: recipient,
        subject,
        idempotencyKey,
        status: 'suppressed',
        error: 'recipient_suppressed',
      })
      return { sent: false, reason: 'recipient_suppressed' }
    }
    await recordEmailAudit({
      to: recipient,
      subject,
      idempotencyKey,
      status: 'failed',
      error: (error as Error)?.message ?? 'erro desconhecido',
    })
    throw error
  }

  await recordEmailAudit({ to: recipient, subject, idempotencyKey, status: 'sent', error: null })

  return { sent: true }
}


