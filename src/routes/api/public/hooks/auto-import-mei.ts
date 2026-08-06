// DESATIVADO.
//
// Este endpoint importava empresas em paralelo, SEM respeitar a trava do
// pipeline — era a causa de importar muito mais do que se conseguia enviar
// (links gerados >> e-mails enviados).
//
// A importação agora acontece exclusivamente em
// `/api/public/hooks/full-automation`, que só importa um novo lote quando a
// fila de envio está zerada.
//
// Mantemos a rota respondendo 200 para não quebrar agendamentos existentes.

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/hooks/auto-import-mei')({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            disabled: true,
            reason: 'Importação centralizada em /api/public/hooks/full-automation',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    },
  },
});
