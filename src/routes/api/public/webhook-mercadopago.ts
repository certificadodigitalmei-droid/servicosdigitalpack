import { createFileRoute } from '@tanstack/react-router';

// Webhook do Mercado Pago (Orders API / Checkout Transparente Pix).
// Doc: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
//
// Fica em /api/public/* porque chamadas externas não passam pela autenticação do site.
// Regras:
//  - valida a assinatura secreta (x-signature) quando um segredo estiver configurado;
//  - reconsulta a cobrança na API oficial antes de liberar o conteúdo (fonte da verdade);
//  - só marca como pago quando o pagamento está aprovado;
//  - idempotente: pedidos já pagos não são reprocessados;
//  - responde 200 rapidamente e nunca registra credenciais nem dados do cliente em log.
export const Route = createFileRoute('/api/public/webhook-mercadopago')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const raw = await request.text();
          let body: any = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            body = {};
          }

          const type = String(
            body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '',
          ).toLowerCase();
          const rawId = String(
            body?.data?.id ||
              body?.resource ||
              url.searchParams.get('data.id') ||
              url.searchParams.get('id') ||
              '',
          );
          // `resource` pode vir como URL completa em notificações antigas.
          const dataId = rawId.includes('/') ? rawId.split('/').filter(Boolean).pop()! : rawId;
          if (!dataId) return new Response('OK', { status: 200 });

          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { data: gateway } = await supabaseAdmin
            .from('payment_gateways')
            .select('api_key, base_url, webhook_secret')
            .eq('provider_type', 'mercadopago')
            .eq('is_active', true)
            .maybeSingle();

          if (!gateway) {
            console.warn('[webhook-mercadopago] nenhum gateway Mercado Pago ativo');
            return new Response('OK', { status: 200 });
          }

          const mp = await import('@/lib/payments/mercadopago.server');

          const secret = (gateway as any).webhook_secret || '';
          if (secret) {
            const valid = await mp.verifyMercadoPagoSignature({
              signatureHeader: request.headers.get('x-signature'),
              requestId: request.headers.get('x-request-id'),
              dataId,
              secret,
            });
            if (!valid) {
              console.warn('[webhook-mercadopago] assinatura inválida');
              return new Response('Invalid signature', { status: 401 });
            }
          }

          // Reconsulta obrigatória na API oficial antes de liberar o conteúdo.
          let status = '';
          let externalReference: string | null = null;
          if (dataId.startsWith('ORD')) {
            status = await mp.getMercadoPagoOrderStatus(gateway.api_key, gateway.base_url, dataId);
          } else {
            const res = await mp.getMercadoPagoPaymentStatus(
              gateway.api_key,
              gateway.base_url,
              dataId,
            );
            status = res.status;
            externalReference = res.externalReference;
            if (!status && type.includes('order')) {
              status = await mp.getMercadoPagoOrderStatus(
                gateway.api_key,
                gateway.base_url,
                dataId,
              );
            }
          }

          if (!mp.MERCADOPAGO_APPROVED_STATUSES.includes(status)) {
            console.log('[webhook-mercadopago] evento sem aprovação', { type, status });
            return new Response('OK', { status: 200 });
          }

          const nowIso = new Date().toISOString();
          const patch = { status: 'paid', paid_at: nowIso, updated_at: nowIso } as const;

          // Idempotência: só atualiza pedidos que ainda não estão pagos.
          const { data: byTx } = await supabaseAdmin
            .from('orders')
            .update(patch)
            .eq('external_transaction_id', dataId)
            .neq('status', 'paid')
            .select('id');
          let updated = byTx?.length ?? 0;

          if (updated === 0 && externalReference) {
            const { data: byRef } = await supabaseAdmin
              .from('orders')
              .update(patch)
              .eq('id', externalReference)
              .neq('status', 'paid')
              .select('id');
            updated = byRef?.length ?? 0;
          }

          if (updated === 0) {
            console.log('[webhook-mercadopago] nenhum pedido pendente para atualizar');
          }

          return new Response('OK', { status: 200 });
        } catch (err) {
          console.error('[webhook-mercadopago] erro ao processar notificação:', err);
          // Responde 200 para evitar reenvios infinitos; o erro fica registrado.
          return new Response('OK', { status: 200 });
        }
      },
      GET: async () => new Response('OK', { status: 200 }),
    },
  },
});
