// Motor server-only das campanhas de WhatsApp.
// Roda pelo painel (tick manual) e pelo cron — nunca no cliente.

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { fetchChakraTemplates } from './templates.server';
import {
  classifyWhatsappError,
  sendChakraTemplate,
  statusFromError,
} from './chakra.server';
import {
  decideFailureAction,
  shouldPauseForFailureRate,
  normalizeTemplateStatus,
  remainingDailyCap,
  SENDABLE_TEMPLATE_STATUS,
} from './campaign-logic';
import { loadBlockedPhones } from './blocklist.server';
import { blockPhoneAndQuarantine } from './blocklist.server';
import { markReadySent } from './ready-queue.server';


const db = () => supabaseAdmin as any;

export async function loadWaSettings() {
  const { data } = await db()
    .from('whatsapp_api_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return data as any;
}

// ---------------------------------------------------------------------------
// Sincronização de modelos
// ---------------------------------------------------------------------------

export async function syncTemplates(fetchImpl?: typeof fetch) {
  const apiKey = process.env['CHAKRA_API_KEY'];
  if (!apiKey) return { ok: false as const, error: 'Chave da API não configurada no servidor', synced: 0 };
  const cfg = await loadWaSettings();
  if (!cfg) return { ok: false as const, error: 'Configuração não encontrada', synced: 0 };

  const res = await fetchChakraTemplates({
    apiBaseUrl: cfg.base_url,
    apiKey,
    apiVersion: cfg.whatsapp_api_version ?? 'v19.0',
    wabaId: cfg.waba_id ?? '',
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  if (!res.ok) {
    await db().from('whatsapp_api_settings').update({ last_error: res.error }).eq('id', 1);
    return { ok: false as const, error: res.error, synced: 0 };
  }

  const now = new Date().toISOString();
  for (const t of res.templates) {
    await db()
      .from('whatsapp_templates')
      .upsert(
        {
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          header_text: t.header_text,
          body_text: t.body_text,
          footer_text: t.footer_text,
          button_label: t.button_label,
          button_url_base: t.button_url_base,
          variables: t.variables,
          raw: t.raw as any,
          synced_at: now,
        },
        { onConflict: 'name' },
      );
  }

  // Mantém o status do modelo atualmente escolhido em sincronia.
  const selected = res.templates.find((t) => t.name === cfg.template_name);
  if (selected) {
    await db()
      .from('whatsapp_api_settings')
      .update({
        template_status: selected.status,
        last_error: null,
        active: selected.status === SENDABLE_TEMPLATE_STATUS ? cfg.active : false,
      })
      .eq('id', 1);
  } else {
    await db().from('whatsapp_api_settings').update({ last_error: null }).eq('id', 1);
  }

  // Modelos aprovados que sumiram da conta deixam de ser enviáveis.
  const names = res.templates.map((t) => t.name);
  if (names.length) {
    await db()
      .from('whatsapp_templates')
      .update({ status: 'DISABLED' })
      .not('name', 'in', `(${names.map((n) => `"${n}"`).join(',')})`);
  }

  await pauseCampaignsWithUnapprovedTemplate();

  return { ok: true as const, error: null, synced: res.templates.length, syncedAt: now };
}

export async function pauseCampaignsWithUnapprovedTemplate() {
  const { data: templates } = await db().from('whatsapp_templates').select('name,status');
  const approved = new Set(
    ((templates ?? []) as any[])
      .filter((t) => normalizeTemplateStatus(t.status) === SENDABLE_TEMPLATE_STATUS)
      .map((t) => String(t.name)),
  );
  const { data: running } = await db()
    .from('whatsapp_campaigns')
    .select('id,template_name')
    .eq('status', 'running');
  for (const c of ((running ?? []) as any[])) {
    if (!approved.has(String(c.template_name))) {
      await db()
        .from('whatsapp_campaigns')
        .update({
          status: 'paused',
          paused_reason: 'O modelo deixou de estar aprovado pela Meta — campanha pausada automaticamente.',
        })
        .eq('id', c.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Montagem da fila
// ---------------------------------------------------------------------------

export async function buildCampaignQueue(campaignId: string, limit: number) {
  const cfg = await loadWaSettings();
  const buttonBase = String(cfg?.button_base_url ?? 'https://seu-certificado-mei-digital.online/c/');

  const { data: campaign } = await db()
    .from('whatsapp_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) throw new Error('Campanha não encontrada');

  // Consome a fila de prontidão de forma atômica: dois workers nunca pegam a
  // mesma empresa e nada é criado sem campanha/modelo.
  const { data: reserved, error } = await db().rpc('wa_reserve_ready', {
    _campaign_id: campaignId,
    _limit: limit,
  });
  if (error) throw new Error(error.message);

  const blockedPhones = await loadBlockedPhones();
  const rowsIn = ((reserved ?? []) as any[]).filter((r) => !blockedPhones.has(String(r.phone_e164)));
  const skipped = ((reserved ?? []) as any[]).length - rowsIn.length;

  if (rowsIn.length) {
    const rows = rowsIn.map((s) => ({
      campaign_id: campaignId,
      company_id: s.company_id,
      company_link_id: s.company_link_id,
      company_name: s.company_name,
      cnpj: s.cnpj,
      phone: s.phone_e164,
      token: s.token,
      template_name: campaign.template_name,
      status: 'pending',
    }));
    await db().from('whatsapp_campaign_items').upsert(rows, {
      onConflict: 'campaign_id,company_id',
      ignoreDuplicates: true,
    });
  }

  return { inserted: rowsIn.length, skipped, buttonBase };
}


// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const sleepDefault = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TickDeps = {
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
  send?: typeof sendChakraTemplate;
  maxWallMs?: number;
  maxMessages?: number;
  /** Pausa automática quando a taxa de falhas do tick ficar anormal. */
  failureRateLimit?: number;
};


export async function runCampaignTick(campaignId: string, deps: TickDeps = {}) {
  const sleep = deps.sleep ?? sleepDefault;
  const now = deps.now ?? (() => Date.now());
  const send = deps.send ?? sendChakraTemplate;
  const maxWallMs = deps.maxWallMs ?? 50_000;
  const maxMessages = deps.maxMessages ?? 50;
  const startedAt = now();

  const apiKey = process.env['CHAKRA_API_KEY'];
  if (!apiKey) return { sent: 0, failed: 0, blocked: 0, stopped: 'no_api_key' as const };

  const cfg = await loadWaSettings();
  if (!cfg) return { sent: 0, failed: 0, blocked: 0, stopped: 'no_config' as const };
  if (!cfg.plugin_id || !cfg.whatsapp_phone_number_id) {
    await pauseCampaign(campaignId, 'Conexão incompleta: informe Plugin ID e Phone Number ID.');
    return { sent: 0, failed: 0, blocked: 0, stopped: 'config' as const };
  }

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let stopped: string = 'done';


  for (let i = 0; i < maxMessages; i++) {
    if (now() - startedAt >= maxWallMs) {
      stopped = 'time_budget';
      break;
    }

    const { data: campaign } = await db()
      .from('whatsapp_campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (!campaign || campaign.status !== 'running') {
      stopped = 'not_running';
      break;
    }

    // Modelo precisa continuar aprovado.
    const { data: tpl } = await db()
      .from('whatsapp_templates')
      .select('name,status,language')
      .eq('name', campaign.template_name)
      .maybeSingle();
    if (tpl && normalizeTemplateStatus(tpl.status) !== SENDABLE_TEMPLATE_STATUS) {
      await pauseCampaign(campaignId, 'O modelo deixou de estar aprovado pela Meta.');
      stopped = 'template_not_approved';
      break;
    }

    // Teto de destinatários únicos em 24h.
    const since = new Date(now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: sent24 } = await db()
      .from('whatsapp_campaign_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', since);
    if (remainingDailyCap(campaign.daily_unique_cap ?? 250, sent24 ?? 0) <= 0) {
      await pauseCampaign(campaignId, 'Teto de destinatários em 24 horas atingido. Retome amanhã.');
      stopped = 'daily_cap';
      break;
    }

    // Ritmo: espera até o próximo horário permitido.
    const nextAt = campaign.next_send_at ? Date.parse(campaign.next_send_at) : 0;
    const wait = nextAt - now();
    if (wait > 0) {
      if (now() - startedAt + wait >= maxWallMs) {
        stopped = 'waiting_pace';
        break;
      }
      await sleep(wait);
    }

    const { data: claimedRows } = await db().rpc('wa_campaign_claim_item', { _campaign_id: campaignId });
    const item = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    if (!item) {
      const finishedNow = await handleEmptyQueue(campaignId);
      stopped = finishedNow;
      break;
    }

    const result = await send({
      apiBaseUrl: cfg.base_url,
      apiKey,
      pluginId: cfg.plugin_id,
      whatsappPhoneNumberId: cfg.whatsapp_phone_number_id,
      to: item.phone,
      templateName: item.template_name,
      language: tpl?.language ?? campaign.template_language ?? 'pt_BR',
      razao: String(item.company_name ?? '').trim(),
      cnpj: String(item.cnpj ?? '').trim(),
      buttonToken: String(item.token ?? '').trim(),
    });

    const intervalMs = Math.max(5, campaign.interval_seconds ?? 30) * 1000;
    await db()
      .from('whatsapp_campaigns')
      .update({ next_send_at: new Date(now() + intervalMs).toISOString() })
      .eq('id', campaignId);

    if (result.ok) {
      sent++;
      await db()
        .from('whatsapp_campaign_items')
        .update({
          status: 'sent',
          sent_at: new Date(now()).toISOString(),
          provider_message_id: result.messageId,
          error_message: null,
          locked_at: null,
          lock_token: null,
        })
        .eq('id', item.id);
      if (item.company_id) await markReadySent(String(item.company_id));
      continue;
    }

    const status = statusFromError(result.error);
    const kind = classifyWhatsappError(status, result.error);
    const decision = decideFailureAction({ kind, status, attempts: item.attempts ?? 1 });

    if (decision.action === 'block') {
      blocked++;
      await db()
        .from('whatsapp_campaign_items')
        .update({ status: 'blocked', error_message: result.error, locked_at: null, lock_token: null })
        .eq('id', item.id);
      // Falha permanente do destinatário → exclusão definitiva transacional.
      await blockPhoneAndQuarantine({
        phone: item.phone,
        cnpj: item.cnpj ?? null,
        companyId: item.company_id ?? null,
        reason: result.error,
        source: 'whatsapp_campaign',
        providerStatus: status,
      });
    } else if (decision.action === 'retry') {

      await db()
        .from('whatsapp_campaign_items')
        .update({
          status: 'pending',
          error_message: `${decision.reason}: ${result.error}`,
          next_attempt_at: new Date(now() + decision.delayMs).toISOString(),
          locked_at: null,
          lock_token: null,
        })
        .eq('id', item.id);
    } else if (decision.action === 'pause') {
      failed++;
      await db()
        .from('whatsapp_campaign_items')
        .update({ status: 'pending', error_message: result.error, locked_at: null, lock_token: null })
        .eq('id', item.id);
      await pauseCampaign(campaignId, `${decision.reason}: ${result.error}`);
      stopped = 'paused';
      break;
    } else {
      failed++;
      await db()
        .from('whatsapp_campaign_items')
        .update({ status: 'failed', error_message: result.error, locked_at: null, lock_token: null })
        .eq('id', item.id);
    }

    // Taxa de falhas anormal neste ciclo: pausa para proteger o número.
    if (shouldPauseForFailureRate({ sent, failed, blocked, ...(deps.failureRateLimit !== undefined ? { limit: deps.failureRateLimit } : {}) })) {
      await pauseCampaign(campaignId, 'Muitas falhas seguidas — campanha pausada automaticamente para proteger o número.');
      stopped = 'failure_rate';
      break;
    }
  }

  return { sent, failed, blocked, stopped };
}

async function pauseCampaign(campaignId: string, reason: string) {
  await db()
    .from('whatsapp_campaigns')
    .update({ status: 'paused', paused_reason: reason, last_error: reason })
    .eq('id', campaignId);
}

/** Pausa todas as campanhas em andamento com um motivo auditável. */
export async function pauseRunningCampaigns(reason: string): Promise<number> {
  const { data } = await db()
    .from('whatsapp_campaigns')
    .update({ status: 'paused', paused_reason: reason, last_error: reason })
    .eq('status', 'running')
    .select('id');
  return ((data ?? []) as any[]).length;
}


/**
 * Fila vazia: no modo contínuo importa o próximo lote (nunca antes),
 * caso contrário encerra a campanha.
 */
async function handleEmptyQueue(campaignId: string): Promise<string> {
  const { data: campaign } = await db()
    .from('whatsapp_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return 'not_found';

  const { count: pending } = await db()
    .from('whatsapp_campaign_items')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'sending']);
  if ((pending ?? 0) > 0) return 'pending_locked';

  if (!campaign.continuous_mode) {
    await db()
      .from('whatsapp_campaigns')
      .update({ status: 'finished', finished_at: new Date().toISOString(), paused_reason: null })
      .eq('id', campaignId);
    return 'finished';
  }

  // Modo contínuo: só agora importa o próximo lote.
  const imported = await importNextBatchForCampaign(campaign);
  if (!imported) {
    await db()
      .from('whatsapp_campaigns')
      .update({ paused_reason: 'Aguardando novas empresas elegíveis para importar.' })
      .eq('id', campaignId);
    return 'waiting_import';
  }
  return 'imported';
}

async function importNextBatchForCampaign(campaign: any): Promise<boolean> {
  const built = await buildCampaignQueue(campaign.id, campaign.target_count ?? 20);
  if (built.inserted > 0) return true;

  try {
    const { runImportBatch } = await import('@/lib/casa-dos-dados/simple-flow.server');
    const { data: auto } = await db()
      .from('automatic_company_queries')
      .select('filters,quantity_per_run')
      .eq('owner_user_id', campaign.owner_user_id)
      .maybeSingle();
    const filters = (auto?.filters ?? {}) as any;
    const today = new Date().toISOString().slice(0, 10);
    const r = await runImportBatch({
      date: today,
      filters: {
        only_mei: filters.only_mei ?? true,
        only_active: filters.only_active ?? true,
        only_matriz: filters.only_matriz ?? true,
        require_email: false,
      },
      limit: Math.min(15, auto?.quantity_per_run ?? 10),
      page: 1,
      skipExisting: true,
    });
    if (!r.ok || !r.imported.length) return false;
  } catch {
    return false;
  }

  const again = await buildCampaignQueue(campaign.id, campaign.target_count ?? 20);
  return again.inserted > 0;
}

/** Executa um tick para cada campanha em andamento (usado pelo cron). */
export async function runAllRunningCampaigns(deps: TickDeps = {}) {
  const { data: campaigns } = await db()
    .from('whatsapp_campaigns')
    .select('id')
    .eq('status', 'running')
    .limit(5);
  const results: Array<{ id: string; sent: number; failed: number; blocked: number; stopped: string }> = [];
  for (const c of ((campaigns ?? []) as any[])) {
    const r = await runCampaignTick(c.id, deps);
    results.push({ id: c.id, ...r });
  }
  return results;
}
