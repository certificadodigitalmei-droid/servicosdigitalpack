import { createFileRoute } from '@tanstack/react-router';

// Link curto para SMS: /s/abc12345 -> /acesso/abc12345
export const Route = createFileRoute('/s/$code')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = String(params.code || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
        const url = new URL(`/acesso/${code}`, request.url);
        return new Response(null, { status: 302, headers: { Location: url.toString() } });
      },
    },
  },
});
