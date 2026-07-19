import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/c/$token')({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .rpc('resolve_company_link', { _token: params.token })
      .maybeSingle();

    if (error || !data) {
      throw redirect({ to: '/' });
    }

    const row = data as { cnpj: string | null; nome: string | null; abertura: string | null };

    throw redirect({
      to: '/',
      search: {
        cnpj: row.cnpj || '',
        nome: row.nome || '',
        abertura: row.abertura || '',
      },
    });
  },
});
