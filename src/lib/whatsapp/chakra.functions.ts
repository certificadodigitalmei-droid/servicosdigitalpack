import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getWaApiConfig = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: settings } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    const [pending, sent, failed] = await Promise.all([
      supabaseAdmin.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('owner_user_id', context.userId).eq('status', 'pending'),
      supabaseAdmin.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('owner_user_id', context.userId).eq('status', 'sent'),
      supabaseAdmin.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('owner_user_id', context.userId).eq('status', 'failed'),
    ]);

    const { count: audience } = await supabaseAdmin
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('possui_telefone', true);

    const { data: recent } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('id,phone,company_name,cnpj,status,sent_at,error_message,created_at,provider_message_id')
      .eq('owner_user_id', context.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    return {
      settings,
      hasApiKey: Boolean(process.env['CHAKRA_API_KEY']),
      stats: {
        pending: pending.count ?? 0,
        sent: sent.count ?? 0,
        failed: failed.count ?? 0,
        audience: audience ?? 0,
      },
      recent: recent ?? [],
    };
  });

export const saveWaApiConfig = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        base_url: z.string().trim().url().max(500),
        channel_id: z.string().trim().max(200).nullable().optional(),
        template_name: z.string().trim().max(200).nullable().optional(),
        template_language: z.string().trim().min(2).max(10),
        template_body: z.string().trim().max(2000).nullable().optional(),
        active: z.boolean(),
        daily_limit: z.number().int().min(1).max(10000),
        batch_size: z.number().int().min(1).max(200),
        min_delay_ms: z.number().int().min(0).max(600000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .update({ ...data, provider: 'chakrahq' })
      .eq('id', 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enqueueWaCompanies = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { pickCompanyPhone } = await import('./chakra.server');
    const { buildPublicUrl } = await import('@/lib/public-base-url');

    const { data: companies, error } = await supabaseAdmin
      .from('companies')
      .select('id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,ddd,telefones')
      .eq('possui_telefone', true)
      .order('created_at', { ascending: false })
      .limit(data.limit * 3);
    if (error) throw new Error(error.message);

    const ids = (companies ?? []).map((c: any) => c.id);
    const linkByCompany = new Map<string, { id: string; token: string }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: links } = await supabaseAdmin
        .from('company_links')
        .select('id,company_id,public_token')
        .in('company_id', ids.slice(i, i + 200))
        .eq('active', true);
      for (const l of (links ?? []) as any[]) {
        if (l.company_id && !linkByCompany.has(l.company_id)) {
          linkByCompany.set(l.company_id, { id: l.id, token: l.public_token });
        }
      }
    }

    const { data: existingRows } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('phone')
      .eq('owner_user_id', context.userId);
    const existing = new Set((existingRows ?? []).map((r: any) => String(r.phone)));

    const rows: any[] = [];
    for (const c of (companies ?? []) as any[]) {
      if (rows.length >= data.limit) break;
      const phone = pickCompanyPhone(c);
      if (!phone || existing.has(phone)) continue;
      existing.add(phone);
      const link = linkByCompany.get(c.id) ?? null;
      const name = c.nome_titular_exibicao || c.nome_fantasia || c.razao_social_original || 'Empresa';
      rows.push({
        owner_user_id: context.userId,
        phone,
        message: link ? buildPublicUrl(link.token) : '',
        company_name: name,
        cnpj: c.cnpj,
        company_id: c.id,
        company_link_id: link?.id ?? null,
        provider: 'chakrahq',
        status: 'pending',
      });
    }

    if (!rows.length) return { inserted: 0 };
    const { error: insErr } = await supabaseAdmin.from('whatsapp_queue').insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { inserted: rows.length };
  });

export const sendWaBatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { sendChakraTemplate } = await import('./chakra.server');

    const apiKey = process.env['CHAKRA_API_KEY'];
    if (!apiKey) return { sent: 0, failed: 0, error: 'CHAKRA_API_KEY não configurada' };

    const { data: cfg } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!cfg) return { sent: 0, failed: 0, error: 'Configuração não encontrada' };
    if (!cfg.active) return { sent: 0, failed: 0, error: 'Envio desativado nas configurações' };
    if (!cfg.template_name) return { sent: 0, failed: 0, error: 'Informe o nome do template aprovado' };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: sentToday } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', context.userId)
      .eq('status', 'sent')
      .gte('sent_at', since);
    const remaining = Math.max(0, (cfg.daily_limit ?? 300) - (sentToday ?? 0));
    if (remaining === 0) return { sent: 0, failed: 0, error: 'Limite diário atingido' };

    const take = Math.min(data.limit ?? cfg.batch_size ?? 20, cfg.batch_size ?? 20, remaining);
    const { data: items } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('id,phone,company_name,cnpj,message')
      .eq('owner_user_id', context.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(take);

    let sent = 0;
    let failed = 0;
    for (const item of (items ?? []) as any[]) {
      const variables = [item.company_name ?? '', item.cnpj ?? '', item.message ?? ''].filter(
        (_v, i) => i < 3,
      );
      const result = await sendChakraTemplate({
        endpoint: cfg.base_url,
        apiKey,
        channelId: cfg.channel_id,
        to: item.phone,
        templateName: cfg.template_name,
        language: cfg.template_language ?? 'pt_BR',
        variables,
      });
      if (result.ok) {
        sent++;
        await supabaseAdmin
          .from('whatsapp_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: result.messageId,
            template_name: cfg.template_name,
            error_message: null,
          })
          .eq('id', item.id);
      } else {
        failed++;
        await supabaseAdmin
          .from('whatsapp_queue')
          .update({ status: 'failed', error_message: result.error, template_name: cfg.template_name })
          .eq('id', item.id);
      }
      if (cfg.min_delay_ms) await new Promise((r) => setTimeout(r, Math.min(cfg.min_delay_ms, 15000)));
    }

    return { sent, failed, error: null as string | null };
  });

export const clearWaApiQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(['pending', 'failed', 'all']) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let q = supabaseAdmin.from('whatsapp_queue').delete().eq('owner_user_id', context.userId);
    if (data.scope !== 'all') q = q.eq('status', data.scope);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
