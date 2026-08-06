import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Webhook de pagamentos da SyncPay.
// Evento relevante: event = "cashin.update" com status = "completed".
export const Route = createFileRoute('/api/public/webhook-syncpay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body: any = await request.json();
          const data = body?.data ?? body?.transaction ?? body ?? {};

          const event = String(body?.event || body?.type || '').toLowerCase();
          const status = String(data?.status || body?.status || '').toLowerCase();

          console.log('[webhook-syncpay] evento recebido:', JSON.stringify({ event, status }));

          const isPaid =
            (event === 'cashin.update' || event === '' || event.startsWith('cashin')) &&
            (status === 'completed' || status === 'paid');

          if (!isPaid) return new Response('OK', { status: 200 });

          const transactionId: string | undefined =
            data?.id || data?.transaction_id || body?.id ? String(data?.id || data?.transaction_id || body?.id) : undefined;
          const identifier: string | undefined =
            data?.external_id || data?.identifier || body?.external_id;

          if (!transactionId && !identifier) {
            console.warn('[webhook-syncpay] payload sem identificadores');
            return new Response('OK', { status: 200 });
          }

          const nowIso = new Date().toISOString();
          const patch = { status: 'paid', paid_at: nowIso, updated_at: nowIso } as const;

          let updated = 0;
          if (identifier) {
            const { data: rows } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('id', identifier)
              .select('id');
            updated = rows?.length ?? 0;
          }

          if (updated === 0 && transactionId) {
            const { data: rows } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('external_transaction_id', transactionId)
              .select('id');
            updated = rows?.length ?? 0;
          }

          if (updated === 0) {
            console.warn('[webhook-syncpay] nenhum pedido encontrado', { transactionId, identifier });
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
