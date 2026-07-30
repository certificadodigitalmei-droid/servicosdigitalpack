// Cron: dispara o e-mail de cobrança para PIX gerado e não pago há 15+ minutos.
// Chamado por pg_cron / agendador externo com o header `apikey: <anon-key>`.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/hooks/pix-reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = request.headers.get('apikey') ?? '';
        const expected =
          process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
        if (!expected || providedKey !== expected) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }

        const { sendPendingReminders } = await import('@/lib/emails/order-emails.server');
        const result = await sendPendingReminders(15);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
