import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Endpoint chamado pelos projetos satélites para reservar um lote de empresas
 * para envio. Cada empresa é reservada exclusivamente para o satélite que a
 * pediu — nunca é entregue a outro satélite nem reenviada pelo mestre.
 *
 * Body: { satellite_id: string, batch_size?: number (1..200) }
 * Header: x-worker-secret: <WORKER_SHARED_SECRET>
 *
 * Retorna: { jobs: Array<{ job_id, cnpj, email, company_name, public_url, ... }> }
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

const PUBLIC_BASE_URL = 'https://certificadodigitalccmei.online';

export const Route = createFileRoute('/api/public/claim-batch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.WORKER_SHARED_SECRET;
        if (!expected) {
          return new Response('Server not configured', { status: 500 });
        }
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
        const satellite_id = String(body?.satellite_id ?? '').trim().slice(0, 80);
        const batch_size = Math.min(200, Math.max(1, Number(body?.batch_size) || 50));
        if (!satellite_id) {
          return new Response('satellite_id is required', { status: 400 });
        }

        try {
          // 0) Drena jobs de teste enfileirados manualmente para este satélite.
          //    Eles são retornados ANTES dos envios reais para permitir
          //    validar rapidamente a integração/template do satélite.
          const { data: pendingTests } = await supabaseAdmin
            .from('satellite_jobs')
            .select('id, company_id, cnpj, email, public_token, public_url')
            .eq('satellite_id', satellite_id)
            .eq('status', 'pending_test')
            .order('claimed_at', { ascending: true })
            .limit(batch_size);

          const testJobs: any[] = [];
          if (pendingTests && pendingTests.length > 0) {
            const testIds = pendingTests.map((j: any) => j.id);
            await supabaseAdmin
              .from('satellite_jobs')
              .update({ status: 'claimed', claimed_at: new Date().toISOString() })
              .in('id', testIds);

            const companyIds = pendingTests.map((j: any) => j.company_id);
            const { data: testCompanies } = await supabaseAdmin
              .from('companies')
              .select('id, razao_social_original, nome_titular_exibicao')
              .in('id', companyIds);
            const cmap = new Map<string, any>();
            for (const c of (testCompanies ?? []) as any[]) cmap.set(c.id, c);

            for (const j of pendingTests as any[]) {
              const c = cmap.get(j.company_id);
              testJobs.push({
                job_id: j.id,
                cnpj: j.cnpj,
                email: j.email,
                public_token: j.public_token,
                public_url: j.public_url,
                company_name: c?.nome_titular_exibicao || c?.razao_social_original || 'Teste',
                razao_social: c?.razao_social_original || 'Teste',
                nome_titular: c?.nome_titular_exibicao || '',
                is_test: true,
              });
            }
          }

          const remaining = batch_size - testJobs.length;
          if (remaining <= 0) {
            return Response.json({ jobs: testJobs, count: testJobs.length });
          }
          // 1) Candidatos: empresas com email válido, mais recentes primeiro,
          //    excluindo as já reservadas ou já enviadas localmente.
          const { data: candidates, error: candErr } = await supabaseAdmin
            .from('companies')
            .select('id, cnpj, email, razao_social_original, nome_titular_exibicao')
            .not('email', 'is', null)
            .neq('email', '')
            .order('created_at', { ascending: false })
            .limit(batch_size * 5);
          if (candErr) throw candErr;

          const rows = (candidates ?? []).filter((c: any) =>
            /.+@.+\..+/.test(c.email || ''),
          );
          if (rows.length === 0) return Response.json({ jobs: testJobs, count: testJobs.length });

          const ids = rows.map((r: any) => r.id);
          const emails = Array.from(
            new Set(rows.map((r: any) => String(r.email).toLowerCase().trim())),
          );

          // Já reservadas por qualquer satélite (claimed ou sent)
          const { data: reserved } = await supabaseAdmin
            .from('satellite_jobs')
            .select('company_id')
            .in('company_id', ids)
            .in('status', ['claimed', 'sent']);
          const reservedIds = new Set((reserved ?? []).map((r: any) => r.company_id));

          // Já enviadas pelo próprio mestre
          const { data: alreadySent } = await supabaseAdmin
            .from('email_campaign_recipients')
            .select('email')
            .in('email', emails)
            .not('sent_at', 'is', null);
          const sentEmails = new Set(
            (alreadySent ?? []).map((r: any) => String(r.email).toLowerCase().trim()),
          );

          const eligible = rows.filter(
            (r: any) =>
              !reservedIds.has(r.id) &&
              !sentEmails.has(String(r.email).toLowerCase().trim()),
          );
          if (eligible.length === 0) return Response.json({ jobs: testJobs, count: testJobs.length });

          // 2) Garante company_links para cada eligible
          const eligibleIds = eligible.map((r: any) => r.id);
          const { data: existingLinks } = await supabaseAdmin
            .from('company_links')
            .select('company_id, public_token')
            .in('company_id', eligibleIds)
            .eq('active', true);
          const linkMap: Record<string, string> = {};
          for (const l of (existingLinks ?? []) as any[]) {
            if (l.company_id && l.public_token && !linkMap[l.company_id]) {
              linkMap[l.company_id] = l.public_token;
            }
          }
          const missing = eligible.filter((r: any) => !linkMap[r.id]);
          if (missing.length > 0) {
            const inserts = missing.map((c: any) => {
              const token = crypto.randomUUID().replace(/-/g, '');
              return {
                company_id: c.id,
                public_token: token,
                token,
                public_url: `${PUBLIC_BASE_URL}/acesso/${token}`,
                checkout_url: `${PUBLIC_BASE_URL}/checkout/${token}`,
                active: true,
                status: 'active',
                company_data: {
                  cnpj: c.cnpj,
                  nome: c.nome_titular_exibicao || c.razao_social_original,
                } as any,
              };
            });
            const { data: inserted } = await supabaseAdmin
              .from('company_links')
              .insert(inserts)
              .select('company_id, public_token');
            for (const l of (inserted ?? []) as any[]) {
              if (l.company_id && l.public_token) linkMap[l.company_id] = l.public_token;
            }
          }

          // 3) Tenta reservar via INSERT com conflito ignorado.
          //    O índice único parcial em (company_id) WHERE status IN ('claimed','sent')
          //    garante que dois satélites concorrentes não peguem a mesma empresa.
          const toClaim = eligible.slice(0, remaining).filter((r: any) => linkMap[r.id]);
          const jobInserts = toClaim.map((r: any) => ({
            satellite_id,
            company_id: r.id,
            cnpj: r.cnpj,
            email: r.email,
            public_token: linkMap[r.id],
            public_url: `${PUBLIC_BASE_URL}/acesso/${linkMap[r.id]}`,
            status: 'claimed' as const,
          }));

          const { data: claimed, error: claimErr } = await supabaseAdmin
            .from('satellite_jobs')
            .upsert(jobInserts, {
              onConflict: 'company_id',
              ignoreDuplicates: true,
            })
            .select('id, company_id, cnpj, email, public_token, public_url');
          if (claimErr) throw claimErr;

          const byId = new Map<string, any>();
          for (const r of eligible) byId.set(r.id, r);

          const jobs = (claimed ?? []).map((j: any) => {
            const c = byId.get(j.company_id);
            return {
              job_id: j.id,
              cnpj: j.cnpj,
              email: j.email,
              public_token: j.public_token,
              public_url: j.public_url,
              company_name: c?.nome_titular_exibicao || c?.razao_social_original || '',
              razao_social: c?.razao_social_original || '',
              nome_titular: c?.nome_titular_exibicao || '',
            };
          });

          return Response.json({ jobs, count: jobs.length });
        } catch (err: any) {
          console.error('claim-batch error:', err);
          return new Response(err?.message || 'Internal error', { status: 500 });
        }
      },
    },
  },
});
