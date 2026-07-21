// Internal cron-invoked worker. Not public.
// Requires the header `x-cron-secret` to match CASA_DOS_DADOS_CRON_SECRET.

import { createFileRoute } from '@tanstack/react-router';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute('/api/internal/casa-dos-dados-worker')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CASA_DOS_DADOS_CRON_SECRET;
        if (!expected) {
          return new Response(JSON.stringify({ error: 'cron secret not configured' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        const provided = request.headers.get('x-cron-secret') ?? '';
        if (!provided || !timingSafeEqual(provided, expected)) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: claimed, error } = await supabaseAdmin.rpc('claim_due_automation');
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        const row = Array.isArray(claimed) ? claimed[0] : claimed;
        if (!row) {
          return new Response(JSON.stringify({ ok: true, claimed: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        const { data: fullRow } = await supabaseAdmin
          .from('automatic_company_queries')
          .select('auto_import_enabled, auto_generate_links_enabled')
          .eq('id', row.id)
          .maybeSingle();

        const { runAutomationOnce } = await import('@/lib/casa-dos-dados/worker.server');
        const outcome = await runAutomationOnce(
          {
            id: row.id,
            owner_user_id: row.owner_user_id,
            mode: row.mode,
            quantity_per_run: row.quantity_per_run,
            interval_minutes: row.interval_minutes,
            filters: (row.filters ?? {}) as any,
            auto_import_enabled: (fullRow as any)?.auto_import_enabled ?? true,
            auto_generate_links_enabled: (fullRow as any)?.auto_generate_links_enabled ?? true,
          },
          { trigger: 'cron' },
        );

        return new Response(JSON.stringify({ ok: true, claimed: true, outcome }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
