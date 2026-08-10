// Integração server-only com a lista de números remetentes da Chakra.
// A chave da API nunca sai do servidor nem aparece em erros/logs.

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { extractErrorMessage } from './chakra.server';
import {
  decideConnectionFreshness,
  decideSenderSelection,
  isConnectionFresh,
  isEligibleSender,
  parseChakraPhoneNumbers,
  SEND_CONNECTION_MAX_AGE_MS,
  validateSenderForSend,
  type ChakraPhoneNumber,
} from './senders-logic';


const db = () => supabaseAdmin as any;

export type FetchSendersResult =
  | { ok: true; numbers: ChakraPhoneNumber[] }
  | { ok: false; error: string };

export async function fetchChakraPhoneNumbers(opts: {
  apiBaseUrl: string;
  apiKey: string;
  pluginId: string;
  fetchImpl?: typeof fetch;
}): Promise<FetchSendersResult> {
  if (!opts.pluginId) return { ok: false, error: 'Plugin ID não configurado' };
  const base = (opts.apiBaseUrl || 'https://api.chakrahq.com').replace(/\/+$/, '');
  const url = `${base}/v1/ext/whatsapp-phone-number?pluginId=${encodeURIComponent(opts.pluginId)}`;
  const doFetch = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, { headers: { Authorization: `Bearer ${opts.apiKey}` } });
  } catch (e: any) {
    return { ok: false, error: `falha de rede: ${e?.message ?? 'desconhecida'}` };
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) return { ok: false, error: `[${res.status}] ${extractErrorMessage(json, text)}` };
  return { ok: true, numbers: parseChakraPhoneNumbers(json) };
}

export type SyncConnectionResult = {
  ok: boolean;
  error: string | null;
  numbers: number;
  eligible: number;
  selectedPhoneNumberId: string | null;
  selectedWabaId: string | null;
  blocked: boolean;
  reason: string | null;
  syncedAt: string | null;
};

/**
 * Busca os números do plugin, persiste o estado e mantém a seleção segura.
 * Falha de rede nunca apaga a última seleção válida.
 */
