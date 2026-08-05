import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { GovConsultaLoader } from '@/components/GovConsultaLoader';
import { resolveCompanyLink, markLinkLoaderShown, type ResolvedCompany } from '@/lib/company-links.functions';

/**
 * Rota de "acesso" — é o link público que enviamos ao cliente.
 * Todo acesso passa por aqui primeiro. Se alguém abrir /c/$token direto,
 * o loader daquela rota redireciona para cá enquanto a animação não tiver sido exibida.
 * Mobile: exibe a animação e depois vai para /c/$token.
 * Desktop: marca como vista e vai direto para /c/$token, sem animação.
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
      // Desktop: marca como visto (para evitar redirect loop na /c) e redireciona sem animação.
      markLinkLoaderShown({ data: { token } }).catch(() => {});
      navigate({ to: '/c/$token', params: { token }, search: { issuing: undefined }, replace: true });
      return;
    }
    // Mobile: mostra a animação; onFinish marca e redireciona.
    setShowLoader(true);
  }, [token, navigate]);

  const nome = cleanPersonName(row?.nome) || cleanPersonName(row?.razao_social) || undefined;
  const cnpj = row?.cnpj ?? undefined;

  if (!showLoader) {
    // Enquanto decide (SSR/desktop) mantém a tela limpa e clara — sem flash dos dados.
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <GovConsultaLoader
      cnpj={cnpj}
      nome={nome}
      onFinish={() => {
        markLinkLoaderShown({ data: { token } }).catch(() => {});
        navigate({ to: '/c/$token', params: { token }, search: { issuing: undefined }, replace: true });
      }}
    />
  );
}
