import { createFileRoute } from '@tanstack/react-router';

/**
 * Motor das campanhas de WhatsApp no servidor.
 * Chamado pelo cron (pg_cron) com o cabeçalho apikey do projeto.
 * Roda mesmo com o painel fechado.
 */
export const Route = createFileRoute('/api/public/hooks/whatsapp-campaign-tick')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get('apikey') ?? '';
        const expected = process.env['SUPABASE_ANON_KEY'] ?? process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        const { runAllRunningCampaigns } = await import('@/lib/whatsapp/campaign.server');
        const results = await runAllRunningCampaigns({ maxWallMs: 45_000 });
        return new Response(JSON.stringify({ ok: true, results }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
