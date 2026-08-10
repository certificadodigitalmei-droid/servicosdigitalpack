import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const SENDABLE_STATUS = 'APPROVED';

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
      .not('whatsapp_phone_e164', 'is', null);

    const { countBlockedNumbers } = await import('./blocklist.server');
    const blocked = await countBlockedNumbers();

    const { data: recent } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('id,phone,company_name,cnpj,status,sent_at,error_message,created_at,provider_message_id,button_url_token')
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
        blocked,
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
        plugin_id: z.string().trim().max(200).nullable().optional(),
        whatsapp_phone_number_id: z.string().trim().max(200).nullable().optional(),
        waba_id: z.string().trim().max(200).nullable().optional(),
        whatsapp_api_version: z.string().trim().min(2).max(20),
        button_base_url: z.string().trim().url().max(500),
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

    const { data: current } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('template_status')
      .eq('id', 1)
      .maybeSingle();
    const status = String((current as any)?.template_status ?? 'PENDING').toUpperCase();

    const { error } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .update({
        ...data,
        // Envio só pode ficar ativo com template aprovado
        active: status === SENDABLE_STATUS ? data.active : false,
        provider: 'chakrahq',
      } as any)
      .eq('id', 1);
    if (error) throw new Error(error.message);
    return { ok: true, templateStatus: status };
  });

export const syncWaTemplateStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { fetchChakraTemplateStatus } = await import('./chakra.server');

    const apiKey = process.env['CHAKRA_API_KEY'];
    if (!apiKey) return { ok: false as const, status: null, error: 'CHAKRA_API_KEY não configurada' };

    const { data: cfg } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!cfg) return { ok: false as const, status: null, error: 'Configuração não encontrada' };
    const c = cfg as any;

    const result = await fetchChakraTemplateStatus({
      apiBaseUrl: c.base_url,
      apiKey,
      apiVersion: c.whatsapp_api_version ?? 'v19.0',
      wabaId: c.waba_id ?? '',
      templateName: c.template_name ?? '',
    });

    if (!result.ok) {
      await supabaseAdmin
        .from('whatsapp_api_settings')
        .update({ last_error: result.error } as any)
        .eq('id', 1);
      return { ok: false as const, status: null, error: result.error };
    }

    await supabaseAdmin
      .from('whatsapp_api_settings')
      .update({
        template_status: result.status,
        last_error: null,
        active: result.status === SENDABLE_STATUS ? c.active : false,
      } as any)
      .eq('id', 1);

    return { ok: true as const, status: result.status, error: null };
  });

export const enqueueWaCompanies = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { pickCompanyPhone } = await import('./chakra.server');

    const { data: cfg } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('button_base_url')
      .eq('id', 1)
      .maybeSingle();
    const buttonBase = String(
      (cfg as any)?.button_base_url ?? 'https://seu-certificado-mei-digital.online/c/',
    );

    const { data: companies, error } = await supabaseAdmin
      .from('companies')
      .select('id,cnpj,razao_social_original,nome_titular_exibicao,nome_fantasia,ddd,telefones,whatsapp_phone_e164')
      .not('whatsapp_phone_e164', 'is', null)
      .order('created_at', { ascending: false })
      .limit(data.limit * 3);
    if (error) throw new Error(error.message);

    const { loadBlockedPhones } = await import('./blocklist.server');
    const blockedPhones = await loadBlockedPhones();

    const ids = (companies ?? []).map((c: any) => c.id);
    const linkByCompany = new Map<string, { id: string; token: string }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: links } = await supabaseAdmin
        .from('company_links')
        .select('id,company_id,public_token')
        .in('company_id', ids.slice(i, i + 200))
        .eq('active', true);
      for (const l of (links ?? []) as any[]) {
        if (l.company_id && l.public_token && String(l.public_token).trim() && !linkByCompany.has(l.company_id)) {
          linkByCompany.set(l.company_id, { id: l.id, token: String(l.public_token).trim() });
        }
      }
    }

    const { data: existingRows } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('phone')
      .eq('owner_user_id', context.userId);
    const existing = new Set((existingRows ?? []).map((r: any) => String(r.phone)));

    const rows: any[] = [];
    let skippedNoLink = 0;
    let skippedNoPhone = 0;
    let skippedNoCnpj = 0;
    let skippedBlocked = 0;
    for (const c of (companies ?? []) as any[]) {
      if (rows.length >= data.limit) break;
      // pickCompanyPhone só devolve celular brasileiro válido (E.164).
      const phone = pickCompanyPhone(c);
      if (!phone) {
        skippedNoPhone++;
        continue;
      }
      if (blockedPhones.has(phone)) {
        skippedBlocked++;
        continue;
      }
      if (existing.has(phone)) continue;
      if (!String(c.cnpj ?? '').trim()) {
        skippedNoCnpj++;
        continue;
      }
      const link = linkByCompany.get(c.id) ?? null;
      if (!link) {
        skippedNoLink++;
        continue;
      }
      existing.add(phone);
      const name = c.nome_titular_exibicao || c.nome_fantasia || c.razao_social_original || 'Empresa';
      rows.push({
        owner_user_id: context.userId,
        phone,
        message: `${buttonBase}${link.token}`,
        button_url_token: link.token,
        company_name: name,
        cnpj: c.cnpj,
        company_id: c.id,
        company_link_id: link.id,
        provider: 'chakrahq',
        status: 'pending',
      });
    }

    if (!rows.length) return { inserted: 0, skippedNoLink, skippedNoPhone, skippedNoCnpj, skippedBlocked };
    const { error: insErr } = await supabaseAdmin.from('whatsapp_queue').insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { inserted: rows.length, skippedNoLink, skippedNoPhone, skippedNoCnpj, skippedBlocked };
  });

