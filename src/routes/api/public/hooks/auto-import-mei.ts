// Cron-invoked continuous auto-import.
// Called by pg_cron every N minutes with `apikey: <anon-key>` header.
// For each auto-import config with enabled=true and next_run_at<=now, runs one
// dedup'd batch and updates next_run_at.

import { createFileRoute } from '@tanstack/react-router';

function todayBRString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const Route = createFileRoute('/api/public/hooks/auto-import-mei')({
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

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { runImportBatch } = await import('@/lib/casa-dos-dados/simple-flow.server');

        // Find due configs (enabled + next_run_at reached)
        const nowIso = new Date().toISOString();
        const { data: configs, error } = await supabaseAdmin
          .from('automatic_company_queries')
          .select('id, quantity_per_run, filters, interval_minutes, next_run_at')
          .eq('enabled', true)
          .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
          .limit(5);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }

        const results: any[] = [];
        for (const cfg of configs ?? []) {
          const startedAt = new Date().toISOString();
          const filters = {
            only_mei: true,
            only_active: true,
            only_matriz: true,
            require_email: false,
            ...(cfg.filters as any),
          };
          const limit = Math.min(15, Math.max(1, (cfg as any).quantity_per_run ?? 5));
          const intervalMin = Math.max(5, (cfg as any).interval_minutes ?? 30);

          try {
            const outcome = await runImportBatch({
              date: todayBRString(),
              filters,
              limit,
              page: 1,
              skipExisting: true,
            });

            const imported = outcome.ok ? outcome.imported.length : 0;
            const failed = outcome.ok ? outcome.failed.length : 0;
            const discovered = (outcome as any).discovered ?? 0;
            const skipped = (outcome as any).skipped ?? 0;

            await (supabaseAdmin as any)
              .from('automatic_company_queries')
              .update({
                last_run_at: startedAt,
                next_run_at: new Date(Date.now() + intervalMin * 60_000).toISOString(),
                last_error: outcome.ok ? null : (outcome as any).error ?? null,
                status: 'active',
              })
              .eq('id', cfg.id);

            await (supabaseAdmin as any)
              .from('automatic_company_query_runs')
              .insert({
                automation_id: cfg.id,
                trigger: 'cron_auto',
                started_at: startedAt,
                finished_at: new Date().toISOString(),
                status: outcome.ok ? 'success' : 'error',
                total_returned: discovered,
                saved_companies: imported,
                links_generated: imported,
                error_message: outcome.ok ? null : (outcome as any).error ?? null,
                api_summary: {
                  apiTotal: (outcome as any).apiTotal ?? null,
                  discovered,
                  skipped_existing: skipped,
                  imported,
                  failed,
                } as any,
              });

            results.push({ id: cfg.id, imported, skipped, failed, discovered });
          } catch (e: any) {
            await (supabaseAdmin as any)
              .from('automatic_company_queries')
              .update({
                last_run_at: startedAt,
                next_run_at: new Date(Date.now() + intervalMin * 60_000).toISOString(),
                last_error: e?.message ?? String(e),
              })
              .eq('id', cfg.id);
            results.push({ id: cfg.id, error: e?.message ?? String(e) });
          }
        }

        // Processa a fila de e-mails em cada batida do importador
        const { processQueueInternal } = await import('@/lib/gmail/queue.server');
        const queue = await processQueueInternal(3);

        return new Response(
          JSON.stringify({ ok: true, ranAt: nowIso, count: results.length, results, queue }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    },
  },
});
