import { createFileRoute } from '@tanstack/react-router';

/**
 * Endpoint centralizado da automação em nuvem (chamado por cron a cada minuto).
 *
 * Pipeline linear e TRAVADO:
 *   1. Gerar links para empresas importadas sem link
 *   2. Enfileirar envio para links sem registro na fila
 *   3. Despachar a fila (respeitando o teto por hora)
 *   4. Importar novas empresas SOMENTE quando não sobrar nada pendente
 */
export const Route = createFileRoute('/api/public/hooks/full-automation')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = (request.headers.get('apikey') ?? '').trim();
        const allowed = [process.env.SUPABASE_ANON_KEY, process.env.SUPABASE_PUBLISHABLE_KEY]
          .map((k) => (k ?? '').trim())
          .filter(Boolean);

        if (!providedKey || !allowed.includes(providedKey)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }

        const stats: any = {};

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

          // 0. Interruptor global (Nuvem: Ativo/Off)
          const { data: cloudCfg } = await supabaseAdmin
            .from('cloud_automation_settings')
            .select('enabled')
            .eq('id', 1)
            .maybeSingle();

          if (!cloudCfg?.enabled) {
            return new Response(JSON.stringify({ skipped: 'cloud_off' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          const { readFlowSettings } = await import('@/lib/pipeline/pipeline.server');
          const flow = await readFlowSettings(supabaseAdmin as any);
          stats.flow = flow;

          const { ensureLinksForImported, syncMassEmailQueue } = await import(
            '@/lib/automation/mass-email.server'
          );

          // 1. Empresas importadas sem link -> gerar link
          stats.links = await ensureLinksForImported(Math.max(25, flow.importBatchSize));

          // 2. Links sem envio -> entrar na fila
          stats.sync = await syncMassEmailQueue(Math.max(25, flow.importBatchSize));

          // 3. Despachar fila
          //    burst: manda o lote inteiro da hora o mais rápido possível
          //    paced: 1 e-mail a cada `pacedDelaySec`
          const { processQueueInternal } = await import('@/lib/gmail/queue.server');
          const burst = flow.sendMode === 'burst';
          const perTick = burst
            ? flow.hourlyBatchSize
            : Math.max(1, Math.round(60 / Math.max(1, flow.pacedDelaySec)));
          stats.queue = await processQueueInternal(perTick, flow.hourlyBatchSize, {
            burst,
            concurrency: 10,
          });

          // 4. Régua de cobrança (PIX pendente etc.)
          const { runNotificationCadence } = await import('@/lib/emails/order-emails.server');
          stats.cadence = await runNotificationCadence();

          // 5. TRAVA: só importa quando o estoque pendente estiver zerado
          const { computePipelineState } = await import('@/lib/pipeline/pipeline.server');
          const state = await computePipelineState(supabaseAdmin as any);
          stats.pipeline = state;

          if (!state.importacaoLiberada) {
            stats.import = { skipped: true, reason: state.motivoBloqueio };
          } else {
            const { runImportBatch } = await import('@/lib/casa-dos-dados/simple-flow.server');

            const nowIso = new Date().toISOString();
            const { data: configs } = await supabaseAdmin
              .from('automatic_company_queries')
              .select('*')
              .eq('enabled', true)
              .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
              .limit(1);

            if (configs && configs.length > 0) {
              const cfg = configs[0] as any;
              const outcome = await runImportBatch({
                date: new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date()),
                filters: (cfg.filters as any) || {
                  only_mei: true,
                  only_active: true,
                  only_matriz: false,
                  require_email: true,
                },
                limit: flow.importBatchSize,
                skipExisting: true,
              });


              await supabaseAdmin
                .from('automatic_company_queries')
                .update({
                  last_run_at: nowIso,
                  next_run_at: new Date(
                    Date.now() + (cfg.interval_minutes || 60) * 60000,
                  ).toISOString(),
                  status: 'active',
                })
                .eq('id', cfg.id);

              stats.import = outcome;
            } else {
              stats.import = { skipped: true, reason: 'nenhuma automação ativa/vencida' };
            }
          }

          // 6. Reconciliação de métricas
          const { reconcileMetrics } = await import('@/lib/automation/reconcile.server');
          stats.reconcile = await reconcileMetrics();
        } catch (e: any) {
          stats.error = e?.message ?? String(e);
        }

        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
