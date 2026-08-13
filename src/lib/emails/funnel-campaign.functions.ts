import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type FunnelStage =
  | 'all'
  | 'not_visited'
  | 'visited'
  | 'checkout'
  | 'checkout_unpaid'
  | 'guia'
  | 'pending_pix';

export type FunnelTarget = {
  linkId: string;
  token: string;
  empresa: string | null;
  cnpj: string | null;
  email: string | null;
  createdAt: string;
  views: number;
  checkout: number;
  guia: number;
  pendingPix: boolean;
  discountCents: number | null;
  discountExpiresAt: string | null;
  promoCount: number;
  lastPromoAt: string | null;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', context.userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!data) throw new Error('Forbidden');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Lista as empresas de acordo com a etapa do funil e o período escolhido. */
export const listFunnelTargets = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stage: z
          .enum(['all', 'not_visited', 'visited', 'checkout', 'checkout_unpaid', 'guia', 'pending_pix'])
          .default('all'),
        from: z.string().optional(),
        to: z.string().optional(),
        onlyWithEmail: z.boolean().default(true),
        limit: z.number().min(1).max(3000).default(1000),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ targets: FunnelTarget[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const linkSelect =
      'id, public_token, created_at, discount_amount_cents, discount_expires_at, promo_email_count, promo_email_sent_at, companies(cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email)';

    // Conjunto de links vindos de pedidos (usado na etapa "geraram PIX e não pagaram").
    let orderLinkIds: string[] | null = null;
    const paidFromOrders = new Set<string>();
    const pendingFromOrders = new Set<string>();

    if (data.stage === 'pending_pix') {
      // A base é a tabela de pedidos (mesma da aba Pagamentos), filtrada pela data do pedido.
      let oq = supabaseAdmin
        .from('orders')
        .select('public_link_id, status, paid_at, created_at')
        .not('public_link_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (data.from) oq = oq.gte('created_at', data.from);
      if (data.to) oq = oq.lte('created_at', data.to);
      const { data: ords, error: oErr } = await oq;
      if (oErr) throw oErr;
      for (const o of ((ords as any[]) ?? [])) {
        if (!o.public_link_id) continue;
        if (o.status === 'paid' || o.paid_at) paidFromOrders.add(o.public_link_id);
        else pendingFromOrders.add(o.public_link_id);
      }
      orderLinkIds = [...pendingFromOrders].filter((id) => !paidFromOrders.has(id));
      if (!orderLinkIds.length) return { targets: [] };
      orderLinkIds = orderLinkIds.slice(0, data.limit);
    }

    let rows: any[] = [];
    if (orderLinkIds) {
      for (const c of chunk(orderLinkIds, 200)) {
        const { data: part, error } = await supabaseAdmin
          .from('company_links')
          .select(linkSelect)
          .in('id', c);
        if (error) throw error;
        rows.push(...(((part as any[]) ?? [])));
      }
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    } else {
      let q = supabaseAdmin
        .from('company_links')
        .select(linkSelect)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(data.limit);
      if (data.from) q = q.gte('created_at', data.from);
      if (data.to) q = q.lte('created_at', data.to);
      const { data: links, error } = await q;
      if (error) throw error;
      rows = (links as any[]) ?? [];
    }
    if (!rows.length) return { targets: [] };

    // Eventos por token
    const tokens = rows.map((r) => r.public_token).filter(Boolean);
    const stats: Record<string, { view: number; checkout: number; guia: number }> = {};
    for (const c of chunk(tokens, 200)) {
      let offset = 0;
      while (offset <= 20000) {
        const { data: evs } = await supabaseAdmin
          .from('link_events')
          .select('token, event_type')
          .in('token', c)
          .range(offset, offset + 999);
        const list = (evs as any[]) ?? [];
        for (const e of list) {
          const s = (stats[e.token] ||= { view: 0, checkout: 0, guia: 0 });
          if (e.event_type === 'view_link') s.view += 1;
          else if (e.event_type === 'view_checkout') s.checkout += 1;
          else if (e.event_type === 'click_guia') s.guia += 1;
        }
        if (list.length < 1000) break;
        offset += 1000;
      }
    }

    // Pedidos por link
    const paid = new Set<string>(paidFromOrders);
    const pending = new Set<string>(pendingFromOrders);
    if (!orderLinkIds) {
      for (const c of chunk(rows.map((r) => r.id), 200)) {
        const { data: orders } = await supabaseAdmin
          .from('orders')
          .select('public_link_id, status, paid_at')
          .in('public_link_id', c);
        for (const o of (orders as any[]) ?? []) {
          if (!o.public_link_id) continue;
          if (o.status === 'paid' || o.paid_at) paid.add(o.public_link_id);
          else pending.add(o.public_link_id);
        }
      }
    }


    const targets: FunnelTarget[] = [];
    for (const r of rows) {
      if (paid.has(r.id)) continue; // quem já pagou nunca entra na campanha
      const s = stats[r.public_token] ?? { view: 0, checkout: 0, guia: 0 };
      const isPending = pending.has(r.id);
      if (data.stage === 'not_visited' && s.view > 0) continue;
      if (data.stage === 'visited' && s.view === 0) continue;
      if (data.stage === 'checkout' && s.checkout === 0) continue;
      // Chegaram no checkout e não pagaram (quem pagou já foi removido acima).
      if (data.stage === 'checkout_unpaid' && s.checkout === 0) continue;
      if (data.stage === 'guia' && s.guia === 0) continue;
      if (data.stage === 'pending_pix' && !isPending) continue;

      const c = r.companies ?? {};
      const email = (c.email as string | null) || null;
      if (data.onlyWithEmail && !email) continue;

      targets.push({
        linkId: r.id,
        token: r.public_token,
        empresa: c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia || null,
        cnpj: c.cnpj ?? null,
        email,
        createdAt: r.created_at,
        views: s.view,
        checkout: s.checkout,
        guia: s.guia,
        pendingPix: isPending,
        discountCents: r.discount_amount_cents ?? null,
        discountExpiresAt: r.discount_expires_at ?? null,
        promoCount: r.promo_email_count ?? 0,
        lastPromoAt: r.promo_email_sent_at ?? null,
      });
    }

    return { targets };
  });

/** Aplica o desconto (opcional) e dispara o e-mail escolhido para os links selecionados. */
export const sendFunnelCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        linkIds: z.array(z.string().uuid()).min(1).max(500),
        template: z.enum(['oferta-desconto', 'pix-pendente', 'pix-gerado']),
        discountAmount: z.number().positive().max(100000).optional(),
        discountHours: z.number().min(1).max(720).default(24),
        ofertaLabel: z.string().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
    const { getPublicBaseUrl, buildPublicUrl } = await import('@/lib/public-base-url');

    const { data: pricing } = await supabaseAdmin
      .from('site_settings')
      .select('product_amount')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const fullAmount = Number((pricing as any)?.product_amount ?? 97);

    const { data: links, error } = await supabaseAdmin
      .from('company_links')
      .select(
        'id, public_token, promo_email_count, companies(cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email)',
      )
      .in('id', data.linkIds);
    if (error) throw error;

    const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
    const fmtCnpj = (raw?: string | null) => {
      const d = (raw || '').replace(/\D/g, '');
      if (d.length !== 14) return raw || undefined;
      return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    };

    const expiresAt = new Date(Date.now() + data.discountHours * 60 * 60 * 1000).toISOString();
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of ((links as any[]) ?? [])) {
      const c = row.companies ?? {};
      const email = c.email as string | null;
      if (!email) {
        skipped++;
        continue;
      }

      if (data.discountAmount) {
        await supabaseAdmin
          .from('company_links')
          .update({
            discount_amount_cents: Math.round(data.discountAmount * 100),
            discount_expires_at: expiresAt,
          } as any)
          .eq('id', row.id);
      }

      const nextCount = (row.promo_email_count ?? 0) + 1;
      try {
        await sendTemplateEmail(data.template, email, {
          idempotencyKey: `campanha-${data.template}-${row.id}-${nextCount}`,
          templateData: {
            empresa:
              c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia || undefined,
            cnpj: fmtCnpj(c.cnpj),
            link: buildPublicUrl(row.public_token),
            protocolo: `CD-${String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            validade: '12 meses',
            valorPromocional: data.discountAmount ? brl(data.discountAmount) : undefined,
            valorOriginal: data.discountAmount ? brl(fullAmount) : undefined,
            validadeOferta:
              data.ofertaLabel || (data.discountHours <= 24 ? 'apenas hoje' : `por ${Math.round(data.discountHours / 24)} dias`),
          },
        });
        sent++;
        await supabaseAdmin
          .from('company_links')
          .update({
            promo_email_count: nextCount,
            promo_email_sent_at: new Date().toISOString(),
          } as any)
          .eq('id', row.id);
      } catch (e: any) {
        skipped++;
        if (errors.length < 5) errors.push(e?.message ?? 'erro');
      }
    }

    return { sent, skipped, errors };
  });

/** Remove o desconto dos links selecionados. */
export const clearFunnelDiscount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ linkIds: z.array(z.string().uuid()).min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin
      .from('company_links')
      .update({ discount_amount_cents: null, discount_expires_at: null } as any)
      .in('id', data.linkIds);
    return { ok: true };
  });

/**
 * Envia um e-mail de TESTE para um endereço escolhido.
 * Não aplica desconto e não altera nada no banco.
 * Se um linkId for informado, usa os dados reais daquela empresa; senão usa dados fictícios.
 */
export const sendFunnelTestEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(200),
        template: z.enum(['oferta-desconto', 'pix-pendente', 'pix-gerado']),
        discountAmount: z.number().positive().max(100000).optional(),
        ofertaLabel: z.string().max(60).optional(),
        linkId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
    const { getPublicBaseUrl, buildPublicUrl } = await import('@/lib/public-base-url');

    const { data: pricing } = await supabaseAdmin
      .from('site_settings')
      .select('product_amount')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const fullAmount = Number((pricing as any)?.product_amount ?? 97);

    let empresa = 'EMPRESA DEMONSTRACAO MEI LTDA';
    let cnpj = '12.345.678/0001-90';
    let token = 'exemplo-teste';
    let protocolo = 'CD-TESTE001';

    if (data.linkId) {
      const { data: row } = await supabaseAdmin
        .from('company_links')
        .select(
          'id, public_token, companies(cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia)',
        )
        .eq('id', data.linkId)
        .maybeSingle();
      const c = (row as any)?.companies ?? {};
      if (row) {
        empresa =
          c.nome_titular_exibicao || c.razao_social_original || c.nome_fantasia || empresa;
        const d = String(c.cnpj || '').replace(/\D/g, '');
        if (d.length === 14) {
          cnpj = d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        }
        token = (row as any).public_token;
        protocolo = `CD-${String((row as any).id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      }
    }

    const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

    await sendTemplateEmail(data.template, data.email, {
      idempotencyKey: `teste-${data.template}-${Date.now()}`,
      templateData: {
        empresa,
        cnpj,
        link: buildPublicUrl(token),
        protocolo,
        validade: '12 meses',
        dataSolicitacao: new Date().toLocaleDateString('pt-BR'),
        valorPromocional: data.discountAmount ? brl(data.discountAmount) : undefined,
        valorOriginal: data.discountAmount ? brl(fullAmount) : undefined,
        validadeOferta: data.ofertaLabel || 'apenas hoje',
      },
    });

    return { ok: true };
  });


/** Envia o modelo de e-mail escolhido para uma lista de endereços digitados manualmente. */
export const sendManualEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        emails: z.array(z.string().email().max(200)).min(1).max(500),
        template: z.enum(['oferta-desconto', 'pix-pendente', 'pix-gerado']),
        empresa: z.string().max(200).optional(),
        cnpj: z.string().max(30).optional(),
        link: z.string().max(500).optional(),
        discountAmount: z.number().positive().max(100000).optional(),
        ofertaLabel: z.string().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
    const { getPublicBaseUrl, buildPublicUrl } = await import('@/lib/public-base-url');

    const { data: pricing } = await supabaseAdmin
      .from('site_settings')
      .select('product_amount')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const fullAmount = Number((pricing as any)?.product_amount ?? 97);
    const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

    const unique = Array.from(new Set(data.emails.map((e) => e.trim().toLowerCase()))).filter(Boolean);
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const email of unique) {
      try {
        const r = await sendTemplateEmail(data.template, email, {
          idempotencyKey: `manual-${data.template}-${email}-${Date.now()}`,
          templateData: {
            empresa: data.empresa || undefined,
            cnpj: data.cnpj || undefined,
            link: data.link || getPublicBaseUrl(),
            protocolo: `CD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            validade: '12 meses',
            dataSolicitacao: new Date().toLocaleDateString('pt-BR'),
            valorPromocional: data.discountAmount ? brl(data.discountAmount) : undefined,
            valorOriginal: data.discountAmount ? brl(fullAmount) : undefined,
            validadeOferta: data.ofertaLabel || 'apenas hoje',
          },
        });
        if (r.sent) sent++;
        else skipped++;
      } catch (e: any) {
        skipped++;
        if (errors.length < 5) errors.push(`${email}: ${e?.message ?? 'erro'}`);
      }
    }

    return { sent, skipped, errors };
  });
