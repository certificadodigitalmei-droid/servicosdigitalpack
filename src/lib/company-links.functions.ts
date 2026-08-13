import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { getPublicBaseUrl } from '@/lib/public-base-url';

export type ResolvedCompany = {
  cnpj: string | null;
  nome: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  abertura: string | null;
  email: string | null;
  telefone: string | null;
  uf: string | null;
  municipio: string | null;
  situacao: string | null;
  natureza_juridica: string | null;
  amount_cents: number | null;
};

export type TestEmailCompany = {
  id: string;
  cnpj: string;
  email: string;
  company_name: string;
  data_abertura: string;
  uf: string;
  municipio: string;
  public_token: string;
  public_url: string;
};

/**
 * Retorna uma empresa importada real cujo link público ainda está ativo.
 * O envio de teste usa esta fonte em vez da fila persistida no navegador,
 * que pode conter tokens antigos após limpezas ou novas importações.
 */
export const getLatestTestEmailCompany = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestEmailCompany | null> => {
    const { data: role } = await context.supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) throw new Error('Acesso não autorizado');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const now = new Date().toISOString();
    const { data: links, error: linksError } = await supabaseAdmin
      .from('company_links')
      .select('company_id, public_token, created_at')
      .eq('active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .not('company_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(25);
    if (linksError) throw new Error('Falha ao localizar link real: ' + linksError.message);

    for (const link of links ?? []) {
      if (!link.company_id || !link.public_token) continue;
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('id, cnpj, email, nome_fantasia, razao_social_original, nome_titular_exibicao, inicio_atividade, uf, municipio_descricao')
        .eq('id', link.company_id)
        .maybeSingle();
      if (!company || !company.email || !/.+@.+\..+/.test(company.email)) continue;

      return {
        id: company.id,
        cnpj: company.cnpj || '',
        email: company.email,
        company_name:
          company.nome_fantasia || company.razao_social_original || company.nome_titular_exibicao || '',
        data_abertura: company.inicio_atividade || '',
        uf: company.uf || '',
        municipio: company.municipio_descricao || '',
        public_token: link.public_token,
        public_url: `${getPublicBaseUrl()}/acesso/${link.public_token}`,
      };
    }

    return null;
  });


export const resolveCompanyLink = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<ResolvedCompany | null> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: row, error } = await supabaseAdmin
      .rpc('resolve_company_link', { _token: data.token })
      .maybeSingle();
    if (error || !row) return null;
    return row as ResolvedCompany;
  });

export type LinkPaymentStatus = {
  paid: boolean;
  paid_at: string | null;
};

// Evita reconsultar o provedor a cada request: no máximo 1 checagem
// remota a cada 20s por token (o cache vive na instância do servidor).
const remoteCheckCache = new Map<string, number>();
const REMOTE_CHECK_TTL_MS = 20_000;

export const getLinkPaymentStatus = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<LinkPaymentStatus> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: link } = await supabaseAdmin
      .from('company_links')
      .select('id')
      .or(`public_token.eq.${data.token},public_token.like.${data.token}%`)
      .maybeSingle();
    if (!link) return { paid: false, paid_at: null };
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('paid_at, status')
      .eq('public_link_id', link.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (order?.paid_at) return { paid: true, paid_at: order.paid_at };

    // Nenhum pedido pago no banco: confirma direto no provedor (rede de
    // segurança para quando o webhook não chega).
    const last = remoteCheckCache.get(data.token) ?? 0;
    if (Date.now() - last < REMOTE_CHECK_TTL_MS) return { paid: false, paid_at: null };
    remoteCheckCache.set(data.token, Date.now());
    try {
      const { verifyLinkPayment } = await import('@/lib/payments/verify.server');
      const res = await verifyLinkPayment(data.token);
      return { paid: res.paid, paid_at: res.paid_at };
    } catch (err) {
      console.error('[link-payment] falha ao verificar no provedor', err);
      return { paid: false, paid_at: null };
    }
  });


export const getLinkLoaderState = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<{ shown: boolean }> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: link } = await supabaseAdmin
      .from('company_links')
      .select('loader_shown_at')
      .or(`public_token.eq.${data.token},public_token.like.${data.token}%`)
      .maybeSingle();
    return { shown: Boolean(link?.loader_shown_at) };
  });

export const markLinkLoaderShown = createServerFn({ method: 'POST' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin
      .from('company_links')
      .update({ loader_shown_at: new Date().toISOString() })
      .or(`public_token.eq.${data.token},public_token.like.${data.token}%`)
      .is('loader_shown_at', null);
    return { ok: true };
  });

