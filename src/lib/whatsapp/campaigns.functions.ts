import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { resolveIntervalSeconds, type PacePresetId } from './campaign-logic';

const paceSchema = z.enum(['cautious', 'recommended', 'moderate', 'custom']);

/** Painel: modelos sincronizados + campanhas + métricas gerais. */
export const getWaCampaignDashboard = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const [{ data: templates }, { data: campaigns }, { data: settings }] = await Promise.all([
      db.from('whatsapp_templates').select('*').order('name'),
      db
        .from('whatsapp_campaigns')
        .select('*')
        .eq('owner_user_id', context.userId)
        .order('created_at', { ascending: false })
        .limit(20),
      db.from('whatsapp_api_settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [sent24, sent1h, sentToday, audience] = await Promise.all([
      db.from('whatsapp_campaign_items').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', since24),
      db.from('whatsapp_campaign_items').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', since1h),
      db.from('whatsapp_campaign_items').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', todayStart.toISOString()),
      db.from('companies').select('id', { count: 'exact', head: true }).not('whatsapp_phone_e164', 'is', null),
    ]);

    const { countBlockedNumbers } = await import('./blocklist.server');

    return {
      templates: templates ?? [],
      campaigns: campaigns ?? [],
      settings: settings ?? null,
      hasApiKey: Boolean(process.env['CHAKRA_API_KEY']),
      metrics: {
        sent24h: sent24.count ?? 0,
        sentHour: sent1h.count ?? 0,
        sentToday: sentToday.count ?? 0,
        audience: audience.count ?? 0,
        blocked: await countBlockedNumbers(),
      },
    };
  });

export const syncWaTemplates = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { syncTemplates } = await import('./campaign.server');
    return syncTemplates();
  });

/** Guarda o modelo aprovado escolhido pelo administrador. */
export const selectWaTemplate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const { data: tpl } = await db
      .from('whatsapp_templates')
      .select('name,status,language')
      .eq('name', data.name)
      .maybeSingle();
    if (!tpl) return { ok: false as const, error: 'Modelo não encontrado. Sincronize os modelos primeiro.' };
    if (String(tpl.status).toUpperCase() !== 'APPROVED') {
      return { ok: false as const, error: 'Só é possível escolher modelos aprovados pela Meta.' };
    }
    const { error } = await db
      .from('whatsapp_api_settings')
      .update({ template_name: tpl.name, template_language: tpl.language ?? 'pt_BR', template_status: 'APPROVED' })
      .eq('id', 1);
    if (error) throw new Error(error.message);
    return { ok: true as const, error: null };
  });

export const createWaCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        templateName: z.string().trim().min(1).max(200),
        quantity: z.number().int().min(1).max(5000),
        pacePreset: paceSchema,
        customSeconds: z.number().int().min(5).max(3600).optional(),
        dailyCap: z.number().int().min(1).max(5000).default(250),
        continuousMode: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const { data: tpl } = await db
      .from('whatsapp_templates')
      .select('name,status,language')
      .eq('name', data.templateName)
      .maybeSingle();
    if (!tpl || String(tpl.status).toUpperCase() !== 'APPROVED') {
      return { ok: false as const, error: 'Escolha um modelo aprovado pela Meta para criar a campanha.', id: null };
    }

    const interval = resolveIntervalSeconds(data.pacePreset as PacePresetId, data.customSeconds ?? null);

    const { data: created, error } = await db
      .from('whatsapp_campaigns')
      .insert({
        owner_user_id: context.userId,
        name: data.name,
        template_name: tpl.name,
        template_language: tpl.language ?? 'pt_BR',
        status: 'draft',
        pace_preset: data.pacePreset,
        interval_seconds: interval,
        target_count: data.quantity,
        daily_unique_cap: data.dailyCap,
        continuous_mode: data.continuousMode,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const { buildCampaignQueue } = await import('./campaign.server');
    const built = await buildCampaignQueue(created.id, data.quantity);

    return { ok: true as const, error: null, id: created.id as string, ...built };
  });

export const controlWaCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), action: z.enum(['start', 'pause', 'resume', 'finish', 'clear_pending']) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const { data: campaign } = await db
      .from('whatsapp_campaigns')
      .select('*')
      .eq('id', data.id)
      .eq('owner_user_id', context.userId)
      .maybeSingle();
    if (!campaign) return { ok: false as const, error: 'Campanha não encontrada' };

    if (data.action === 'clear_pending') {
      // Nunca apaga envios concluídos — só o que ainda não saiu.
      await db.from('whatsapp_campaign_items').delete().eq('campaign_id', data.id).eq('status', 'pending');
      return { ok: true as const, error: null };
    }

    if (data.action === 'finish') {
      await db
        .from('whatsapp_campaigns')
        .update({ status: 'finished', finished_at: new Date().toISOString(), next_send_at: null })
        .eq('id', data.id);
      return { ok: true as const, error: null };
    }

    if (data.action === 'pause') {
      await db
        .from('whatsapp_campaigns')
        .update({ status: 'paused', paused_reason: 'Pausada pelo administrador' })
        .eq('id', data.id);
      return { ok: true as const, error: null };
    }

    const { data: tpl } = await db
      .from('whatsapp_templates')
      .select('status')
      .eq('name', campaign.template_name)
      .maybeSingle();
    if (!tpl || String(tpl.status).toUpperCase() !== 'APPROVED') {
      return { ok: false as const, error: 'O modelo desta campanha não está aprovado pela Meta.' };
    }

    await db
      .from('whatsapp_campaigns')
      .update({
        status: 'running',
        paused_reason: null,
        last_error: null,
        next_send_at: new Date().toISOString(),
        started_at: campaign.started_at ?? new Date().toISOString(),
        finished_at: null,
      })
      .eq('id', data.id);
    return { ok: true as const, error: null };
  });

