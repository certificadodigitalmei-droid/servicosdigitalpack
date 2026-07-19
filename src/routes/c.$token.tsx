import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Info, FileCheck2, Lock, User } from 'lucide-react';
import { SiteHeader, Breadcrumb, SiteFooter, Page } from '@/components/layout/SiteChrome';
import { trackEvent } from '@/lib/track';
import { formatCNPJ, formatDateBR } from '@/lib/format';
import { resolveCompanyLink, type ResolvedCompany } from '@/lib/company-links.functions';

export const Route = createFileRoute('/c/$token')({
  loader: async ({ params }) => {
    const row = await resolveCompanyLink({ data: { token: params.token } });
    if (!row) throw notFound();
    return { row };
  },
  head: () => ({
    meta: [
      { title: 'Portal do Empreendedor — Certificado Digital MEI' },
      { name: 'description', content: 'Portal do Empreendedor — Certificado Digital MEI' },
    ],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: () => <ErrorPage />,
  component: TokenHomePage,
});

function cleanPersonName(v?: string | null): string {
  if (!v) return '';
  // remove digits and collapse whitespace
  return v.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
}

function TokenHomePage() {
  const { row } = Route.useLoaderData() as { row: ResolvedCompany };
  const { token } = Route.useParams();
  const nomeFmt = cleanPersonName(row.nome) || cleanPersonName(row.razao_social) || '—';
  const cnpjFmt = row.cnpj ? formatCNPJ(row.cnpj) : '—';
  const aberturaFmt = row.abertura ? formatDateBR(row.abertura) : '—';

  useEffect(() => {
    trackEvent(token, 'view_link');
  }, [token]);


  return (
    <Page>
      <SiteHeader userName={nomeFmt !== '—' ? nomeFmt : undefined} userDoc={row.cnpj ?? undefined} />
      <Breadcrumb items={[{ label: 'Empresas & Negócios' }, { label: 'Empreendedor' }]} />


      <main className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-3.5 py-6 space-y-4 sm:px-4">
          <div className="flex gap-3 rounded-md border border-[#ffeeba] border-l-4 border-l-[#ffc107] bg-[#fcf4d4] p-4 text-[13px] shadow-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#856404]" />
            <div className="leading-relaxed text-[#856404]">
              <p>
                Seu MEI possui o <span className="font-bold">Certificado Digital 2026 pendente</span>. Sem a emissão, seu CNPJ pode ser bloqueado para emissão de notas fiscais e acesso a crédito. <span className="font-bold underline cursor-pointer">Regularize agora.</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-md border border-border border-l-4 border-l-[#004884] bg-card p-4 shadow-sm">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0f5ff] text-[#004884]">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-[#004884]">Cadastro localizado com sucesso</div>
              <div className="text-[13px] text-muted-foreground">
                Confira os dados do seu MEI e prossiga para a emissão do certificado digital.
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="bg-[#f8f9fa] border-b border-border px-4 py-2.5 text-[14px] font-bold text-[#004884] uppercase tracking-tight">
              Dados do Microempreendedor Individual
            </div>
            <DataRow label="CNPJ" value={cnpjFmt} />
            <DataRow label="TITULAR" value={nomeFmt} />
            <DataRow label="DATA DE ABERTURA" value={aberturaFmt} />

            {(row.municipio || row.uf) && (
              <DataRow label="MUNICÍPIO / UF" value={`${row.municipio ?? '—'} / ${row.uf ?? '—'}`} />
            )}
            <DataRow
              label="SITUAÇÃO CADASTRAL"
              value={
                <span className="inline-flex items-center rounded-sm bg-[#138835] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  {row.situacao || 'Ativa'}
                </span>
              }
            />
            <DataRow label="TIPO" value="Microempreendedor Individual" last />
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Progresso da contratação</span>
              <span className="font-semibold text-[#004884]">Etapa 2 de 3 — quase lá</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[65%] rounded-full bg-[#004884]" />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-1 text-[#138835]"><span className="text-[8px]">●</span> Identificação</span>
              <span className="flex items-center gap-1 text-[#138835]"><span className="text-[8px]">●</span> Dados confirmados</span>
              <span className="flex items-center gap-1 text-[#004884]"><span className="text-[8px]">●</span> Emitir certificado</span>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-0 overflow-hidden shadow-sm">
            <div className="flex items-start gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#f0f5ff] text-[#004884]">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold text-[#004884] leading-snug">
                  Certificado Digital MEI — Emissão Obrigatória 2026
                </div>
                <p className="mt-1.5 text-[13px] text-foreground/90 leading-relaxed">
                  Seu CNPJ foi localizado e está <span className="font-bold">aguardando a emissão do certificado</span>. Prossiga agora para regularizar e receber seu certificado digital.
                </p>
              </div>
            </div>
            <div className="bg-[#f8f9fa] border-t border-border p-4 flex justify-center">
              <Link
                to="/checkout/$token"
                params={{ token }}
                onClick={() => trackEvent(token, 'click_certificado')}
                className="inline-flex min-h-[44px] w-full max-w-[280px] items-center justify-center gap-2 rounded-md bg-[#1351b4] px-6 text-[13px] font-bold uppercase tracking-wide text-white transition-all hover:bg-[#004884] active:scale-[0.98]"
              >
                <Lock className="h-4 w-4" />
                Emitir Certificado Digital
              </Link>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-md border border-border bg-muted/40 p-4 text-left text-[12.5px] text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <p>
              MEIs sem o Certificado Digital 2026 podem ter restrições na emissão de notas fiscais e no acesso a linhas de crédito para microempreendedores.
            </p>
          </div>

          <div className="pt-4 text-center text-[10.5px] text-muted-foreground/60">
            CadastroMEI é um serviço de apoio ao MEI e não possui vínculo com o Governo Federal. O uso é opcional e complementar às orientações oficiais.
          </div>
        </div>
      </main>

      <SiteFooter />
    </Page>
  );
}

function DataRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? 'px-4 py-3' : 'border-b border-border px-4 py-3'}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[14px] text-foreground">{value}</div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <Page>
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">Link não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">O link informado é inválido ou expirou.</p>
        </div>
      </main>
      <SiteFooter />
    </Page>
  );
}

function ErrorPage() {
  return (
    <Page>
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">Erro ao carregar</h1>
          <p className="mt-2 text-sm text-muted-foreground">Tente novamente em instantes.</p>
        </div>
      </main>
      <SiteFooter />
    </Page>
  );
}
