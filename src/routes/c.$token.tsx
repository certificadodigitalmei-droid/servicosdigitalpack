import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/c/$token')({
  loader: async ({ params }) => {
    const { data: link, error } = await supabase
      .from('company_links')
      .select('company_id, expires_at')
      .eq('public_token', params.token)
      .single();

    if (error || !link) {
      throw redirect({ to: '/' });
    }

    if (link.expires_at) {
      const exp = link.expires_at as any;
      if (new Date(exp).getTime() < Date.now()) {
        throw redirect({ to: '/' });
      }
    }

    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('cnpj, nome_titular_exibicao, inicio_atividade')
      .eq('id', link.company_id)
      .single();

    if (compError || !company) {
      throw redirect({ to: '/' });
    }

    const searchParams = {
      cnpj: (company as any).cnpj || '',
      nome: (company as any).nome_titular_exibicao || '',
      abertura: (company as any).inicio_atividade || '',
    };

    throw redirect({
      to: '/',
      search: searchParams,
    });
  },
});
