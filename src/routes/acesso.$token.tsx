import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { GovConsultaLoader } from '@/components/GovConsultaLoader';
import { resolveCompanyLink, markLinkLoaderShown, type ResolvedCompany } from '@/lib/company-links.functions';
import { markIntroSeen, prefersReducedMotion, shouldPlayIntro, hasSeenIntro } from '@/lib/intro-animation';

/**
 * Rota de "acesso" — é o link público enviado por e-mail.
 * Exibe a animação de consulta e depois entra em /c/$token.
 * A entrada direta em /c/$token roda a mesma animação por conta própria;
 * aqui marcamos a sessão para o cliente nunca ver duas vezes seguidas.
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

  const goToPage = () => {
    markIntroSeen(typeof window !== 'undefined' ? window.sessionStorage : null, token);
    markLinkLoaderShown({ data: { token } }).catch(() => {});
    navigate({ to: '/c/$token', params: { token }, search: { issuing: undefined, unsubscribe: undefined }, replace: true });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const play = shouldPlayIntro({
      seen: hasSeenIntro(window.sessionStorage, token),
      reducedMotion: prefersReducedMotion(window),
    });
    if (!play) {
      goToPage();
      return;
    }
    setShowLoader(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const nome = cleanPersonName(row?.nome) || cleanPersonName(row?.razao_social) || undefined;
  const cnpj = row?.cnpj ?? undefined;

  if (!showLoader) {
    // Enquanto decide (SSR/hidratação) mantém a tela limpa — sem flash dos dados.
    return <div className="min-h-screen bg-white" />;
  }

  return <GovConsultaLoader cnpj={cnpj} nome={nome} onFinish={goToPage} />;
}

