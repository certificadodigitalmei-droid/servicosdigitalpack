// Reconciliação server-only: aplica fatos já confirmados no provedor
// aos itens da fila. NUNCA reenvia mensagem.

import {
  canApplyStatus,
  itemStatusForDelivery,
  FINAL_FAILURE_CODES,
  type WaDeliveryStatus,
} from './webhook-logic';

async function admin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin as any;
}

export type DeliveryFact = {
  phone: string;
  status: WaDeliveryStatus | 'sent' | 'delivered' | 'read' | 'failed';
  code?: string | null;
  reason?: string | null;
};

function digits(v: string): string {
  return String(v ?? '').replace(/\D+/g, '');
}

/** Marca como falha técnica os itens travados em "sending" sem resposta da API. */
export async function resolveStuckSendingItems(stuckMs = 15 * 60 * 1000): Promise<number> {
  const db = await admin();
  const cutoff = new Date(Date.now() - stuckMs).toISOString();
  const { data } = await db
    .from('whatsapp_campaign_items')
    .select('id')
    .eq('status', 'sending')
    .is('wamid', null)
    .lt('locked_at', cutoff)
    .limit(500);
  const ids = ((data ?? []) as any[]).map((r) => r.id);
  if (!ids.length) return 0;
  await db
    .from('whatsapp_campaign_items')
    .update({
      status: 'failed',
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: 'Sem resposta da API após o tempo limite — reenvio somente manual.',
      locked_at: null,
      lock_token: null,
    })
    .in('id', ids);
  return ids.length;
}

export async function reconcileDeliveryFacts(facts: DeliveryFact[]): Promise<{
  updated: number;
  notFound: string[];
  finalFailures: number;
  stuckResolved: number;
}> {
  const db = await admin();
  const { auditFinalFailure } = await import('./webhook.server');
  const { blockPhoneAndQuarantine } = await import('./blocklist.server');

  let updated = 0;
  let finalFailures = 0;
  const notFound: string[] = [];

  for (const fact of facts) {
    const phone = digits(fact.phone);
    const { data: items } = await db
      .from('whatsapp_campaign_items')
      .select('id,campaign_id,company_id,company_name,cnpj,phone,template_name,wamid,delivery_status')
      .order('updated_at', { ascending: false })
      .limit(400);

    const item = ((items ?? []) as any[]).find((r) => digits(String(r.phone ?? '')) === phone);
    if (!item) {
      notFound.push(fact.phone);
      continue;
    }

    const status = fact.status as WaDeliveryStatus;
    if (!canApplyStatus(item.delivery_status, status)) continue;

    const code = fact.code ? String(fact.code) : null;
    const finalFailure = status === 'failed' && !!code && FINAL_FAILURE_CODES.has(code);
    const reason = fact.reason ?? [code, status].filter(Boolean).join(' — ');

    const patch: Record<string, unknown> = {
      delivery_status: status,
      status: itemStatusForDelivery(status, finalFailure),
      error_code: code,
      error_title: status === 'failed' ? reason : null,
    };
    if (status === 'delivered') patch['delivered_at'] = new Date().toISOString();
    if (status === 'read') patch['read_at'] = new Date().toISOString();
    if (status === 'failed') {
      patch['failed_at'] = new Date().toISOString();
      patch['error_message'] = reason;
      patch['locked_at'] = null;
      patch['lock_token'] = null;
    }

    await db.from('whatsapp_campaign_items').update(patch).eq('id', item.id);
    updated++;

    if (finalFailure) {
      finalFailures++;
      await auditFinalFailure(db, {
        phone: item.phone ?? null,
        companyId: item.company_id ?? null,
        companyName: item.company_name ?? null,
        cnpj: item.cnpj ?? null,
        campaignId: item.campaign_id ?? null,
        templateName: item.template_name ?? null,
        wamid: item.wamid ?? null,
        errorCode: code,
        reason,
      });
      await blockPhoneAndQuarantine({
        phone: item.phone,
        cnpj: item.cnpj ?? null,
        companyId: item.company_id ?? null,
        reason,
        source: 'whatsapp_reconcile',
        providerCode: code,
      });
    }
  }

  const stuckResolved = await resolveStuckSendingItems();
  return { updated, notFound, finalFailures, stuckResolved };
}
