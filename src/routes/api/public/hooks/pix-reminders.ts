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

        const { runNotificationCadence } = await import(
          '@/lib/emails/order-emails.server'
        );
        const cadence = await runNotificationCadence();

        // Processa automaticamente a fila do Google Workspace (sem ação manual).
        let queue: { processed: number; sent: number; failed: number } | { error: string };
        try {
          const { processQueueInternal } = await import('@/lib/gmail/queue.server');
          queue = await processQueueInternal();
        } catch (e) {
          queue = { error: (e as Error).message };
        }

        // Chamada da automação completa (importação + sincronia + disparos)
        const { syncMassEmailQueue } = await import('@/lib/automation/mass-email.server');
        const sync = await syncMassEmailQueue(5);

        return new Response(JSON.stringify({ cadence, queue, sync }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
