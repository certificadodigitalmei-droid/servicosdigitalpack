import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const resolveCompanyLink = createServerFn({ method: 'GET' })
  .inputValidator((data) => z.object({ token: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: row, error } = await supabaseAdmin
      .rpc('resolve_company_link', { _token: data.token })
      .maybeSingle();
    if (error || !row) return null;
    const r = row as { cnpj: string | null; nome: string | null; abertura: string | null };
    return { cnpj: r.cnpj ?? '', nome: r.nome ?? '', abertura: r.abertura ?? '' };
  });
