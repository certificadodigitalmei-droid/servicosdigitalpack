import { createFileRoute } from '@tanstack/react-router';

// Link curto para SMS/planilha: /s/abc12345 -> site normal /acesso/abc12345
// Funciona em qualquer domínio (incl. www.meu-pj-mei.online) e leva sempre
// para o domínio normal do site.
export const Route = createFileRoute('/s/$code')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = String(params.code || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
        const { ensurePublicBaseUrl } = await import('@/lib/public-base-url.server');
        const base = (await ensurePublicBaseUrl()).replace(/\/+$/, '');
        const url = new URL(`/acesso/${code}`, base);
        return new Response(null, {
          status: 302,
          headers: { Location: url.toString(), 'Cache-Control': 'no-store' },
        });
      },
    },
  },
});
