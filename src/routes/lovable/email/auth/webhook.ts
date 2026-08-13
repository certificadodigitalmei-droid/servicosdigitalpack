import * as React from 'react'
import { createAuthEmailHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

// Configuration
const SITE_NAME = "certificadodigitalccmei"
const SENDER_DOMAIN = "notify.certificadodigitalmeiestadual.online"
const ROOT_DOMAIN = "certificadodigitalmeiestadual.online"
const SITE_URL = `https://${ROOT_DOMAIN}`
const FALLBACK_FROM_NAME = "Digital Certifica A1"
const FALLBACK_FROM_EMAIL = "contato@certificadodigitalmeiestadual.online"

async function loadSenderFromSettings(): Promise<{ name: string; email: string }> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('from_name, from_email')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return {
      name: data?.from_name?.trim() || FALLBACK_FROM_NAME,
      email: data?.from_email?.trim() || FALLBACK_FROM_EMAIL,
    }
  } catch {
    return { name: FALLBACK_FROM_NAME, email: FALLBACK_FROM_EMAIL }
  }
}

function createHandler(fromName: string, fromEmail: string) {
  return createAuthEmailHandler({
    apiKey: process.env.LOVABLE_API_KEY!,
    from: `${fromName} <${fromEmail}>`,
    senderDomain: SENDER_DOMAIN,
    sendUrl: process.env.LOVABLE_SEND_URL,
    emails: {
      signup: {
        subject: 'Confirm your email',
        render: (data) =>
          React.createElement(SignupEmail, {
            siteName: SITE_NAME,
            siteUrl: SITE_URL,
            recipient: data.email,
            confirmationUrl: data.url,
          }),
      },
      invite: {
        subject: "You've been invited",
        render: (data) =>
          React.createElement(InviteEmail, {
            siteName: SITE_NAME,
            siteUrl: SITE_URL,
            confirmationUrl: data.url,
          }),
      },
      magiclink: {
        subject: 'Your login link',
        render: (data) =>
          React.createElement(MagicLinkEmail, {
            siteName: SITE_NAME,
            confirmationUrl: data.url,
          }),
      },
      recovery: {
        subject: 'Reset your password',
        render: (data) =>
          React.createElement(RecoveryEmail, {
            siteName: SITE_NAME,
            confirmationUrl: data.url,
          }),
      },
      email_change: {
        subject: 'Confirm your new email',
        render: (data) =>
          React.createElement(EmailChangeEmail, {
            siteName: SITE_NAME,
            oldEmail: data.old_email ?? '',
            email: data.email,
            newEmail: data.new_email ?? '',
            confirmationUrl: data.url,
          }),
      },
      reauthentication: {
        subject: 'Your verification code',
        render: (data) =>
          React.createElement(ReauthenticationEmail, { token: data.token ?? '' }),
      },
    },
  })
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sender = await loadSenderFromSettings()
        const handler = createHandler(sender.name, sender.email)
        return handler(request)
      },
    },
  },
})
