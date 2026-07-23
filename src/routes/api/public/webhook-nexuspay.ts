import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/webhook-nexuspay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body: any = await request.json();
          const event: string = body.event || body.type || '';
          const tx = body.transaction || body.data || body;
          const transactionId: string | undefined =
            tx?.transaction_id || tx?.id || body?.transaction_id || body?.id;

          const paidEvents = ['deposit_completed', 'payment.confirmed', 'paid', 'deposit.paid'];
          const isPaid =
            paidEvents.includes(event) ||
            tx?.status === 'paid' ||
            tx?.status === 'completed' ||
            tx?.status === 'confirmed';

          if (isPaid && transactionId) {
            const { error } = await supabaseAdmin
              .from('orders')
              .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('external_transaction_id', transactionId);
            if (error) {
              console.error('[webhook-nexuspay] update error', error);
              return new Response('Error updating order', { status: 500 });
            }
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('[webhook-nexuspay] invalid payload', err);
          return new Response('Invalid payload', { status: 400 });
        }
      },
    },
  },
});
