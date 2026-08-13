import { createFileRoute } from '@tanstack/react-router';

// Rede de segurança contra webhooks perdidos: varre pedidos pendentes
// recentes e confirma direto no provedor. Protegido pela anon key.
export const Route = createFileRoute('/api/public/hooks/reconcile-payments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accepted = [
          process.env['SUPABASE_ANON_KEY'],
          process.env['SUPABASE_PUBLISHABLE_KEY'],
        ].filter(Boolean) as string[];
        const provided = request.headers.get('apikey') || '';
        if (accepted.length === 0 || !accepted.includes(provided)) {
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
      GET: async ({ request }) => {
        const u = new URL(request.url);
        if (u.searchParams.get('debug') !== '1') return new Response('OK', { status: 200 });
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: o } = await supabaseAdmin.from('orders').select('id, status, external_transaction_id').neq('status','paid').order('created_at',{ascending:false}).limit(3);
        const { data: g } = await supabaseAdmin.from('payment_gateways').select('api_key, base_url').eq('provider_type','mercadopago').eq('is_active',true).maybeSingle();
        const mp = await import('@/lib/payments/mercadopago.server');
        const { accessToken } = mp.splitMercadoPagoKeys((g as any)?.api_key || '');
        const out: any[] = [];
        for (const row of o ?? []) {
          const r = await fetch(`https://api.mercadopago.com/v1/orders/${(row as any).external_transaction_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const j: any = await r.json().catch(() => null);
          out.push({ id: (row as any).id, http: r.status, status: j?.status, detail: j?.status_detail, pay: j?.transactions?.payments?.map((p: any) => ({ s: p.status, d: p.status_detail })) });
        }
        return Response.json(out);
      },
    },
  },
});
