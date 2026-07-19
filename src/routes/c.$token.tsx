import { createFileRoute, redirect } from '@tanstack/react-router';
import { resolveCompanyLink } from '@/lib/company-links.functions';

export const Route = createFileRoute('/c/$token')({
  loader: async ({ params }) => {
    const row = await resolveCompanyLink({ data: { token: params.token } });
    if (!row) throw redirect({ to: '/' });
    throw redirect({
      to: '/',
      search: { cnpj: row.cnpj, nome: row.nome, abertura: row.abertura },
    });
  },
});
