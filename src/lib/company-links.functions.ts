import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

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

export const getLinkPaymentStatus = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<LinkPaymentStatus> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: link } = await supabaseAdmin
      .from('company_links')
      .select('id')
      .eq('public_token', data.token)
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
    if (!order?.paid_at) return { paid: false, paid_at: null };
    return { paid: true, paid_at: order.paid_at };
  });

export const getLinkLoaderState = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<{ shown: boolean }> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: link } = await supabaseAdmin
      .from('company_links')
      .select('loader_shown_at')
      .eq('public_token', data.token)
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
      .eq('public_token', data.token)
      .is('loader_shown_at', null);
    return { ok: true };
  });

