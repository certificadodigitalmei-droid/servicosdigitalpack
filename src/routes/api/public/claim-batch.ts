import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { DEFAULT_DESIGN, renderHtml, renderText, substitute, type CampaignDesign, type Vars } from '@/lib/email-campaign/template';

const DEFAULT_SUBJECT = '{{NOME_TITULAR}}, atualização pendente do seu CNPJ';

async function loadMasterTemplate(): Promise<{ design: CampaignDesign; subject: string; fromName?: string; fromAddress?: string; replyTo?: string }> {
  const { data: adminRole } = await supabaseAdmin
    .from('user_roles').select('user_id').eq('role', 'admin').limit(1).maybeSingle();
  let payload: any = null;
  if (adminRole?.user_id) {
    const { data } = await supabaseAdmin
      .from('message_templates').select('payload').eq('user_id', adminRole.user_id).maybeSingle();
    payload = data?.payload ?? null;
  }
  if (!payload) {
    const { data } = await supabaseAdmin
      .from('message_templates').select('payload').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    payload = data?.payload ?? null;
  }
  const design: CampaignDesign = { ...DEFAULT_DESIGN, ...((payload?.design as any) ?? {}) };
  return {
    design,
    subject: (payload?.subject as string) || DEFAULT_SUBJECT,
    fromName: payload?.fromName,
    fromAddress: payload?.fromAddress,
    replyTo: payload?.replyTo,
  };
}

function buildVars(job: { cnpj: string; email: string; company_name: string; razao_social: string; nome_titular: string; public_url: string; public_token: string }): Vars {
  return {
    NOME_EMPRESARIAL: job.company_name,
    NOME_TITULAR: job.nome_titular || job.company_name,
    RAZAO_SOCIAL: job.razao_social,
    CNPJ: job.cnpj,
    EMAIL: job.email,
    LINK_PUBLICO: job.public_url,
    TOKEN: job.public_token,
    SITUACAO: 'CNPJ sem certificado ativo',
    REFERENCIA: `MEI-${new Date().getFullYear()}`,
  };
}

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

          // 3) Tenta reservar via INSERT. O índice único parcial em (company_id)
          //    WHERE status IN ('claimed','sent') AND is_test=false não pode ser
          //    usado como alvo de ON CONFLICT (Postgres rejeita índices parciais
          //    sem WHERE correspondente), então filtramos manualmente empresas
          //    já reservadas/enviadas antes do INSERT.
          const candidateIds = eligible
            .slice(0, remaining)
            .filter((r: any) => linkMap[r.id])
            .map((r: any) => r.id);

          let alreadyClaimed = new Set<string>();
          if (candidateIds.length > 0) {
            const { data: existing } = await supabaseAdmin
              .from('satellite_jobs')
              .select('company_id')
              .in('company_id', candidateIds)
              .in('status', ['claimed', 'sent'])
              .eq('is_test', false);
            alreadyClaimed = new Set(((existing ?? []) as any[]).map((r) => r.company_id));
          }

          const toClaim = eligible
            .slice(0, remaining)
            .filter((r: any) => linkMap[r.id] && !alreadyClaimed.has(r.id));
          const jobInserts = toClaim.map((r: any) => ({
            satellite_id,
            company_id: r.id,
            cnpj: r.cnpj,
            email: r.email,
            public_token: linkMap[r.id],
            public_url: `${PUBLIC_BASE_URL}/acesso/${linkMap[r.id]}`,
            status: 'claimed' as const,
          }));

          let claimed: any[] = [];
          if (jobInserts.length > 0) {
            const { data, error: claimErr } = await supabaseAdmin
              .from('satellite_jobs')
              .insert(jobInserts)
              .select('id, company_id, cnpj, email, public_token, public_url');
            if (claimErr) throw claimErr;
            claimed = data ?? [];
          }

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

          const combined = [...testJobs, ...jobs];

          // Anexa template renderizado pelo mestre para que a antena envie
          // exatamente o mesmo conteúdo configurado no painel principal.
          try {
            const tpl = await loadMasterTemplate();
            for (const j of combined) {
              const vars = buildVars(j);
              j.subject = substitute(tpl.subject, vars);
              j.html = renderHtml(tpl.design, vars);
              j.text = renderText(tpl.design, vars);
              // NÃO enviamos from_address/from_name/reply_to do mestre:
              // cada satélite envia pelo próprio domínio verificado no
              // workspace dele. Forçar o remetente do mestre causaria
              // 403 no_matching_sender na antena.
            }
          } catch (tplErr) {
            console.error('claim-batch: falha ao renderizar template mestre', tplErr);
          }

          return Response.json({ jobs: combined, count: combined.length });
        } catch (err: any) {
          console.error('claim-batch error:', err);
          return new Response(err?.message || 'Internal error', { status: 500 });
        }
      },
    },
  },
});
