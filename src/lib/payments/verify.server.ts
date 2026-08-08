// Fonte única de verdade para confirmar pagamentos junto ao Mercado Pago.
// Usada pela página do link (/c/:token), pelo modal do PIX, pela aba
// Pagamentos e pelo cron de reconciliação — assim nenhuma cópia da lógica
// fica desatualizada e um webhook perdido nunca deixa o cliente "pendente".

const PAID_STATUSES = [
  'paid',
  'approved',
  'processed',
  'accredited',
];

export type VerifyResult = {
  paid: boolean;
  paid_at: string | null;
  status: string;
  remote?: string | null;
};

/** Busca a conta Mercado Pago ativa. */
async function getGateway() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('payment_gateways')
    .select('api_key, base_url, provider_type')
    .eq('provider_type', 'mercadopago')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Consulta o status remoto de uma cobrança no Mercado Pago. */
export async function fetchRemoteStatus(
  apiKey: string,
  baseUrl: string | null | undefined,
  transactionId: string,
): Promise<string | null> {
  try {
    const mp = await import('@/lib/payments/mercadopago.server');
    if (transactionId.startsWith('ORD')) {
      return (await mp.getMercadoPagoOrderStatus(apiKey, baseUrl, transactionId)) || null;
    }
    const res = await mp.getMercadoPagoPaymentStatus(apiKey, baseUrl, transactionId);
    return res.status || null;
  } catch (err) {
    console.error('[verify] erro ao consultar o Mercado Pago', err);
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

  // E-mail de confirmação de pagamento foi descontinuado por decisão do produto.
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

  const gateway = await getGateway();
  if (!gateway) return { paid: false, paid_at: null, status: order.status };

  const remote = await fetchRemoteStatus(
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

/**
 * Varre pedidos pendentes recentes e confirma cada um no provedor.
 * Usada pela aba Pagamentos e pelo cron de reconciliação.
 */
export async function reconcileRecentPendingOrders(
  hours = 48,
): Promise<{ checked: number; updated: number }> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: pending } = await supabaseAdmin
    .from('orders')
    .select('id')
    .in('status', ['pending', 'awaiting_payment'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  let updated = 0;
  for (const row of pending ?? []) {
    const res = await verifyAndSettleOrder(row.id);
    if (res.paid) updated++;
  }
  return { checked: pending?.length ?? 0, updated };
}
