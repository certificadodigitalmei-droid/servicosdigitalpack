import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const MIN_AUTO_SYNC_MS = 5 * 60 * 1000;

/** Lista os números remetentes conhecidos + estado da seleção. */
export const getWaSenders = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const { data: senders } = await db
      .from('whatsapp_senders')
      .select('*')
      .order('is_selected', { ascending: false })
      .order('display_phone_number', { ascending: true });

    const list = (senders ?? []) as any[];
    const selected = list.find((s) => s.is_selected) ?? null;
    const connected = list.filter((s) => s.is_active);
    const lastSyncAt = list.reduce<string | null>(
      (acc, s) => (s.last_seen_at && (!acc || s.last_seen_at > acc) ? s.last_seen_at : acc),
      null,
    );

    const { assertSendableSender } = await import('./senders.server');
    const { data: cfg } = await db.from('whatsapp_api_settings').select('template_name').eq('id', 1).maybeSingle();
    const guard = await assertSendableSender(cfg?.template_name ?? null);

    return {
      senders: list,
      selected,
      connectedCount: connected.length,
      needsManualChoice: connected.length > 1 && !selected,
      lastSyncAt,
      sendBlockedReason: guard.ok ? null : guard.error,
    };
  });

/** Ação única: sincroniza conexão (números) e depois os modelos da WABA. */
export const syncWaConnectionAndTemplates = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ auto: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    if (data.auto) {
      const { data: rows } = await db
        .from('whatsapp_senders')
        .select('last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(1);
      const last = (rows ?? [])[0]?.last_seen_at as string | undefined;
      if (last && Date.now() - Date.parse(last) < MIN_AUTO_SYNC_MS) {
        return { skipped: true as const, connection: null, templates: null };
      }
    }

    const { syncWaConnection } = await import('./senders.server');
    const connection = await syncWaConnection();

    let templates: any = null;
    if (connection.ok && connection.selectedWabaId) {
      const { syncTemplates } = await import('./campaign.server');
      templates = await syncTemplates();
    }
    return { skipped: false as const, connection, templates };
  });

/** Seleção explícita do remetente, sempre validada no servidor. */
export const selectWaSender = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phoneNumberId: z.string().trim().min(3).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import('./admin.server');
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as any;

    const { FORBIDDEN_SENDER_IDS, FORBIDDEN_WABA_IDS } = await import('./senders-logic');
    if (FORBIDDEN_SENDER_IDS.has(data.phoneNumberId)) {
      return { ok: false as const, error: 'Este número está desconectado e não pode ser usado.' };
    }

    const { data: sender } = await db
      .from('whatsapp_senders')
      .select('*')
      .eq('phone_number_id', data.phoneNumberId)
      .maybeSingle();
    if (!sender) return { ok: false as const, error: 'Número não encontrado — sincronize a conexão.' };
    if (!sender.is_active || String(sender.status ?? '').toUpperCase() !== 'CONNECTED') {
      return { ok: false as const, error: 'Este número não está conectado no momento.' };
    }
    if (!sender.waba_id || FORBIDDEN_WABA_IDS.has(String(sender.waba_id))) {
      return { ok: false as const, error: 'Conta do WhatsApp (WABA) inválida para este número.' };
    }

    await db.from('whatsapp_senders').update({ is_selected: false }).eq('plugin_id', sender.plugin_id);
    await db.from('whatsapp_senders').update({ is_selected: true }).eq('id', sender.id);

    const { data: cfg } = await db
      .from('whatsapp_api_settings')
      .select('whatsapp_phone_number_id,waba_id')
      .eq('id', 1)
      .maybeSingle();
    const changed =
      String(cfg?.whatsapp_phone_number_id ?? '') !== String(sender.phone_number_id) ||
      String(cfg?.waba_id ?? '') !== String(sender.waba_id);

    await db
      .from('whatsapp_api_settings')
      .update({
        whatsapp_phone_number_id: sender.phone_number_id,
        waba_id: sender.waba_id,
        ...(changed ? { active: false, template_status: 'PENDING' } : {}),
        last_error: null,
      })
      .eq('id', 1);

    if (changed) {
      // Troca de remetente nunca reaproveita fila antiga.
      const { pauseRunningCampaigns } = await import('./campaign.server');
      await pauseRunningCampaigns('Número remetente alterado — recrie a campanha para enviar com o novo número.');
      const { syncTemplates } = await import('./campaign.server');
      await syncTemplates();
    }

    return { ok: true as const, error: null, changed };
  });
