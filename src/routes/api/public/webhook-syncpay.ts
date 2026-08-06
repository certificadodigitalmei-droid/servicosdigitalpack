import { createFileRoute } from '@tanstack/react-router';

// Webhook de pagamentos da SyncPay (Cashin OnCreate/OnUpdate).
// A SyncPay envia o tipo do evento no cabeçalho `event` (ex.: cashin.update)
// e o corpo em { data: { id, status, ... } }.
// Marcamos o pedido como pago quando status = "completed".
// Nenhum dado do cliente recebido aqui é armazenado ou registrado em log.
export const Route = createFileRoute('/api/public/webhook-syncpay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body: any = await request.json();
          const data = body?.data ?? body ?? {};

          const event = String(
            request.headers.get('event') || body?.event || body?.type || '',
          ).toLowerCase();
          const status = String(data?.status || body?.status || '').toLowerCase();

          console.log('[webhook-syncpay] evento:', JSON.stringify({ event, status }));

          const isCashin = event === '' || event.startsWith('cashin');
          if (!isCashin || status !== 'completed') {
            return new Response('OK', { status: 200 });
          }

          const transactionId = data?.id ? String(data.id) : '';
          if (!transactionId) {
            console.warn('[webhook-syncpay] payload sem identificador');
            return new Response('OK', { status: 200 });
          }

          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const nowIso = new Date().toISOString();
          const patch = { status: 'paid', paid_at: nowIso, updated_at: nowIso } as const;

          const { data: rows } = await supabaseAdmin
            .from('orders')
            .update(patch)
            .eq('external_transaction_id', transactionId)
            .select('id');

          if (!rows?.length) {
            console.warn('[webhook-syncpay] nenhum pedido para a transação informada');
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('[webhook-syncpay] error:', err);
          return new Response('Invalid payload', { status: 400 });
        }
      },
    },
  },
});
