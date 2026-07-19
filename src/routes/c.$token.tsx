import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/c/$token')({
  loader: async ({ params }) => {
    // 1. Buscar o link pelo token público
    const { data: link, error } = await supabase
      .from('company_links')
      .select('company_id, expires_at')
      .eq('public_token', params.token)
      .single();

    if (error || !link) {
      console.error('Erro ao buscar link:', error);
      throw redirect({ to: '/' });
    }

    // 2. Verificar expiração
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      throw redirect({ to: '/' });
    }

    // 3. Buscar dados da empresa
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('cnpj, nome_titular, data_abertura')
      .eq('id', link.company_id)
      .single();

    if (compError || !company) {
      console.error('Erro ao buscar empresa:', compError);
      throw redirect({ to: '/' });
    }

    // 4. Redirecionar para a home com os parâmetros
    throw redirect({
      to: '/',
      search: {
        cnpj: company.cnpj || '',
        nome: company.nome_titular || '',
        abertura: company.data_abertura || '',
      },
    });
  },
});
