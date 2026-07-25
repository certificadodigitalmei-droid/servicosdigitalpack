import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Endpoint chamado pelo satélite para confirmar (ou reportar erro) do envio
 * de um job previamente reservado via /api/public/claim-batch.
 *
 * Body: { job_id: string, status: 'sent' | 'error', error_message?: string, provider_message_id?: string }
 * Header: x-worker-secret: <WORKER_SHARED_SECRET>
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export const Route = createFileRoute('/api/public/confirm-send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.WORKER_SHARED_SECRET;
        if (!expected) return new Response('Server not configured', { status: 500 });
        const provided = request.headers.get('x-worker-secret') ?? '';
        if (!provided || !timingSafeEqual(provided, expected)) {
          return new Response('Unauthorized', { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response('Invalid JSON', { status: 400 });
        }
        const job_id = String(body?.job_id ?? '').trim();
        const status = String(body?.status ?? '').trim();
        const error_message = body?.error_message ? String(body.error_message).slice(0, 500) : null;
        const provider_message_id = body?.provider_message_id
          ? String(body.provider_message_id).slice(0, 200)
          : null;

        if (!job_id || (status !== 'sent' && status !== 'error')) {
          return new Response('job_id and status (sent|error) are required', { status: 400 });
        }

        try {
          const { data: job, error: jobErr } = await supabaseAdmin
            .from('satellite_jobs')
            .select('id, satellite_id, company_id, cnpj, email, public_token, public_url, status, is_test')
            .eq('id', job_id)
            .maybeSingle();
          if (jobErr) throw jobErr;
          if (!job) return new Response('Job not found', { status: 404 });

          const nowIso = new Date().toISOString();

          const { error: updErr } = await supabaseAdmin
            .from('satellite_jobs')
            .update({
              status,
              error_message,
              provider_message_id,
              confirmed_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', job.id);
          if (updErr) throw updErr;

          // Grava no histórico central de envios para bloquear reenvio pelo mestre
          // ou por outro satélite, mesmo depois de limpar cache local.
          if (status === 'sent' && !(job as any).is_test) {
            const { data: company } = await supabaseAdmin
              .from('companies')
              .select('razao_social_original, nome_titular_exibicao')
              .eq('id', job.company_id)
              .maybeSingle();
            const companyName =
              (company as any)?.nome_titular_exibicao ||
              (company as any)?.razao_social_original ||
              '';

            await supabaseAdmin.from('email_campaign_recipients').insert({
              campaign_id: null,
              email: job.email,
              company_name: companyName,
              razao_social: (company as any)?.razao_social_original ?? null,
              nome_titular: (company as any)?.nome_titular_exibicao ?? null,
              cnpj: job.cnpj,
              token: job.public_token,
              public_link: job.public_url,
              reference_code: `SAT-${job.satellite_id}`,
              status: 'sent',
              sent_at: nowIso,
              provider_message_id,
              provider_status: 'sent_by_satellite',
            });
          }

          return Response.json({ ok: true });
        } catch (err: any) {
          console.error('confirm-send error:', err);
          return new Response(err?.message || 'Internal error', { status: 500 });
        }
      },
    },
  },
});
