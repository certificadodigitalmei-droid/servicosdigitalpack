import { createFileRoute } from '@tanstack/react-router';

/**
 * MODO MANUAL.
 *
 * O fluxo (consulta -> importação -> links -> envio) roda exclusivamente pelo
 * painel, através do "Motor do fluxo" (aba Envio em Massa). Este endpoint de
 * automação em nuvem fica desativado para nunca concorrer com o motor manual
 * e desincronizar o funil.
 */
export const Route = createFileRoute('/api/public/hooks/full-automation')({
  server: {
    handlers: {
      POST: async () =>
        new Response(JSON.stringify({ skipped: 'manual_mode' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
  },
});
