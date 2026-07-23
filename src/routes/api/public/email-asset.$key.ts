import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/email-asset/$key')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params.key;
        if (!key || key.includes('/') || key.includes('..')) {
          return new Response('Bad key', { status: 400 });
        }
        const { data, error } = await supabaseAdmin.storage.from('email-assets').download(key);
        if (error || !data) return new Response('Not found', { status: 404 });
        const ext = key.split('.').pop()?.toLowerCase() || '';
        const type =
          ext === 'png' ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'gif' ? 'image/gif'
          : ext === 'webp' ? 'image/webp'
          : ext === 'svg' ? 'image/svg+xml'
          : (data as Blob).type || 'application/octet-stream';
        const buf = await (data as Blob).arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            'content-type': type,
            'cache-control': 'public, max-age=31536000, immutable',
            'access-control-allow-origin': '*',
          },
        });
      },
    },
  },
});