/**
 * Limpeza preventiva: remove da fila (sem chamar a API) todo item cujo
 * telefone não seja celular brasileiro válido ou esteja bloqueado.
 */
export const cleanupWaQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { validateBrazilianMobile } = await import('@/lib/phone/brazilian-mobile');
    const { loadBlockedPhones } = await import('./blocklist.server');
    const blockedPhones = await loadBlockedPhones();

    const { data: rows } = await supabaseAdmin
      .from('whatsapp_queue')
      .select('id,phone')
      .eq('owner_user_id', context.userId)
      .neq('status', 'sent')
      .limit(5000);

    const toRemove = ((rows ?? []) as any[])
      .filter((r) => !validateBrazilianMobile(r.phone).valid || blockedPhones.has(String(r.phone)))
      .map((r) => r.id as string);

    for (let i = 0; i < toRemove.length; i += 200) {
      await supabaseAdmin.from('whatsapp_queue').delete().in('id', toRemove.slice(i, i + 200));
    }
    return { removed: toRemove.length, scanned: (rows ?? []).length };
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

    const { data: cfgRow } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!cfgRow) return { sent: 0, failed: 0, error: 'Configuração não encontrada' };
    const cfg = cfgRow as any;

    const status = String(cfg.template_status ?? 'PENDING').toUpperCase();
    if (status !== SENDABLE_STATUS) {
      return { sent: 0, failed: 0, error: `Template com status ${status}: envio bloqueado até a aprovação do WhatsApp` };
    }
    if (!cfg.active) return { sent: 0, failed: 0, error: 'Envio desativado nas configurações' };
    if (!cfg.template_name) return { sent: 0, failed: 0, error: 'Informe o nome do template aprovado' };
    if (!cfg.plugin_id) return { sent: 0, failed: 0, error: 'Informe o Plugin ID da ChakraHQ' };

    // Remetente CONNECTED + modelo APPROVED na mesma WABA (nunca só o campo antigo).
    const { assertSendableSender } = await import('./senders.server');
    const guard = await assertSendableSender(cfg.template_name);
    if (!guard.ok) return { sent: 0, failed: 0, error: guard.error };
    const sender = guard.sender;


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
      .select('id,phone,company_name,cnpj,message,button_url_token,company_id')
      .eq('owner_user_id', context.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(take);

    const { classifyWhatsappError, statusFromError } = await import('./chakra.server');
    const { blockPhoneAndQuarantine } = await import('./blocklist.server');

    let sent = 0;
    let failed = 0;
    let blockedPermanently = 0;

    for (const item of (items ?? []) as any[]) {
      const token = String(item.button_url_token ?? '').trim();
      const razao = String(item.company_name ?? '').trim();
      const cnpj = String(item.cnpj ?? '').trim();
      const blocked = !token
        ? 'Item antigo sem token de link — regenere a fila'
        : !razao
          ? 'Item sem razão social — regenere a fila'
          : !cnpj
            ? 'Item sem CNPJ — regenere a fila'
            : null;
      if (blocked) {
        failed++;
        await supabaseAdmin
          .from('whatsapp_queue')
          .update({ status: 'failed', error_message: blocked } as any)
          .eq('id', item.id);
        continue;
      }


      const result = await sendChakraTemplate({
        apiBaseUrl: cfg.base_url,
        apiKey,
        pluginId: cfg.plugin_id,
        whatsappPhoneNumberId: sender.phone_number_id,

        to: item.phone,
        templateName: cfg.template_name,
        language: cfg.template_language ?? 'pt_BR',
        razao,
        cnpj,
        buttonToken: token,
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
        const kind = classifyWhatsappError(statusFromError(result.error), result.error);
        if (kind === 'permanent_recipient') {
          // Número inexistente / sem WhatsApp: bloqueio definitivo,
          // remoção da empresa e dos links — nunca mais será importado.
          blockedPermanently++;
          await blockPhoneAndQuarantine({
            phone: item.phone,
            cnpj: item.cnpj ?? null,
            companyId: item.company_id ?? null,
            reason: result.error,
            source: 'whatsapp_send',
            providerStatus: statusFromError(result.error),
          });
        } else if (kind === 'temporary') {
          await supabaseAdmin
            .from('whatsapp_queue')
            .update({ status: 'pending', error_message: result.error, template_name: cfg.template_name } as any)
            .eq('id', item.id);
        } else {
          await supabaseAdmin
            .from('whatsapp_queue')
            .update({ status: 'failed', error_message: result.error, template_name: cfg.template_name })
            .eq('id', item.id);
        }
      }
      if (cfg.min_delay_ms) await new Promise((r) => setTimeout(r, Math.min(cfg.min_delay_ms, 15000)));
    }

    return { sent, failed, blockedPermanently, error: null as string | null };
  });

