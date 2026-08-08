import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type PreviewTokens = {
  /** Token de uma empresa com link ativo (ainda não pago). */
  pendingToken: string | null;
  pendingName: string | null;
  /** Token de uma empresa que já pagou (mostra o cartão ativo). */
  paidToken: string | null;
  paidName: string | null;
};

export const getPreviewTokens = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PreviewTokens> => {
    const { data: role } = await context.supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', context.userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) throw new Error('Acesso não autorizado');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: links } = await supabaseAdmin
      .from('company_links')
      .select('company_id, public_token, created_at')
      .eq('active', true)
      .not('company_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60);

    const rows = links ?? [];
    if (rows.length === 0) {
      return { pendingToken: null, pendingName: null, paidToken: null, paidName: null };
    }

    const companyIds = rows.map((r) => r.company_id).filter(Boolean) as string[];

    const { data: paidOrders } = await supabaseAdmin
      .from('orders')
      .select('company_id, status')
      .in('company_id', companyIds)
      .eq('status', 'paid');

    const paidSet = new Set((paidOrders ?? []).map((o) => o.company_id));

    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, nome_fantasia, razao_social_original, cnpj')
      .in('id', companyIds);

    const nameById = new Map(
      (companies ?? []).map((c) => [
        c.id as string,
        (c.nome_fantasia as string) || (c.razao_social_original as string) || (c.cnpj as string) || '',
      ]),
    );

    let out: PreviewTokens = { pendingToken: null, pendingName: null, paidToken: null, paidName: null };

    for (const r of rows) {
      const isPaid = paidSet.has(r.company_id);
      const name = nameById.get(r.company_id as string) ?? null;
      if (isPaid && !out.paidToken) {
        out = { ...out, paidToken: r.public_token, paidName: name };
      }
      if (!isPaid && !out.pendingToken) {
        out = { ...out, pendingToken: r.public_token, pendingName: name };
      }
      if (out.paidToken && out.pendingToken) break;
    }

    return out;
  });
