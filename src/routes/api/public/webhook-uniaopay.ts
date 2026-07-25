import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/webhook-uniaopay')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const apiKey = request.headers.get('x-api-key');

          // Validação básica se necessário ou verificação de assinatura
          // Aqui assumimos que o UniaoPay envia o payload conforme especificado
          if (body.event === 'payment.confirmed') {
            const { transaction } = body;
            const orderId = transaction.external_id;

            if (orderId) {
              // Atualiza o status do pedido para 'paid'
              const nowIso = new Date().toISOString();
              const { error } = await supabaseAdmin
                .from('orders')
                .update({ status: 'paid', paid_at: nowIso, updated_at: nowIso })
                .eq('id', orderId);

              if (error) {
                console.error('Erro ao atualizar pedido no webhook:', error);
                return new Response('Error updating order', { status: 500 });
              }
            }
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('Webhook error:', err);
          return new Response('Invalid payload', { status: 400 });
        }
      }
    }
  }
});
