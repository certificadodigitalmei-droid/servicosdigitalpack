// Cron: dispara o e-mail de cobrança para PIX gerado e não pago há 15+ minutos.
// Chamado por pg_cron / agendador externo com o header `apikey: <anon-key>`.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/hooks/pix-reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = (request.headers.get('apikey') ?? '').trim();
        const allowed = [
          process.env.SUPABASE_ANON_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
          ...(process.env.SUPABASE_PUBLISHABLE_KEYS ?? '').split(','),
        ]
          .map((k) => (k ?? '').trim())
          .filter(Boolean);
        if (!providedKey || !allowed.includes(providedKey)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }

        const { sendPendingReminders, sendDailyRecovery } = await import(
          '@/lib/emails/order-emails.server'
        );
        const reminders = await sendPendingReminders(15);
        const recovery = await sendDailyRecovery({ maxDays: 15 });

        return new Response(JSON.stringify({ reminders, recovery }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
