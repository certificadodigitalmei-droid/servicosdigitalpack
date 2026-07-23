import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/webhook-nexuspay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        let raw = '';
        try {
          raw = await request.text();
        } catch {
          raw = '';
        }
        let body: any = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = { _raw: raw };
        }

        // Sempre registra o evento recebido para auditoria/diagnóstico
        try {
          await supabaseAdmin.from('webhook_events').insert({
            provider: 'nexuspay',
            external_event_id: body?.id || body?.event_id || null,
            payload: body,
            processing_status: 'received',
          });
        } catch (logErr) {
          console.error('[webhook-nexuspay] failed to log event', logErr);
        }

        try {
          const event: string = String(body.event || body.type || '').toLowerCase();
          const tx = body.transaction || body.data || body;
          const transactionId: string | undefined =
            tx?.transaction_id || tx?.id || body?.transaction_id || body?.id;
          const status = String(tx?.status || body?.status || '').toLowerCase();

          const paidEvents = [
            'deposit_completed',
            'deposit.completed',
            'payment.confirmed',
            'payment_confirmed',
            'paid',
            'deposit.paid',
            'deposit_paid',
          ];
          const paidStatuses = ['paid', 'completed', 'confirmed', 'approved', 'success'];
          const isPaid = paidEvents.includes(event) || paidStatuses.includes(status);

          if (isPaid && transactionId) {
            const { error } = await supabaseAdmin
              .from('orders')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('external_transaction_id', transactionId);
            if (error) {
              console.error('[webhook-nexuspay] update error', error);
              await supabaseAdmin
                .from('webhook_events')
                .update({ processing_status: 'error', processed_at: new Date().toISOString() })
                .eq('payload->>id', String(body?.id ?? ''));
              return new Response('Error updating order', { status: 500 });
            }
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('[webhook-nexuspay] handler error', err);
          return new Response('Invalid payload', { status: 400 });
        }
      },
    },
  },
});
