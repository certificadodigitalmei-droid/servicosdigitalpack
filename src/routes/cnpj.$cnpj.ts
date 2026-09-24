import { createFileRoute } from '@tanstack/react-router';

// Link curto por CNPJ: /cnpj/12345678000199 -> site normal /acesso/{token}
// Funciona em qualquer domínio (incl. www.portal-meu-mei.site) e leva sempre
// para o domínio normal do site.
export const Route = createFileRoute('/cnpj/$cnpj')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const cnpj = String(params.cnpj || '').replace(/\D/g, '').slice(0, 14);
        const { ensurePublicBaseUrl } = await import('@/lib/public-base-url.server');
        const base = (await ensurePublicBaseUrl()).replace(/\/+$/, '');

        if (cnpj.length !== 14) {
          return new Response(null, { status: 302, headers: { Location: base, 'Cache-Control': 'no-store' } });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const db = supabaseAdmin as any;
        // Aceita o CNPJ salvo com ou sem pontuação.
        const fmt = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
        const { data: company } = await db
          .from('companies')
          .select('id')
          .or(`cnpj.eq.${cnpj},cnpj.eq.${fmt}`)
          .limit(1)
          .maybeSingle();

        let target = base;
        if (company?.id) {
          const { data: link } = await db
            .from('company_links')
            .select('public_token')
            .eq('company_id', company.id)
            .eq('active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (link?.public_token) {
            const { shortToken } = await import('@/lib/short-token');
            target = `${base}/acesso/${shortToken(String(link.public_token))}`;
          }
        }

        return new Response(null, {
          status: 302,
          headers: { Location: target, 'Cache-Control': 'no-store' },
        });
      },
    },
  },
});
