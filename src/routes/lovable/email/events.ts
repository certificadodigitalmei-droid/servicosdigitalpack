import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'

// Recebe eventos de entrega da infraestrutura de e-mail e limpa
// automaticamente da base qualquer endereço que deu bounce/reclamação.
const handler = createEmailWebhookHandler({
  onEvent: async (event: any) => {
    const email: string | undefined =
      event?.data?.recipient ?? event?.data?.to ?? event?.data?.email

    if (!email) return

    const reason =
      event.type === 'email.complaint'
        ? 'complaint'
        : event.type === 'email.unsubscribed'
          ? 'unsubscribe'
          : 'bounce'

    const { purgeBouncedEmail } = await import('@/lib/email-hygiene/bounce-cleanup.server')
    await purgeBouncedEmail(email, reason as any)
  },
})

export const Route = createFileRoute('/lovable/email/events')({
  server: {
    handlers: {
      POST: ({ request }) => handler(request),
    },
  },
})
