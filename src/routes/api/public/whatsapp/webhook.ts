import { createFileRoute } from '@tanstack/react-router';

/**
 * Pass-through webhook da Chakra (formato bruto da Meta).
 * Responde 200 rápido, é idempotente e nunca expõe segredos.
 */
export const Route = createFileRoute('/api/public/whatsapp/webhook')({
  server: {
    handlers: {
      // Verificação de assinatura no padrão Meta (hub.challenge).
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const challenge = url.searchParams.get('hub.challenge');
        if (challenge) return new Response(challenge, { status: 200 });
        return new Response('ok', { status: 200 });
      },
      POST: async ({ request }) => {
        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: true, ignored: 'invalid_json' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        try {
          const { applyWhatsappWebhook } = await import('@/lib/whatsapp/webhook.server');
          const result = await applyWhatsappWebhook(payload);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        } catch (e: any) {
          // Nunca devolver 5xx para o provedor: evita reentrega infinita.
          console.error('[whatsapp-webhook]', e?.message ?? e);
          return new Response(JSON.stringify({ ok: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      },
    },
  },
});
