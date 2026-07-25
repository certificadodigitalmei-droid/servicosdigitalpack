import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/webhook-uniaopay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();

          // Novo formato: { event: "PAYMENT_CONFIRMED", transaction_id, status: "PAID", ... }
          // Formato antigo (compat): { event: "payment.confirmed", transaction: { external_id, id } }
          const event = String(body?.event || '').toUpperCase();
          const isPaid =
            event === 'PAYMENT_CONFIRMED' ||
            event === 'PAYMENT.CONFIRMED' ||
            String(body?.status || '').toUpperCase() === 'PAID';

          if (!isPaid) {
            return new Response('OK', { status: 200 });
          }

          const transactionId: string | undefined =
            body?.transaction_id || body?.transaction?.id || body?.id;
          const externalId: string | undefined =
            body?.external_id || body?.transaction?.external_id;

          if (!transactionId && !externalId) {
            console.warn('[webhook-uniaopay] payload sem identificadores', body);
            return new Response('OK', { status: 200 });
          }

          const nowIso = new Date().toISOString();
          const patch = { status: 'paid', paid_at: nowIso, updated_at: nowIso } as const;

          let updated = 0;
          if (externalId) {
            const { data, error } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('id', externalId)
              .select('id');
            if (error) {
              console.error('[webhook-uniaopay] update by external_id falhou', error);
            }
            updated = data?.length ?? 0;
          }
          if (updated === 0 && transactionId) {
            const { data, error } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('external_transaction_id', transactionId)
              .select('id');
            if (error) {
              console.error('[webhook-uniaopay] update by transaction_id falhou', error);
              return new Response('Error updating order', { status: 500 });
            }
            updated = data?.length ?? 0;
          }

          if (updated === 0) {
            console.warn('[webhook-uniaopay] nenhum pedido encontrado', { transactionId, externalId });
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('Webhook error:', err);
          return new Response('Invalid payload', { status: 400 });
        }
      },
    },
  },
});