export async function syncWaConnection(fetchImpl?: typeof fetch): Promise<SyncConnectionResult> {
  const base: SyncConnectionResult = {
    ok: false,
    error: null,
    numbers: 0,
    eligible: 0,
    selectedPhoneNumberId: null,
    selectedWabaId: null,
    blocked: true,
    reason: null,
    syncedAt: null,
  };

  const apiKey = process.env['CHAKRA_API_KEY'];
  if (!apiKey) return { ...base, error: 'CHAKRA_API_KEY não configurada' };

  const { data: cfg } = await db().from('whatsapp_api_settings').select('*').eq('id', 1).maybeSingle();
  if (!cfg) return { ...base, error: 'Configuração não encontrada' };
  const pluginId = String(cfg.plugin_id ?? '').trim();
  if (!pluginId) return { ...base, error: 'Plugin ID não configurado' };

  const res = await fetchChakraPhoneNumbers({
    apiBaseUrl: cfg.base_url,
    apiKey,
    pluginId,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  if (!res.ok) {
    await db().from('whatsapp_api_settings').update({ last_error: res.error }).eq('id', 1);
    return { ...base, error: res.error };
  }

  const now = new Date().toISOString();
  const eligible = res.numbers.filter(isEligibleSender);

  for (const n of res.numbers) {
    await db()
      .from('whatsapp_senders')
      .upsert(
        {
          plugin_id: pluginId,
          phone_number_id: n.phoneNumberId,
          waba_id: n.wabaId,
          display_phone_number: n.displayPhoneNumber,
          verified_name: n.verifiedName,
          status: n.status,
          chakra_status: n.chakraStatus,
          quality_score: n.qualityScore,
          messaging_limit_tier: n.messagingLimitTier,
          account_mode: n.accountMode,
          name_status: n.nameStatus,
          is_active: isEligibleSender(n),
          last_seen_at: now,
          raw: n.raw as any,
        },
        { onConflict: 'plugin_id,phone_number_id' },
      );
  }

  // Quem sumiu ou desconectou deixa de ser ativo (a seleção é revalidada abaixo).
  const seenIds = res.numbers.map((n) => n.phoneNumberId);
  let stale = db().from('whatsapp_senders').update({ is_active: false }).eq('plugin_id', pluginId);
  if (seenIds.length) stale = stale.not('phone_number_id', 'in', `(${seenIds.map((i) => `"${i}"`).join(',')})`);
  await stale;

  const { data: selectedRow } = await db()
    .from('whatsapp_senders')
    .select('phone_number_id')
    .eq('plugin_id', pluginId)
    .eq('is_selected', true)
    .maybeSingle();

  const decision = decideSenderSelection(eligible, selectedRow?.phone_number_id ?? null);

  await db().from('whatsapp_senders').update({ is_selected: false }).eq('plugin_id', pluginId).neq('phone_number_id', decision.selected?.phoneNumberId ?? '__none__');

  if (decision.selected) {
    await db()
      .from('whatsapp_senders')
      .update({ is_selected: true })
      .eq('plugin_id', pluginId)
      .eq('phone_number_id', decision.selected.phoneNumberId);

    const changed =
      String(cfg.whatsapp_phone_number_id ?? '') !== decision.selected.phoneNumberId ||
      String(cfg.waba_id ?? '') !== String(decision.selected.wabaId ?? '');

    await db()
      .from('whatsapp_api_settings')
      .update({
        whatsapp_phone_number_id: decision.selected.phoneNumberId,
        waba_id: decision.selected.wabaId,
        last_error: null,
      })
      .eq('id', 1);

    if (changed) {
      const { pauseRunningCampaigns } = await import('./campaign.server');
      await pauseRunningCampaigns(
        'Número remetente alterado — confirme e recrie a campanha antes de retomar (filas antigas não são reaproveitadas).',
      );
      await db().from('whatsapp_api_settings').update({ active: false }).eq('id', 1);
    }
  } else {
    // Sem seleção válida: bloqueia o envio sem escolher nada por conta própria.
    await db().from('whatsapp_api_settings').update({ active: false, last_error: decision.reason }).eq('id', 1);
    const { pauseRunningCampaigns } = await import('./campaign.server');
    await pauseRunningCampaigns(decision.reason ?? 'Conexão do WhatsApp indisponível.');
  }

  return {
    ok: true,
    error: null,
    numbers: res.numbers.length,
    eligible: eligible.length,
    selectedPhoneNumberId: decision.selected?.phoneNumberId ?? null,
    selectedWabaId: decision.selected?.wabaId ?? null,
    blocked: decision.blocked,
    reason: decision.reason,
    syncedAt: now,
  };
}

export type SelectedSender = {
  phone_number_id: string;
  waba_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string | null;
  chakra_status: string | null;
  is_active: boolean;
  is_selected: boolean;
  last_seen_at: string | null;
};

export async function loadSelectedSender(): Promise<SelectedSender | null> {
  const { data } = await db()
    .from('whatsapp_senders')
    .select('*')
    .eq('is_selected', true)
    .maybeSingle();
  return (data as SelectedSender | null) ?? null;
}

export type SendGuard =
  | { ok: true; sender: SelectedSender; template: any; error: null }
  | { ok: false; sender: SelectedSender | null; template: any; error: string };

/**
 * Guarda única usada por sendWaBatch, teste e tick: conexão confirmada há
 * pouco + remetente CONNECTED + modelo APPROVED da MESMA WABA.
 * Nunca confia só nos campos antigos.
 */
export async function assertSendableSender(
  templateName: string | null | undefined,
  opts?: { now?: number; fetchImpl?: typeof fetch },
): Promise<SendGuard> {
  const now = opts?.now ?? Date.now();
  let sender = await loadSelectedSender();

  // Confirmação vencida: tenta uma nova consulta antes de decidir.
  if (sender && !isConnectionFresh(sender.last_seen_at, now, SEND_CONNECTION_MAX_AGE_MS)) {
    let resyncOk = false;
    let resyncError: string | null = null;
    try {
      const r = await syncWaConnection(opts?.fetchImpl);
      resyncOk = r.ok;
      resyncError = r.error;
    } catch (e: any) {
      resyncOk = false;
      resyncError = e?.message ?? 'falha ao consultar a conexão';
    }
    // A seleção nunca é apagada aqui — apenas relida.
    sender = await loadSelectedSender();
    const fresh = decideConnectionFreshness({
      lastSeenAt: sender?.last_seen_at ?? null,
      now: opts?.now ?? Date.now(),
      resyncAttempted: true,
      resyncOk,
      resyncError,
    });
    if (!fresh.ok) return { ok: false, sender, template: null, error: fresh.error ?? 'Envio bloqueado' };
  }

  const name = String(templateName ?? '').trim() || null;
  let template: any = null;
  if (name && sender?.waba_id) {
    const { data } = await db()
      .from('whatsapp_templates')
      .select('name,status,language,waba_id')
      .eq('name', name)
      .eq('waba_id', sender.waba_id)
      .maybeSingle();
    template = data ?? null;
  }
  const check = validateSenderForSend({ sender, template, templateName: name });
  if (!check.ok) return { ok: false, sender, template, error: check.error ?? 'Envio bloqueado' };
  return { ok: true, sender: sender as SelectedSender, template, error: null };
}

