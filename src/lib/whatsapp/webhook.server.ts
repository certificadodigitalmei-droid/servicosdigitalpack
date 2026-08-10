// Aplicação server-only dos eventos de status recebidos da Meta/Chakra.

import {
  parseWhatsappWebhook,
  canApplyStatus,
  itemStatusForDelivery,
  type ParsedStatusEvent,
} from './webhook-logic';

async function admin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as any;
}

export type ApplyResult = {
  received: number;
  applied: number;
  duplicated: number;
  unknown: number;
  finalFailures: number;
  inbound: number;
};

async function recordEvent(db: any, ev: ParsedStatusEvent, itemId: string | null, raw: unknown): Promise<boolean> {
  const { data, error } = await db
    .from('whatsapp_message_events')
    .upsert(
      {
        wamid: ev.wamid,
        campaign_item_id: itemId,
        status: ev.status,
        recipient: ev.recipient,
        error_code: ev.errorCode,
        error_title: ev.errorTitle,
        error_details: ev.errorDetails,
        raw: raw as any,
        occurred_at: ev.occurredAt,
      },
      { onConflict: 'wamid,status', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

export async function auditFinalFailure(
  db: any,
  input: {
    phone: string | null;
    companyId: string | null;
    companyName: string | null;
    cnpj: string | null;
    campaignId: string | null;
    templateName: string | null;
    wamid: string | null;
    errorCode: string | null;
    reason: string;
  },
) {
  await db.from('whatsapp_failure_audit').insert({
    phone_e164: input.phone,
    company_id: input.companyId,
    company_name: input.companyName,
    cnpj: input.cnpj,
    campaign_id: input.campaignId,
    template_name: input.templateName,
    wamid: input.wamid,
    error_code: input.errorCode,
    reason: input.reason.slice(0, 500),
    source: 'whatsapp_webhook',
  });
}

/** Processa o corpo bruto do webhook. Idempotente por (wamid, status). */
export async function applyWhatsappWebhook(payload: unknown): Promise<ApplyResult> {
  const db = await admin();
  const parsed = parseWhatsappWebhook(payload);
  const result: ApplyResult = {
    received: parsed.statuses.length,
    applied: 0,
    duplicated: 0,
    unknown: 0,
    finalFailures: 0,
    inbound: parsed.inbound.length,
  };

  for (const ev of parsed.statuses) {
    const { data: item } = await db
      .from('whatsapp_campaign_items')
      .select('id,campaign_id,company_id,company_name,cnpj,phone,template_name,status,delivery_status')
      .eq('wamid', ev.wamid)
      .maybeSingle();

    const isNew = await recordEvent(db, ev, item?.id ?? null, payload);
    if (!isNew) {
      result.duplicated++;
      continue;
    }
    if (!item) {
      result.unknown++;
      continue;
    }
    if (!canApplyStatus(item.delivery_status, ev.status)) {
      result.duplicated++;
      continue;
    }

    const reason = [ev.errorCode, ev.errorTitle ?? ev.errorDetails].filter(Boolean).join(' — ') || ev.status;
    const patch: Record<string, unknown> = {
      delivery_status: ev.status,
      status: itemStatusForDelivery(ev.status, ev.finalFailure),
      error_code: ev.errorCode,
      error_title: ev.errorTitle,
      error_details: ev.errorDetails,
    };
    if (ev.status === 'sent') patch['sent_at'] = ev.occurredAt;
    if (ev.status === 'delivered') patch['delivered_at'] = ev.occurredAt;
    if (ev.status === 'read') patch['read_at'] = ev.occurredAt;
    if (ev.status === 'failed') {
      patch['failed_at'] = ev.occurredAt;
      patch['error_message'] = reason;
      patch['locked_at'] = null;
      patch['lock_token'] = null;
    }

    await db.from('whatsapp_campaign_items').update(patch).eq('id', item.id);
    result.applied++;

    if (ev.status === 'failed' && ev.finalFailure) {
      result.finalFailures++;
      await auditFinalFailure(db, {
        phone: item.phone ?? null,
        companyId: item.company_id ?? null,
        companyName: item.company_name ?? null,
        cnpj: item.cnpj ?? null,
        campaignId: item.campaign_id ?? null,
        templateName: item.template_name ?? null,
        wamid: ev.wamid,
        errorCode: ev.errorCode,
        reason,
      });
      const { blockPhoneAndQuarantine } = await import('./blocklist.server');
      await blockPhoneAndQuarantine({
        phone: item.phone,
        cnpj: item.cnpj ?? null,
        companyId: item.company_id ?? null,
        reason,
        source: 'whatsapp_webhook',
        providerCode: ev.errorCode,
      });
    }
  }

  return result;
}
