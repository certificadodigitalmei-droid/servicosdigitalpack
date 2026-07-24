import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { GovConsultaLoader } from '@/components/GovConsultaLoader';
import { resolveCompanyLink, type ResolvedCompany } from '@/lib/company-links.functions';

/**
 * Rota de "acesso" — é o link público que enviamos ao cliente.
 * Mobile: exibe a animação e depois redireciona para /c/$token.
 * Desktop: pula a animação e vai direto para /c/$token.
 */
export const Route = createFileRoute('/acesso/$token')({
  loader: async ({ params }) => {
    const row = await resolveCompanyLink({ data: { token: params.token } }).catch(() => null);
    return { row };
  },
  component: AcessoPage,
});

function cleanPersonName(v?: string | null): string {
  if (!v) return '';
  return v.replace(/\d+/g, '').replace(/[.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function AcessoPage() {
  const { row } = Route.useLoaderData() as { row: ResolvedCompany | null };
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [showLoader, setShowLoader] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) {
      // Desktop: redireciona imediatamente, sem animação.
      navigate({ to: '/c/$token', params: { token }, replace: true });
      return;
    }
    // Mobile: mostra a animação; onFinish redireciona.
    setShowLoader(true);
  }, [token, navigate]);

  const nome = cleanPersonName(row?.nome) || cleanPersonName(row?.razao_social) || undefined;
  const cnpj = row?.cnpj ?? undefined;

  if (!showLoader) {
    // Enquanto decide (SSR/desktop) mantém a tela limpa e clara.
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <GovConsultaLoader
      cnpj={cnpj}
      nome={nome}
      onFinish={() => navigate({ to: '/c/$token', params: { token }, replace: true })}
    />
  );
}