export const sendWaTestMessage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phone: z.string().trim().min(8).max(30),
        razao: z.string().trim().max(200).optional(),
        cnpj: z.string().trim().max(30).optional(),
        token: z.string().trim().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { sendChakraTemplate, normalizePhone } = await import('./chakra.server');

    const apiKey = process.env['CHAKRA_API_KEY'];
    if (!apiKey) return { ok: false as const, error: 'CHAKRA_API_KEY não configurada' };

    const phone = normalizePhone(data.phone);
    if (!phone) return { ok: false as const, error: 'Telefone inválido — use DDD + número (ex.: 11 99999-9999)' };

    const { data: cfgRow } = await supabaseAdmin
      .from('whatsapp_api_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (!cfgRow) return { ok: false as const, error: 'Configuração não encontrada' };
    const cfg = cfgRow as any;

    const status = String(cfg.template_status ?? 'PENDING').toUpperCase();
    if (status !== SENDABLE_STATUS) {
      return { ok: false as const, error: `Template com status ${status}: teste bloqueado até a aprovação do WhatsApp` };
    }
    if (!cfg.template_name) return { ok: false as const, error: 'Informe o nome do template aprovado' };
    if (!cfg.plugin_id) return { ok: false as const, error: 'Informe o Plugin ID da ChakraHQ' };
    const { assertSendableSender } = await import('./senders.server');
    const guard = await assertSendableSender(cfg.template_name);
    if (!guard.ok) return { ok: false as const, error: guard.error };
    const sender = guard.sender;


    let token = String(data.token ?? '').trim();
    if (!token) {
      const { data: link } = await supabaseAdmin
        .from('company_links')
        .select('public_token')
        .eq('active', true)
        .not('public_token', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      token = String((link as any)?.public_token ?? '').trim();
    }
    if (!token) return { ok: false as const, error: 'Nenhum token de link disponível — informe um token manualmente' };

    const result = await sendChakraTemplate({
      apiBaseUrl: cfg.base_url,
      apiKey,
      pluginId: cfg.plugin_id,
      whatsappPhoneNumberId: sender.phone_number_id,
      to: phone,
      templateName: cfg.template_name,
      language: cfg.template_language ?? 'pt_BR',
      razao: data.razao?.trim() || 'Empresa Teste',
      cnpj: data.cnpj?.trim() || '00.000.000/0001-00',
      buttonToken: token,
    });

    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, phone, messageId: result.messageId, error: null };
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
