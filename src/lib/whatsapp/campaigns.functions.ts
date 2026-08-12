import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { resolveIntervalSeconds, type PacePresetId } from './campaign-logic';
import { computePendingQueue, cumulativeCampaignMetrics } from './webhook-logic';


const paceSchema = z.enum(['cautious', 'recommended', 'moderate', 'custom']);

/** Painel: modelos sincronizados + campanhas + métricas calculadas no banco. */
export const getWaCampaignDashboard = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { maskPhone, friendlyError } = await import('./health-logic');
    const db = supabaseAdmin as any;

    const [{ data: templates }, { data: campaigns }, { data: settings }] = await Promise.all([
      db.from('whatsapp_templates').select('*').order('name'),
      db
        .from('whatsapp_campaigns')
        .select('*')
        .eq('owner_user_id', context.userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      db.from('whatsapp_api_settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Janela móvel de 24h com todos os itens tocados — base de todas as contas.
    const [{ data: window24 }, audience, { data: recent }, { data: pendingRows }] = await Promise.all([
      db
        .from('whatsapp_campaign_items')
        .select('campaign_id,template_name,phone,status,delivery_status,sent_at,updated_at,error_message')
        .gte('updated_at', since24)
        .limit(5000),
      db.from('companies').select('id', { count: 'exact', head: true }).not('whatsapp_phone_e164', 'is', null),
      db
        .from('whatsapp_campaign_items')
        .select(
          'id,campaign_id,company_name,cnpj,phone,template_name,status,delivery_status,error_message,error_code,error_title,error_details,wamid,accepted_at,sent_at,delivered_at,read_at,failed_at,updated_at',
        )
        .order('updated_at', { ascending: false })
        .limit(60),
      db
        .from('whatsapp_campaign_items')
        .select('campaign_id,status,delivery_status,wamid,locked_at')
        .in('status', ['pending', 'sending'])
        .limit(5000),
    ]);

    const rows = (window24 ?? []) as any[];
    const sentRows = rows.filter((r) => r.status === 'sent');
    const uniqueRecipients24h = new Set(sentRows.map((r) => String(r.phone))).size;
    const sent24h = sentRows.length;
    const failed24h = rows.filter((r) => r.status === 'failed').length;
    const blocked24h = rows.filter((r) => r.status === 'blocked').length;
    const attempts24h = sent24h + failed24h + blocked24h;
    const sentHour = sentRows.filter((r) => r.sent_at && r.sent_at >= since1h).length;
    const sentToday = sentRows.filter((r) => r.sent_at && r.sent_at >= todayStart.toISOString()).length;
    const successRate = attempts24h ? Math.round((sent24h / attempts24h) * 100) : null;

    // Situação real informada pela Meta (webhook) nas últimas 24 h.
    const deliveryCount = (s: string) => rows.filter((r) => String(r.delivery_status ?? '') === s).length;
    const metaSent24h = deliveryCount('sent');
    const delivered24h = deliveryCount('delivered');
    const read24h = deliveryCount('read');
    const rejected24h = deliveryCount('failed');

    // Desempenho por modelo (últimas 24h).
    const byTemplate = new Map<string, { template: string; sent: number; failed: number; blocked: number }>();
    for (const r of rows) {
      const key = String(r.template_name ?? '—');
      const acc = byTemplate.get(key) ?? { template: key, sent: 0, failed: 0, blocked: 0 };
      if (r.status === 'sent') acc.sent++;
      else if (r.status === 'failed') acc.failed++;
      else if (r.status === 'blocked') acc.blocked++;
      byTemplate.set(key, acc);
    }

    // Fila real: só pending/sending que ainda não foram aceitos pela API.
    const pendingAll = (pendingRows ?? []) as any[];
    const pendingBreakdown = computePendingQueue(pendingAll);
    const pendingByCampaign = new Map<string, number>();
    for (const p of pendingAll) {
      if (p.wamid) continue;
      const delivery = String(p.delivery_status ?? '');
      if (delivery && delivery !== 'accepted') continue;
      pendingByCampaign.set(String(p.campaign_id), (pendingByCampaign.get(String(p.campaign_id)) ?? 0) + 1);
    }
    // Números por campanha são CUMULATIVOS (campanha inteira), nunca 24 h.
    const campaignIds = ((campaigns ?? []) as any[]).map((c) => String(c.id));
    const allItems: any[] = [];
    if (campaignIds.length) {
      const { data: itemsAll } = await db
        .from('whatsapp_campaign_items')
        .select('campaign_id,status,delivery_status,wamid,accepted_at,sent_at,attempt_started_at')
        .in('campaign_id', campaignIds)
        .limit(20000);
      allItems.push(...((itemsAll ?? []) as any[]));
    }
    const byCampaign = ((campaigns ?? []) as any[]).map((c) => {
      const mine = allItems.filter((r) => String(r.campaign_id) === String(c.id));
      const m = cumulativeCampaignMetrics(mine);
      return {
        id: c.id as string,
        name: c.name as string,
        status: c.status as string,
        total: m.total,
        attempts: m.attempts,
        accepted: m.accepted,
        metaSent: m.metaSent,
        delivered: m.delivered,
        read: m.read,
        rejected: m.rejected,
        confirmationPending: m.confirmationPending,
        cancelled: m.cancelled,
        sent: m.accepted,
        failed: m.rejected,
        blocked: m.rejected,
        pending: pendingByCampaign.get(String(c.id)) ?? m.queued,
      };
    });

    const lastSent = sentRows
      .map((r) => r.sent_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    const lastFailureRow = rows
      .filter((r) => r.status === 'failed' || r.status === 'blocked')
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
      .pop();

    const { countBlockedNumbers } = await import('./blocklist.server');
    const campaignName = new Map(((campaigns ?? []) as any[]).map((c) => [String(c.id), String(c.name)]));

    return {
      templates: templates ?? [],
      campaigns: campaigns ?? [],
      settings: settings ?? null,
      hasApiKey: Boolean(process.env['CHAKRA_API_KEY']),
      metrics: {
        sent24h,
        sentHour,
        sentToday,
        audience: audience.count ?? 0,
        blocked: await countBlockedNumbers(),
        uniqueRecipients24h,
        attempts24h,
        failed24h,
        blocked24h,
        metaSent24h,
        delivered24h,
        read24h,
        rejected24h,
        pendingQueue: pendingBreakdown.pending,
        stuckQueue: pendingBreakdown.stuck,
        acceptedNotFlushed: pendingBreakdown.acceptedButUnflushed,
        successRate,
        realPacePerHour: sentHour,
        activeCampaigns: ((campaigns ?? []) as any[]).filter((c) => c.status === 'running').length,
        pausedCampaigns: ((campaigns ?? []) as any[]).filter((c) => c.status === 'paused').length,
        lastSentAt: lastSent,
        lastFailureAt: lastFailureRow?.updated_at ?? null,
        lastFailureMessage: lastFailureRow ? friendlyError(lastFailureRow.error_message) : null,
      },
      byTemplate: Array.from(byTemplate.values()),
      byCampaign,
      log: ((recent ?? []) as any[]).map((r) => ({
        id: r.id as string,
        at: (r.updated_at ?? r.sent_at) as string,
        campaign: campaignName.get(String(r.campaign_id)) ?? '—',
        company: (r.company_name ?? '—') as string,
        phone: maskPhone(r.phone),
        template: (r.template_name ?? '—') as string,
        status: r.status as string,
        apiStatus: r.accepted_at || r.wamid ? 'accepted' : r.status === 'failed' ? 'rejected' : 'pending',
        deliveryStatus: (r.delivery_status ?? null) as string | null,
        errorCode: (r.error_code ?? null) as string | null,
        errorReason: r.error_title ?? r.error_details ?? (r.error_message ? friendlyError(r.error_message) : null),
        wamid: (r.wamid ?? null) as string | null,
        acceptedAt: (r.accepted_at ?? r.sent_at ?? null) as string | null,
        deliveredAt: (r.delivered_at ?? null) as string | null,
        readAt: (r.read_at ?? null) as string | null,
        failedAt: (r.failed_at ?? null) as string | null,
        error: r.error_message ? friendlyError(r.error_message) : null,
      })),
    };
  });

/**
 * Reconciliação segura: aplica fatos já confirmados no provedor
 * (sem reenviar nenhuma mensagem) a itens localizados por telefone.
 */
export const reconcileWaDeliveries = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        facts: z
          .array(
            z.object({
              phone: z.string().min(8),
              status: z.enum(['sent', 'delivered', 'read', 'failed']),
              code: z.string().nullish(),
              reason: z.string().nullish(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { reconcileDeliveryFacts } = await import('./reconcile.server');
    return reconcileDeliveryFacts(data.facts);
  });


/** Exporta o relatório da campanha (todas as linhas) para CSV. */
export const exportWaCampaignCsv = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { maskPhone, friendlyError } = await import('./health-logic');
    const db = supabaseAdmin as any;

    const { data: campaign } = await db
      .from('whatsapp_campaigns')
      .select('id,name')
      .eq('id', data.id)
      .eq('owner_user_id', context.userId)
      .maybeSingle();
    if (!campaign) return { ok: false as const, error: 'Campanha não encontrada', csv: '', filename: '' };

    const { data: items } = await db
      .from('whatsapp_campaign_items')
      .select('company_name,cnpj,phone,template_name,status,attempts,error_message,sent_at,created_at')
      .eq('campaign_id', data.id)
      .order('created_at', { ascending: true })
      .limit(20000);

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Empresa', 'CNPJ', 'Telefone', 'Modelo', 'Situação', 'Tentativas', 'Erro', 'Aceita pela API em', 'Criada em'];
    const lines = [header.map(esc).join(';')];
    for (const i of ((items ?? []) as any[])) {
      lines.push(
        [
          i.company_name,
          i.cnpj,
          maskPhone(i.phone),
          i.template_name,
          i.status,
          i.attempts,
          i.error_message ? friendlyError(i.error_message) : '',
          i.sent_at ?? '',
          i.created_at ?? '',
        ]
          .map(esc)
          .join(';'),
      );
    }
    return {
      ok: true as const,
      error: null,
      csv: lines.join('\n'),
      filename: `campanha-${String(campaign.name).replace(/[^\w-]+/g, '-').toLowerCase()}.csv`,
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

    const { loadSelectedSender } = await import('./senders.server');
    const sender = await loadSelectedSender();
    if (!sender?.waba_id) {
      return { ok: false as const, error: 'Nenhum número remetente selecionado — sincronize a conexão primeiro.' };
    }

    const { data: tpl } = await db
      .from('whatsapp_templates')
      .select('name,status,language,waba_id')
      .eq('name', data.name)
      .eq('waba_id', sender.waba_id)
      .maybeSingle();
    if (!tpl) return { ok: false as const, error: 'Modelo não encontrado nesta conta do WhatsApp. Sincronize os modelos.' };
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

    // Modelo aprovado + remetente conectado, sempre na mesma WABA.
    const { assertSendableSender } = await import('./senders.server');
    const guard = await assertSendableSender(data.templateName);
    if (!guard.ok) return { ok: false as const, error: guard.error, id: null };
    const sender = guard.sender;

    const { data: tpl } = await db
      .from('whatsapp_templates')
      .select('name,status,language,waba_id')
      .eq('name', data.templateName)
      .eq('waba_id', sender.waba_id)
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
        sender_phone_number_id: sender.phone_number_id,
        sender_waba_id: sender.waba_id,
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

    // Reserva o que já está pronto e importa SOMENTE o déficit real.
    const { fillCampaignQueueToTarget, startCampaignChecked } = await import('./campaign.server');
    const fill = await fillCampaignQueueToTarget(created.id, data.quantity);

    // Fila completa + preflight válido: o clique em "Criar campanha" já é a
    // autorização de início. Fila incompleta nunca dispara parcialmente.
    let autoStarted = false;
    let startError: string | null = null;
    if (fill.complete) {
      const started = await startCampaignChecked(created.id);
      autoStarted = started.ok;
      startError = started.error;
    } else {
      startError = 'A fila não atingiu o alvo — a campanha ficou como rascunho.';
      await db
        .from('whatsapp_campaigns')
        .update({ paused_reason: startError })
        .eq('id', created.id);
    }

    return {
      ok: true as const,
      error: null,
      id: created.id as string,
      inserted: fill.reserved,
      requested: data.quantity,
      available: fill.available,
      reusedFromQueue: fill.reusedFromQueue,
      imported: fill.imported,
      reserved: fill.reserved,
      skipped: fill.skipped,
      missing: fill.missing,
      complete: fill.complete,
      autoStarted,
      startError,
    };
  });


export const controlWaCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(['start', 'pause', 'resume', 'finish', 'clear_pending', 'archive', 'delete']),
      })
      .parse(d),
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

    // Liberação transacional: só sai da campanha o que NUNCA foi tentado.
    const releaseUntried = async (hardDelete: boolean) => {
      const { data: r } = await db.rpc('wa_release_untried', {
        _campaign_id: data.id,
        _hard_delete: hardDelete,
      });
      return (r ?? { released: 0, requeued: 0 }) as { released: number; requeued: number };
    };

    if (data.action === 'clear_pending') {
      const r = await releaseUntried(true);
      return { ok: true as const, error: null, ...r };
    }

    if (data.action === 'delete') {
      if (campaign.status === 'running') {
        return { ok: false as const, error: 'Pause a campanha antes de excluir.' };
      }
      // Histórico de tentativas nunca é apagado: a campanha é arquivada.
      const { count: tried } = await db
        .from('whatsapp_campaign_items')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', data.id)
        .not('status', 'in', '(pending,cancelled)');
      const r = await releaseUntried(true);
      if ((tried ?? 0) > 0) {
        await db
          .from('whatsapp_campaigns')
          .update({ archived_at: new Date().toISOString(), status: 'archived', next_send_at: null })
          .eq('id', data.id);
        return {
          ok: true as const,
          error: null,
          ...r,
          archivedInstead: true,
          message: 'Campanha arquivada: o histórico de tentativas e bloqueios foi preservado.',
        };
      }
      await db.from('whatsapp_campaigns').delete().eq('id', data.id);
      return { ok: true as const, error: null, ...r, archivedInstead: false };
    }

    if (data.action === 'archive') {
      const r = await releaseUntried(false);
      await db
        .from('whatsapp_campaigns')
        .update({ archived_at: new Date().toISOString(), status: 'archived', next_send_at: null })
        .eq('id', data.id);
      return { ok: true as const, error: null, ...r };
    }

    if (data.action === 'finish') {
      const { count: unconfirmed } = await db
        .from('whatsapp_campaign_items')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', data.id)
        .eq('status', 'confirmation_pending');
      const r = await releaseUntried(false);
      await db
        .from('whatsapp_campaigns')
        .update({
          status: (unconfirmed ?? 0) > 0 ? 'finished_partial' : 'finished',
          finished_at: new Date().toISOString(),
          next_send_at: null,
        })
        .eq('id', data.id);
      return { ok: true as const, error: null, ...r };
    }

    if (data.action === 'pause') {
      await db
        .from('whatsapp_campaigns')
        .update({ status: 'paused', paused_reason: 'Pausada pelo administrador', next_send_at: null })
        .eq('id', data.id);
      return { ok: true as const, error: null };
    }

    // start/resume usam a MESMA rotina segura do início automático.
    const { startCampaignChecked } = await import('./campaign.server');
    const started = await startCampaignChecked(data.id);
    if (!started.ok) return { ok: false as const, error: started.error };
    return { ok: true as const, error: null };

  });

