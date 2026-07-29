import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const CORS = {
  'Access-Control-Allow-Origin': 'https://web.whatsapp.com',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Extension-Token',
  'Access-Control-Max-Age': '86400',
};

export const Route = createFileRoute('/api/public/whatsapp/report')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = request.headers.get('x-extension-token') || '';
        if (!token) return new Response(JSON.stringify({ error: 'missing_token' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
        let body: any = {};
        try { body = await request.json(); } catch { /* noop */ }
        const id = String(body?.id || '');
        const status = String(body?.status || '');
        const err = body?.error ? String(body.error).slice(0, 500) : null;
        if (!id || !['sent', 'failed', 'skipped'].includes(status)) {
          return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
        }
        const { error } = await supabaseAdmin.rpc('wq_report', { _token: token, _id: id, _status: status, _error: err });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
      },
    },
  },
});
