// Cria uma empresa fictícia + link público apenas para testar o gateway de pagamento.
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { buildPublicUrl, buildCheckoutUrl } from '@/lib/public-base-url';

export type TestCompanyResult = {
  company_id: string;
  cnpj: string;
  company_name: string;
  email: string;
  public_token: string;
  public_url: string;
  checkout_url: string;
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!data) throw new Error('Acesso não autorizado');
}

function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

function randomToken(): string {
  return (
    Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
  );
}

export const createTestCompanyLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email('Informe um e-mail válido para receber o teste'),
        amountCents: z.number().int().min(100).max(500000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<TestCompanyResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const cnpj = `00${randomDigits(12)}`;
    const companyName = 'EMPRESA TESTE GATEWAY LTDA';

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .insert({
        cnpj,
        razao_social_original: companyName,
        nome_fantasia: 'Empresa Teste Gateway',
        nome_titular_exibicao: 'Fulano de Teste',
        email: data.email,
        possui_email: true,
        possui_telefone: true,
        ddd: '11',
        telefones: [{ numero: '11999999999' }],
        inicio_atividade: '2020-01-15',
        situacao_cadastral: '02',
        situacao_cadastral_desc: 'ATIVA',
        cnae_principal_codigo: '6201501',
        cnae_principal_descricao: 'Desenvolvimento de programas de computador sob encomenda',
        logradouro: 'RUA DE TESTE',
        numero: '100',
        bairro: 'CENTRO',
        cep: '01001000',
        uf: 'SP',
        municipio_descricao: 'SAO PAULO',
        natureza_id: '2135',
        is_mei: true,
        is_matriz: true,
        nivel_dados: 'completo',
        fonte: 'teste_manual',
        status: 'link_criado',
        is_test_record: true,
        data_quality_status: 'complete',
      })
      .select('id, cnpj')
      .single();
    if (companyErr || !company) {
      throw new Error('Falha ao criar empresa de teste: ' + (companyErr?.message ?? 'sem retorno'));
    }

    const token = randomToken();
    const { error: linkErr } = await supabaseAdmin.from('company_links').insert({
      company_id: company.id,
      public_token: token,
      token,
      active: true,
      status: 'ativo',
      is_test_record: true,
      data_quality_status: 'complete',
      amount_cents: data.amountCents ?? null,
      public_url: buildPublicUrl(token),
      checkout_url: buildCheckoutUrl(token),
      company_data: {
        cnpj: company.cnpj,
        nome: companyName,
        email: data.email,
        teste: true,
      },
    });
    if (linkErr) throw new Error('Falha ao criar link de teste: ' + linkErr.message);

    return {
      company_id: company.id,
      cnpj: company.cnpj,
      company_name: companyName,
      email: data.email,
      public_token: token,
      public_url: buildPublicUrl(token),
      checkout_url: buildCheckoutUrl(token),
    };
  });

export const deleteTestCompanies = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ removed: number }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('is_test_record', true)
      .eq('fonte', 'teste_manual');
    const ids = (companies ?? []).map((c) => c.id);
    if (!ids.length) return { removed: 0 };

    await supabaseAdmin.from('company_links').delete().in('company_id', ids);
    await supabaseAdmin.from('companies').delete().in('id', ids);
    return { removed: ids.length };
  });