export const getWaCampaignDetail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(['all', 'pending', 'sent', 'failed', 'blocked']).default('all'),
        page: z.number().int().min(1).max(500).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;
    const pageSize = 25;

    const { data: campaign } = await db
      .from('whatsapp_campaigns')
      .select('*')
      .eq('id', data.id)
      .eq('owner_user_id', context.userId)
      .maybeSingle();
    if (!campaign) return { campaign: null, items: [], total: 0, counts: null };

    const statuses = ['pending', 'sending', 'sent', 'failed', 'blocked'];
    const counts: Record<string, number> = {};
    await Promise.all(
      statuses.map(async (s) => {
        const { count } = await db
          .from('whatsapp_campaign_items')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', data.id)
          .eq('status', s);
        counts[s] = count ?? 0;
      }),
    );

    let q = db
      .from('whatsapp_campaign_items')
      .select('*', { count: 'exact' })
      .eq('campaign_id', data.id)
      .order('created_at', { ascending: true })
      .range((data.page - 1) * pageSize, data.page * pageSize - 1);
    if (data.status !== 'all') q = q.eq('status', data.status);
    const { data: items, count } = await q;

    return { campaign, items: items ?? [], total: count ?? 0, counts, pageSize };
  });

/** Busca empresas importadas com celular válido e link ativo (para o teste). */
export const searchWaCompanies = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().max(120).default('') }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;
    const { companyDisplayName, companyMobile } = await import('./campaign-logic');

    let q = db
      .from('companies')
      .select('id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,ddd,telefones,whatsapp_phone_e164')
      .not('whatsapp_phone_e164', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40);
    const term = data.q.replace(/\s+/g, ' ').trim();
    if (term) {
      const digits = term.replace(/\D/g, '');
      q = digits.length >= 3
        ? q.ilike('cnpj', `%${digits}%`)
        : q.or(
            `razao_social_original.ilike.%${term}%,nome_fantasia.ilike.%${term}%,nome_titular_exibicao.ilike.%${term}%`,
          );
    }
    const { data: companies } = await q;

    const ids = ((companies ?? []) as any[]).map((c) => c.id);
    const tokens = new Map<string, string>();
    if (ids.length) {
      const { data: links } = await db
        .from('company_links')
        .select('company_id,public_token')
        .in('company_id', ids)
        .eq('active', true);
      for (const l of ((links ?? []) as any[])) {
        if (l.public_token && !tokens.has(l.company_id)) tokens.set(l.company_id, String(l.public_token));
      }
    }

    return ((companies ?? []) as any[])
      .map((c) => ({
        id: c.id as string,
        name: companyDisplayName(c),
        cnpj: String(c.cnpj ?? ''),
        phone: companyMobile(c),
        token: tokens.get(c.id) ?? null,
      }))
      .filter((c) => c.phone && c.token)
      .slice(0, 20);
  });

/**
 * Teste: usa razão, CNPJ e token da empresa escolhida, mas envia
 * exclusivamente para o número digitado. Não altera dados nem fila.
 */
export const sendWaCampaignTest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        phone: z.string().trim().min(8).max(30),
        templateName: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;
    const { validateBrazilianMobile } = await import('@/lib/phone/brazilian-mobile');
    const { companyDisplayName } = await import('./campaign-logic');
    const { sendChakraTemplate } = await import('./chakra.server');

    const apiKey = process.env['CHAKRA_API_KEY'];
    if (!apiKey) return { ok: false as const, error: 'Chave da API não configurada no servidor' };

    const validated = validateBrazilianMobile(data.phone);
    if (!validated.valid) {
      return { ok: false as const, error: 'Informe um celular brasileiro válido (DDD + 9 dígitos).' };
    }

    const { data: tpl } = await db
      .from('whatsapp_templates')
      .select('name,status,language')
      .eq('name', data.templateName)
      .maybeSingle();
    if (!tpl || String(tpl.status).toUpperCase() !== 'APPROVED') {
      return { ok: false as const, error: 'O modelo escolhido não está aprovado pela Meta.' };
    }

    const { data: company } = await db
      .from('companies')
      .select('id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia')
      .eq('id', data.companyId)
      .maybeSingle();
    if (!company) return { ok: false as const, error: 'Empresa não encontrada' };

    const { data: link } = await db
      .from('company_links')
      .select('public_token')
      .eq('company_id', company.id)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const token = String(link?.public_token ?? '').trim();
    if (!token) return { ok: false as const, error: 'A empresa escolhida não tem link ativo.' };

    const cfg = await db.from('whatsapp_api_settings').select('*').eq('id', 1).maybeSingle();
    const c = cfg.data as any;
    if (!c?.plugin_id || !c?.whatsapp_phone_number_id) {
      return { ok: false as const, error: 'Conexão incompleta: informe Plugin ID e Phone Number ID.' };
    }

    const result = await sendChakraTemplate({
      apiBaseUrl: c.base_url,
      apiKey,
      pluginId: c.plugin_id,
      whatsappPhoneNumberId: c.whatsapp_phone_number_id,
      to: validated.e164, // somente o destinatário do teste é sobrescrito
      templateName: tpl.name,
      language: tpl.language ?? 'pt_BR',
      razao: companyDisplayName(company),
      cnpj: String(company.cnpj ?? ''),
      buttonToken: token,
    });

    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, error: null, phone: validated.e164, messageId: result.messageId };
  });

export const tickWaCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { runCampaignTick } = await import('./campaign.server');
    return runCampaignTick(data.id, { maxWallMs: 20_000, maxMessages: 10 });
  });

export const refillWaCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { buildCampaignQueue } = await import('./campaign.server');
    return buildCampaignQueue(data.id, data.quantity);
  });
