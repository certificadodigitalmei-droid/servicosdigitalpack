import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const PUBLIC_BASE_URL = 'https://certificadodigitalccmei.online';

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

/**
 * Enfileira um envio de TESTE para um satélite específico. Ao chamar
 * /api/public/claim-batch, o satélite receberá esse job primeiro.
 * - Usa uma empresa real (para ter dados no template)
 * - Sobrescreve o e-mail pelo alvo do teste
 * - Marca is_test=true → não bloqueia empresa nem loga em recipients
 */
export const enqueueSatelliteTest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        satellite_id: z.string().min(1).max(80),
        email: z.string().email(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // Escolhe qualquer empresa com dados básicos (mais recente)
    const { data: company, error: cErr } = await supabaseAdmin
      .from('companies')
      .select('id, cnpj, razao_social_original, nome_titular_exibicao')
      .not('cnpj', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company) throw new Error('Nenhuma empresa cadastrada para usar no teste');

    // Reaproveita link se já existe; senão cria um
    let publicToken: string | null = null;
    const { data: linkExisting } = await supabaseAdmin
      .from('company_links')
      .select('public_token')
      .eq('company_id', company.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (linkExisting?.public_token) {
      publicToken = linkExisting.public_token;
    } else {
      const token = crypto.randomUUID().replace(/-/g, '');
      const { error: linkErr } = await supabaseAdmin.from('company_links').insert({
        company_id: company.id,
        public_token: token,
        token,
        public_url: `${PUBLIC_BASE_URL}/acesso/${token}`,
        checkout_url: `${PUBLIC_BASE_URL}/checkout/${token}`,
        active: true,
        status: 'active',
        company_data: {
          cnpj: company.cnpj,
          nome: (company as any).nome_titular_exibicao || (company as any).razao_social_original,
        } as any,
      });
      if (linkErr) throw new Error(linkErr.message);
      publicToken = token;
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('satellite_jobs')
      .insert({
        satellite_id: data.satellite_id,
        company_id: company.id,
        cnpj: company.cnpj,
        email: data.email,
        public_token: publicToken,
        public_url: `${PUBLIC_BASE_URL}/acesso/${publicToken}`,
        status: 'pending_test',
        is_test: true,
      })
      .select('id')
      .single();
    if (insErr) throw new Error(insErr.message);

    return { ok: true, job_id: inserted.id };
  });
