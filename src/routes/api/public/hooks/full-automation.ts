
import { createFileRoute } from '@tanstack/react-router';

/**
 * Endpoint centralizado para automação completa na nuvem.
 * Deve ser chamado via Cron (ex: a cada 1 ou 2 minutos).
 */
export const Route = createFileRoute('/api/public/hooks/full-automation')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = (request.headers.get('apikey') ?? '').trim();
        const allowed = [
          process.env.SUPABASE_ANON_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
        ].map(k => (k ?? '').trim()).filter(Boolean);

        if (!providedKey || !allowed.includes(providedKey)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }

        const stats: any = {};

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

          // 0. Interruptor global (Nuvem: Ativo/Off) — estado persistente no banco.
          const { data: cloudCfg } = await supabaseAdmin
            .from('cloud_automation_settings')
            .select('enabled')
            .eq('id', 1)
            .maybeSingle();
          const enabledCount = cloudCfg?.enabled ? 1 : 0;

          if (!enabledCount) {
            return new Response(JSON.stringify({ skipped: 'cloud_off' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          // 1. Auto-import de novas empresas (Casa dos Dados)
          const { runImportBatch } = await import('@/lib/casa-dos-dados/simple-flow.server');

          const nowIso = new Date().toISOString();
          const { data: configs } = await supabaseAdmin
            .from('automatic_company_queries')
            .select('*')
            .eq('enabled', true)
            .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
            .limit(1);

          if (configs && configs.length > 0) {
            const cfg = configs[0];
            const outcome = await runImportBatch({
              date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
              filters: (cfg.filters as any) || { only_mei: true, only_active: true, require_email: false },
              limit: Math.min(5, (cfg as any).quantity_per_run || 1),
              skipExisting: true
            });
            
            await supabaseAdmin.from('automatic_company_queries').update({
              last_run_at: nowIso,
              next_run_at: new Date(Date.now() + ((cfg as any).interval_minutes || 60) * 60000).toISOString(),
              status: 'active'
            }).eq('id', cfg.id);
            
            stats.import = outcome;
          }

          // 2. Sincronizar Fila de Campanha (Transforma empresas em itens na fila de e-mail)
          const { syncMassEmailQueue } = await import('@/lib/automation/mass-email.server');
          stats.sync = await syncMassEmailQueue(10);

          // 3. Processar Régua de Cobrança (PIX reminders, etc)
          const { runNotificationCadence } = await import('@/lib/emails/order-emails.server');
          stats.cadence = await runNotificationCadence();

          // 4. Despachar e-mails da fila (Gmail API)
          // O cron roda a cada minuto; o teto de 100/h é garantido pela janela deslizante
          // dentro de processQueueInternal. Até 3 por chamada distribui bem os 100.
          const { processQueueInternal } = await import('@/lib/gmail/queue.server');
          stats.queue = await processQueueInternal(3);


        } catch (e: any) {
          stats.error = e.message;
        }

        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
  }
});