export const getWaCampaignDetail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum(['all', 'pending', 'sending', 'sent', 'failed', 'blocked', 'confirmation_pending', 'cancelled'])
          .default('all'),
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

    const statuses = ['pending', 'sending', 'sent', 'failed', 'blocked', 'confirmation_pending', 'cancelled'];
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

/**
 * Reparo administrativo de campanha. Idempotente e auditável:
 * recupera rejeitados a partir da auditoria, correlaciona eventos soltos,
 * marca confirmação pendente e libera reservas órfãs. NUNCA reenvia.
 */
export const repairWaCampaign = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), apply: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const { data: campaign } = await db
      .from('whatsapp_campaigns')
      .select('id,status')
      .eq('id', data.id)
      .eq('owner_user_id', context.userId)
      .maybeSingle();
    if (!campaign) return { ok: false as const, error: 'Campanha não encontrada', report: null };
    if (campaign.status === 'running') {
      return { ok: false as const, error: 'Pause a campanha antes de reparar.', report: null };
    }

    const { data: report, error } = await db.rpc('wa_repair_campaign', {
      _campaign_id: data.id,
      _apply: data.apply,
    });
    if (error) return { ok: false as const, error: error.message, report: null };
    if (data.apply) {
      await db
        .from('automation_audit_logs')
        .insert({ event_type: 'whatsapp_campaign_repair', details: report as any });
    }
    return { ok: true as const, error: null, report };
  });

/** Lista permanente de números e CNPJs bloqueados, com motivo e origem. */
export const getWaBlockedList = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ page: z.number().int().min(1).max(200).default(1) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { maskPhone, friendlyError } = await import('./health-logic');
    const db = supabaseAdmin as any;
    const pageSize = 25;
    const from = (data.page - 1) * pageSize;

    const [{ data: numbers, count }, { count: cnpjCount }] = await Promise.all([
      db
        .from('blocked_contact_numbers')
        .select('id,phone_e164,cnpj_snapshot,reason,source,provider_code,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1),
      db.from('blocked_import_cnpjs').select('id', { count: 'exact', head: true }),
    ]);

    return {
      pageSize,
      total: count ?? 0,
      blockedCnpjs: cnpjCount ?? 0,
      items: ((numbers ?? []) as any[]).map((b) => ({
        id: b.id as string,
        phone: maskPhone(b.phone_e164),
        cnpj: (b.cnpj_snapshot ?? null) as string | null,
        reason: friendlyError(b.reason),
        source: (b.source ?? '—') as string,
        code: (b.provider_code ?? null) as string | null,
        at: b.created_at as string,
      })),
    };
  });
