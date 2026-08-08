import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'

// Recebe eventos de entrega da infraestrutura de e-mail e limpa
// automaticamente da base qualquer endereço que deu bounce/reclamação.
async function purge(recipient: string, reason: 'bounce' | 'complaint' | 'unsubscribe') {
  if (!recipient) return
  const { purgeBouncedEmail } = await import('@/lib/email-hygiene/bounce-cleanup.server')
  await purgeBouncedEmail(recipient, reason)
}

const handler = createEmailWebhookHandler({
  apiKey: process.env.LOVABLE_API_KEY!,
  on: {
    'email.bounced': (event) => purge(event.data.recipient, 'bounce'),
    'email.complaint': (event) => purge(event.data.recipient, 'complaint'),
    'email.unsubscribed': (event) => purge(event.data.recipient, 'unsubscribe'),
  },
})

export const Route = createFileRoute('/lovable/email/events')({
  server: {
    handlers: {
      POST: ({ request }) => handler(request),
    },
  },
})
