import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const CORS = {
  'Access-Control-Allow-Origin': 'https://web.whatsapp.com',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Extension-Token',
  'Access-Control-Max-Age': '86400',
};

export const Route = createFileRoute('/api/public/whatsapp/next')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get('token') || request.headers.get('x-extension-token') || '';
        if (!token) return new Response(JSON.stringify({ error: 'missing_token' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
        const { data, error } = await supabaseAdmin.rpc('wq_claim_next', { _token: token });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
        const row = Array.isArray(data) ? data[0] : null;
        if (!row) return new Response(JSON.stringify({ empty: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
        return new Response(JSON.stringify({ item: row }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
      },
    },
  },
});
