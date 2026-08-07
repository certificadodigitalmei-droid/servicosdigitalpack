// Fonte única de verdade para confirmar pagamentos junto ao provedor.
// Usada pela página do link (/c/:token), pelo modal do PIX, pela aba
// Pagamentos e pelo cron de reconciliação — assim nenhuma cópia da lógica
// fica desatualizada e um webhook perdido nunca deixa o cliente "pendente".

const SIGILOPAY_DEFAULT_BASE = 'https://app.sigilopay.com.br/api/v1';

const PAID_STATUSES = [
  'paid',
  'ok',
  'completed',
  'confirmed',
  'approved',
  'success',
  // Mercado Pago (Orders API)
  'processed',
  'accredited',
];

function splitKeys(apiKey: string): { publicKey: string; secretKey: string } {
  const [publicKey = '', secretKey = ''] = (apiKey || '').split('|');
  return { publicKey: publicKey.trim(), secretKey: secretKey.trim() };
}

async function fetchSigiloStatus(
  apiKey: string,
  baseUrl: string | null | undefined,
  txId: string,
): Promise<string | null> {
  const { publicKey, secretKey } = splitKeys(apiKey);
  if (!publicKey || !secretKey) return null;
  const base = (baseUrl || SIGILOPAY_DEFAULT_BASE).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/transactions?id=${encodeURIComponent(txId)}`, {
      headers: { 'x-public-key': publicKey, 'x-secret-key': secretKey },
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const raw = json?.transaction?.status ?? json?.data?.status ?? json?.status ?? null;
    return typeof raw === 'string' ? raw.toLowerCase() : null;
  } catch (err) {
    console.error('[verify] sigilopay fetch error', err);
    return null;
  }
}

export type VerifyResult = {
  paid: boolean;
  paid_at: string | null;
  status: string;
  remote?: string | null;
};

/** Busca o gateway do provedor do pedido (nunca "qualquer gateway ativo"). */
async function getGateway(providerType: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('payment_gateways')
    .select('api_key, base_url, provider_type')
    .eq('provider_type', providerType)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data;
  const { data: fallback } = await supabaseAdmin
    .from('payment_gateways')
    .select('api_key, base_url, provider_type')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return fallback ?? null;
}

/** Consulta o status remoto de uma cobrança conforme o provedor. */
export async function fetchRemoteStatus(
  providerType: string,
  apiKey: string,
  baseUrl: string | null | undefined,
  transactionId: string,
): Promise<string | null> {
  try {
    if (providerType === 'mercadopago') {
      const mp = await import('@/lib/payments/mercadopago.server');
      if (transactionId.startsWith('ORD')) {
        return (await mp.getMercadoPagoOrderStatus(apiKey, baseUrl, transactionId)) || null;
      }
      const res = await mp.getMercadoPagoPaymentStatus(apiKey, baseUrl, transactionId);
      return res.status || null;
    }
    if (providerType === 'syncpay') {
      const { getSyncPayTransactionStatus } = await import('@/lib/payments/syncpay.server');
      return await getSyncPayTransactionStatus(apiKey, baseUrl, transactionId);
    }
    return await fetchSigiloStatus(apiKey, baseUrl, transactionId);
  } catch (err) {
    console.error('[verify] erro ao consultar provedor', providerType, err);
    return null;
  }
}

export function isPaidStatus(remote: string | null | undefined): boolean {
  return !!remote && PAID_STATUSES.includes(remote.toLowerCase());
}

/**
 * Marca o pedido como pago (idempotente) e dispara o e-mail de confirmação
 * apenas quando o pedido realmente transicionou de pendente -> pago.
 */
export async function settleOrderPaid(orderId: string, paidAtIso?: string): Promise<string> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const nowIso = paidAtIso || new Date().toISOString();
  const { data: updated } = await supabaseAdmin
    .from('orders')
    .update({ status: 'paid', paid_at: nowIso, updated_at: nowIso })
    .eq('id', orderId)
    .neq('status', 'paid')
    .select('id');

  if (updated && updated.length > 0) {
    try {
      const { sendPaidEmail } = await import('@/lib/emails/order-emails.server');
      await sendPaidEmail(orderId);
    } catch (err) {
      console.error('[verify] falha ao enviar e-mail de pagamento confirmado', err);
    }
  }
  return nowIso;
}

/**
 * Reconsulta o provedor para um pedido e liquida quando aprovado.
 * Nunca lança: falha de rede simplesmente devolve o status atual.
 */
export async function verifyAndSettleOrder(orderId: string): Promise<VerifyResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, status, paid_at, payment_provider, external_transaction_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return { paid: false, paid_at: null, status: 'not_found' };
  if (order.status === 'paid') {
    return { paid: true, paid_at: order.paid_at, status: 'paid' };
  }
  if (!order.external_transaction_id) {
    return { paid: false, paid_at: null, status: order.status };
  }

  const providerType = (order.payment_provider || 'sigilopay') as string;
  const gateway = await getGateway(providerType);
  if (!gateway) return { paid: false, paid_at: null, status: order.status };

  const remote = await fetchRemoteStatus(
    providerType,
    gateway.api_key,
    gateway.base_url,
    order.external_transaction_id,
  );

  if (isPaidStatus(remote)) {
    const paidAt = await settleOrderPaid(order.id);
    return { paid: true, paid_at: paidAt, status: 'paid', remote };
  }

  return { paid: false, paid_at: null, status: order.status, remote };
}

/**
 * Verifica o pagamento a partir do token público do link da empresa.
 * Usada pela página /c/:token para nunca depender só do webhook.
 */
export async function verifyLinkPayment(token: string): Promise<VerifyResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: link } = await supabaseAdmin
    .from('company_links')
    .select('id')
    .eq('public_token', token)
    .maybeSingle();
  if (!link) return { paid: false, paid_at: null, status: 'not_found' };

  const { data: paidOrder } = await supabaseAdmin
    .from('orders')
    .select('paid_at')
    .eq('public_link_id', link.id)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paidOrder?.paid_at) return { paid: true, paid_at: paidOrder.paid_at, status: 'paid' };

  // Sem pedido pago localmente: reconsulta os pendentes recentes no provedor.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pending } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('public_link_id', link.id)
    .in('status', ['pending', 'awaiting_payment'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3);

  for (const row of pending ?? []) {
    const res = await verifyAndSettleOrder(row.id);
    if (res.paid) return res;
  }

  return { paid: false, paid_at: null, status: 'pending' };
}
