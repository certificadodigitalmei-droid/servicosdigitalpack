import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Webhook de pagamentos da SigiloPay.
// Doc: https://app.sigilopay.com.br/docs/webhooks/payment
// Eventos relevantes: TRANSACTION_PAID, TRANSACTION_CANCELED, TRANSACTION_REFUNDED, TRANSACTION_CHARGED_BACK
export const Route = createFileRoute('/api/public/webhook-sigilopay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body: any = await request.json();
          // Log básico para debug (sem dados sensíveis)
          console.log('[webhook-sigilopay] payload recebido:', JSON.stringify({
            event: body?.event,
            status: body?.transaction?.status || body?.status,
            identifier: body?.transaction?.identifier || body?.identifier
          }));

          const event = String(body?.event || '').toUpperCase();
          const transaction = body?.transaction ?? {};
          const status = String(transaction?.status || body?.status || '').toUpperCase();

          // Mapeamento de eventos da SigiloPay para o status 'paid'
          // Suporta eventos de transação paga, concluída ou transferência concluída
          const isPaidEvent = 
            event === 'TRANSACTION_PAID' || 
            event === 'TRANSACTION_COMPLETED' ||
            event === 'TRANSFER_COMPLETED' ||
            status === 'PAID' || 
            status === 'OK' ||
            status === 'COMPLETED';

          if (!isPaidEvent) {
            return new Response('OK', { status: 200 });
          }

          const transactionId: string | undefined =
            transaction?.id || body?.transactionId || body?.transaction_id;
          const identifier: string | undefined =
            transaction?.identifier || body?.identifier;

          if (!transactionId && !identifier) {
            console.warn('[webhook-sigilopay] payload sem identificadores', body);
            return new Response('OK', { status: 200 });
          }

          const nowIso = new Date().toISOString();
          const patch = { status: 'paid', paid_at: nowIso, updated_at: nowIso } as const;

          let updated = 0;
          const paidIds: string[] = [];

          // Identifier é o order.id que geramos ao criar a cobrança.
          if (identifier) {
            const { data } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('id', identifier)
              .select('id');
            updated = data?.length ?? 0;
            for (const row of data ?? []) paidIds.push(row.id);
          }

          if (updated === 0 && transactionId) {
            const { data } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('external_transaction_id', transactionId)
              .select('id');
            updated = data?.length ?? 0;
            for (const row of data ?? []) paidIds.push(row.id);
          }

          if (updated === 0) {
            console.warn('[webhook-sigilopay] nenhum pedido encontrado', { transactionId, identifier });
          } else {
            const { sendPaidEmail } = await import('@/lib/emails/order-emails.server');
            for (const id of paidIds) await sendPaidEmail(id);
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('[webhook-sigilopay] error:', err);
          return new Response('Invalid payload', { status: 400 });
        }
      },
    },
  },
});
