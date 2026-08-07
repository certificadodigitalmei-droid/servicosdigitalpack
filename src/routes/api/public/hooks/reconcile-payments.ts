import { createFileRoute } from '@tanstack/react-router';

// Rede de segurança contra webhooks perdidos: varre pedidos pendentes
// recentes e confirma direto no provedor. Protegido pela anon key.
export const Route = createFileRoute('/api/public/hooks/reconcile-payments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env['SUPABASE_ANON_KEY'] || process.env['SUPABASE_PUBLISHABLE_KEY'];
        const provided = request.headers.get('apikey') || '';
        if (!expected || provided !== expected) {
          return new Response('Unauthorized', { status: 401 });
        }
        try {
          const { reconcileRecentPendingOrders } = await import('@/lib/payments/verify.server');
          const result = await reconcileRecentPendingOrders(48);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error('[reconcile-payments] erro', err);
          return Response.json({ ok: false }, { status: 200 });
        }
      },
      GET: async () => new Response('OK', { status: 200 }),
    },
  },
});
