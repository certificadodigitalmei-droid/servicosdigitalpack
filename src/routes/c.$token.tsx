import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Info, FileCheck2, Lock, User, CheckCircle2, BadgeCheck, CalendarCheck, CalendarClock, Loader2, ShieldCheck } from 'lucide-react';


import { CertificatePopup } from '@/components/CertificatePopup';
import { SiteHeader, Breadcrumb, SiteFooter, Page } from '@/components/layout/SiteChrome';
import { trackEvent } from '@/lib/track';
import { formatCNPJ, formatDateBR } from '@/lib/format';
import { resolveCompanyLink, getLinkPaymentStatus, type ResolvedCompany } from '@/lib/company-links.functions';
import { getSitePopup, type SitePopupSettings } from '@/lib/site-popup.functions';
import { getSiteDisplay, type SiteDisplaySettings } from '@/lib/site-display.functions';
import certificadoA1Asset from '@/assets/certificado-a1-emei.png.asset.json';




export const Route = createFileRoute('/c/$token')({
  validateSearch: (s: Record<string, unknown>) => ({ issuing: s.issuing === 1 || s.issuing === '1' ? 1 : undefined }),

  loader: async ({ params }) => {
    const [row, payment, popup, display] = await Promise.all([
      resolveCompanyLink({ data: { token: params.token } }),
      getLinkPaymentStatus({ data: { token: params.token } }).catch(() => ({ paid: false, paid_at: null as string | null })),
      getSitePopup().catch(() => null),
      getSiteDisplay().catch(() => ({ show_cert_landing: true, show_cert_success: true } as SiteDisplaySettings)),
    ]);
    if (!row) throw notFound();
    return { row, initialPaidAt: payment.paid_at, popup, display };
  },


  head: () => ({
    meta: [
      { title: 'Portal do Empreendedor — Certificado Digital MEI' },
      { name: 'description', content: 'Portal do Empreendedor — Certificado Digital MEI' },
    ],
    links: [
      { rel: 'preload', as: 'image', href: certificadoA1Asset.url, fetchpriority: 'high' as const },
    ],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: () => <ErrorPage />,
  component: TokenHomePage,
});


function cleanPersonName(v?: string | null): string {
  if (!v) return '';
  // remove digits, strip stray punctuation from formatted CNPJ prefixes, collapse whitespace
  return v.replace(/\d+/g, '').replace(/[.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function TokenHomePage() {
  const { row, initialPaidAt, popup, display } = Route.useLoaderData() as { row: ResolvedCompany; initialPaidAt: string | null; popup: SitePopupSettings | null; display: SiteDisplaySettings };
  const { token } = Route.useParams();
  const search = Route.useSearch() as { issuing?: number };
  const nomeFmt = cleanPersonName(row.nome) || cleanPersonName(row.razao_social) || '—';
  const cnpjFmt = row.cnpj ? formatCNPJ(row.cnpj) : '—';
  const aberturaFmt = row.abertura ? formatDateBR(row.abertura) : '—';

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupSettings] = useState<SitePopupSettings | null>(popup);
  const [paidAt, setPaidAt] = useState<string | null>(initialPaidAt);
  const [issuing, setIssuing] = useState<boolean>(search.issuing === 1);
  const navigate = useNavigate();

  // "Gerando seu certificado": mantém overlay por no mínimo 4s e até paidAt chegar
  useEffect(() => {
    if (!issuing) return;
    const started = Date.now();
    const MIN_MS = 4000;
    const check = () => {
      const elapsed = Date.now() - started;
      if (paidAt && elapsed >= MIN_MS) {
        setIssuing(false);
        navigate({ to: '/c/$token', params: { token }, search: (prev: any) => prev, replace: true });
      }
    };
    check();
    const t = setInterval(check, 400);
    return () => clearInterval(t);
  }, [issuing, paidAt, navigate, token]);

  // Enquanto está "issuing", faz polling agressivo (1s) do status
  useEffect(() => {
    if (!issuing || paidAt) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await getLinkPaymentStatus({ data: { token } });
        if (!cancelled && res.paid && res.paid_at) setPaidAt(res.paid_at);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(t); };
  }, [issuing, paidAt, token]);







  // Poll payment status only if not already paid; start after 8s
  useEffect(() => {
    if (paidAt) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const res = await getLinkPaymentStatus({ data: { token } });
        if (cancelled) return;
        if (res.paid && res.paid_at) {
          setPaidAt(res.paid_at);
          return; // stop polling
        }
      } catch {}
      if (!cancelled) timer = setTimeout(tick, 10000);
    };
    timer = setTimeout(tick, 8000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token, paidAt]);

  useEffect(() => {
    trackEvent(token, 'view_link');
  }, [token]);





  return (
    <Page>
      {issuing && <IssuingOverlay cnpjFmt={cnpjFmt} />}

      <SiteHeader userName={nomeFmt !== '—' ? nomeFmt : undefined} userDoc={row.cnpj ?? undefined} />

      <Breadcrumb items={[{ label: 'Empresas & Negócios' }, { label: 'Empreendedor' }]} />




      <main className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-3.5 py-6 space-y-4 sm:px-4 lg:max-w-[1180px] lg:px-8 lg:py-10">
          {(() => {
            const handleEmitir = () => {
              trackEvent(token, 'click_certificado');
              if (popupSettings && popupSettings.enabled === false) {
                navigate({ to: '/checkout/$token', params: { token } });
              } else {
                setPopupOpen(true);
              }
            };
            return (
          <>
          {!paidAt && (
          <div className="flex gap-3 rounded-md border border-[#ffeeba] border-l-4 border-l-[#ffc107] bg-[#fcf4d4] p-4 text-[13px] shadow-sm lg:text-[14px]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#856404]" />
            <div className="leading-relaxed text-[#856404]">
              <p>
                Seu MEI possui o <span className="font-bold">Certificado Digital 2026 pendente</span>. Sem a emissão, seu CNPJ pode ser bloqueado para emissão de notas fiscais e acesso a crédito.{' '}
                <button
                  type="button"
                  onClick={handleEmitir}
                  className="font-bold underline cursor-pointer text-[#856404] hover:text-[#5a4402] bg-transparent border-0 p-0"
                >
                  Regularize agora.
                </button>
              </p>
            </div>
          </div>
          )}
          {paidAt && (
          <div className="flex gap-3 rounded-md border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50 p-4 text-[13px] shadow-sm lg:text-[14px]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="leading-relaxed text-emerald-800">
              <p>
                <span className="font-bold">Certificado Digital 2026 emitido com sucesso.</span> Seu CNPJ está regularizado e apto a emitir notas fiscais e acessar crédito.
              </p>
            </div>
          </div>
          )}

          {/* DESKTOP: 2 colunas (dados + checkout sticky) | MOBILE: pilha */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
            {/* Coluna principal — dados */}
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-border border-l-4 border-l-[#004884] bg-card p-4 shadow-sm">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0f5ff] text-[#004884]">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-[#004884] lg:text-[17px]">Cadastro localizado com sucesso</div>
                  <div className="text-[13px] text-muted-foreground">
                    Confira os dados do seu MEI e prossiga para a emissão do certificado digital.
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border bg-card">
                <div className="bg-[#f8f9fa] border-b border-border px-4 py-2.5 text-[14px] font-bold text-[#004884] uppercase tracking-tight lg:px-6 lg:py-3">
                  Dados do Microempreendedor Individual
                </div>
                {/* Desktop: 2 colunas de dados */}
                <div className="lg:grid lg:grid-cols-2">
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
              </div>

              <div className="rounded-md border border-border bg-card p-4 lg:p-5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">Progresso da contratação</span>
                  <span className={`font-semibold ${paidAt ? 'text-[#138835]' : 'text-[#004884]'}`}>
                    {paidAt ? 'Concluído — 3 de 3' : 'Etapa 2 de 3 — quase lá'}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${paidAt ? 'w-full bg-[#138835]' : 'w-[65%] bg-[#004884]'}`} />
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-1 text-[#138835]"><span className="text-[8px]">●</span> Identificação</span>
                  <span className="flex items-center gap-1 text-[#138835]"><span className="text-[8px]">●</span> Dados confirmados</span>
                  <span className={`flex items-center gap-1 ${paidAt ? 'text-[#138835]' : 'text-[#004884]'}`}><span className="text-[8px]">●</span> Emitir certificado</span>
                </div>
              </div>

              <div className="hidden lg:flex gap-2.5 rounded-md border border-border bg-muted/40 p-4 text-left text-[12.5px] text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <p>
                  MEIs sem o Certificado Digital 2026 podem ter restrições na emissão de notas fiscais e no acesso a linhas de crédito para microempreendedores.
                </p>
              </div>
            </div>

            {/* Coluna lateral — checkout (sticky em desktop) */}
            <aside className="lg:sticky lg:top-6 space-y-4">
              <div className={`rounded-md border bg-card p-0 overflow-hidden shadow-sm lg:shadow-[0_20px_60px_-24px_rgba(0,72,132,0.35)] ${paidAt ? 'border-emerald-500' : 'border-border'}`}>
                {((!paidAt && display.show_cert_landing) || (paidAt && display.show_cert_success)) && (
                  <CertVisual paidAt={paidAt} cnpjFmt={cnpjFmt} nome={nomeFmt} />
                )}

                {!paidAt && (
                  <div className="flex items-start gap-4 p-5 lg:flex-col lg:items-center lg:text-center lg:p-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#f0f5ff] text-[#004884] lg:h-16 lg:w-16">
                      <User className="h-6 w-6 lg:h-8 lg:w-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold leading-snug text-[#004884] lg:text-[18px]">
                        Certificado Digital MEI — Emissão Obrigatória 2026
                      </div>
                      <p className="mt-1.5 text-[13px] text-foreground/90 leading-relaxed">
                        Seu CNPJ foi localizado e está <span className="font-bold">aguardando a emissão do certificado</span>. Prossiga agora para regularizar e receber seu certificado digital.
                      </p>
                    </div>
                  </div>
                )}

                {paidAt ? (
                  <SuccessCard paidAt={paidAt} cnpjFmt={cnpjFmt} />
                ) : (
                  <div className="bg-[#f8f9fa] border-t border-border p-4 flex justify-center lg:p-5">
                    <button
                      type="button"
                      onClick={handleEmitir}
                      className="inline-flex min-h-[44px] w-full max-w-[280px] items-center justify-center gap-2 rounded-md bg-[#1351b4] px-6 text-[13px] font-bold uppercase tracking-wide text-white transition-all hover:bg-[#004884] active:scale-[0.98] lg:max-w-none lg:min-h-[52px] lg:text-[14px]"
                    >
                      <Lock className="h-4 w-4" />
                      Emitir Certificado Digital
                    </button>
                  </div>
                )}


                {/* Trust row — desktop only */}
                <div className="hidden lg:flex items-center justify-between border-t border-border/70 px-5 py-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 text-emerald-600" />Pagamento seguro</span>
                  <span className="font-semibold text-[#004884]">gov.br</span>
                  <span>ICP-Brasil</span>
                </div>
              </div>

              <div className="lg:hidden flex gap-2.5 rounded-md border border-border bg-muted/40 p-4 text-left text-[12.5px] text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <p>
                  MEIs sem o Certificado Digital 2026 podem ter restrições na emissão de notas fiscais e no acesso a linhas de crédito para microempreendedores.
                </p>
              </div>
            </aside>
          </div>

          <div className="pt-4 text-center text-[10.5px] text-muted-foreground/60">
            Todo o conteúdo deste site está publicado sob a licença Portal Certificado Digital MEI - Microempreendedor Individual.
          </div>
          </>
            );
          })()}
        </div>

      </main>

      <SiteFooter />
      <CertificatePopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        onContinue={() => {
          setPopupOpen(false);
          navigate({ to: '/checkout/$token', params: { token } });
        }}
        cnpj={row.cnpj}
        settings={popupSettings}
      />
    </Page>
  );
}

function SuccessCard({ paidAt, cnpjFmt }: { paidAt: string; cnpjFmt: string }) {
  const issued = new Date(paidAt);
  const expires = new Date(issued);
  expires.setMonth(expires.getMonth() + 12);
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="overflow-hidden rounded-md border-2 border-emerald-500 bg-white shadow-[0_20px_60px_-24px_rgba(19,136,53,0.45)]">
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-5 py-6 text-center text-white lg:px-6 lg:py-7">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white/20 backdrop-blur">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="text-[18px] font-black leading-tight lg:text-[20px]">
          Parabéns! Certificado emitido com sucesso
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/95">
          Vinculado automaticamente ao seu <span className="font-bold">CNPJ {cnpjFmt}</span>.
        </p>
      </div>

      <div className="border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 text-center lg:px-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          <BadgeCheck className="h-3.5 w-3.5" />
          Válido por 12 meses
        </span>
      </div>

      <dl className="divide-y divide-emerald-100/70">
        <div className="flex items-center gap-3 px-5 py-3 lg:px-6">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-100 text-emerald-700">
            <CalendarCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Data de emissão
            </dt>
            <dd className="text-[14px] font-bold text-emerald-800">{fmt(issued)}</dd>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 lg:px-6">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-100 text-emerald-700">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              Válido até
            </dt>
            <dd className="text-[14px] font-bold text-emerald-800">{fmt(expires)}</dd>
          </div>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-50/40 px-5 py-3 text-[11px] text-emerald-800 lg:px-6">
        <span className="flex items-center gap-1.5 font-semibold">
          <Lock className="h-3 w-3" /> ICP-Brasil
        </span>
        <span className="font-bold uppercase tracking-wide">Ativo</span>
      </div>
    </div>
  );
}

function CertVisual({ paidAt, cnpjFmt, nome }: { paidAt: string | null; cnpjFmt: string; nome: string }) {
  const active = !!paidAt;
  return (
    <div className={`border-b p-4 lg:p-5 ${active ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40' : 'border-border bg-gradient-to-br from-[#eaf1ff] via-white to-[#eaf1ff]'}`}>
      <div
        className={`relative overflow-hidden rounded-xl p-4 text-white shadow-lg lg:p-5 ${
          active
            ? 'bg-[linear-gradient(135deg,#065f46_0%,#0f9d58_55%,#34d399_100%)] shadow-emerald-900/25'
            : 'bg-[linear-gradient(135deg,#0b2545_0%,#12406f_55%,#1351b4_100%)] shadow-slate-900/25'
        }`}
      >
        {/* textura sutil */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, rgba(255,255,255,.6) 0 1px, transparent 1px 9px)',
          }}
        />
        <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/10 blur-xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Certificado Digital
            </div>
            <div className="mt-0.5 text-[17px] font-black leading-tight lg:text-[19px]">
              e-CNPJ A1 · MEI 2026
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              active ? 'bg-white text-emerald-700' : 'bg-[#ffc107] text-[#5c4400]'
            }`}
          >
            {active ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-[#5c4400] animate-pulse" />}
            {active ? 'Ativo' : 'Pendente'}
          </span>
        </div>

        <div className="relative mt-4 grid gap-2.5">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">Titular</div>
            <div className="truncate text-[13.5px] font-bold">{nome}</div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/60">CNPJ</div>
              <div className="font-mono text-[14px] font-bold tracking-wide">{cnpjFmt}</div>
            </div>
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ring-1 ${
                active ? 'bg-white/95 text-emerald-700 ring-white/60' : 'bg-white/15 text-white/70 ring-white/25'
              }`}
            >
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="relative mt-4 flex items-center justify-between gap-2 border-t border-white/20 pt-2.5 text-[9.5px] font-semibold uppercase tracking-wide text-white/75">
          <span>ICP-Brasil</span>
          <span className={active ? 'text-white' : 'text-white/70'}>
            {active ? 'Emitido e vinculado' : 'Aguardando emissão'}
          </span>
        </div>
      </div>
    </div>
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

function IssuingOverlay({ cnpjFmt }: { cnpjFmt: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gerando seu certificado"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-[#0b1e3f] via-[#0f2a5c] to-[#004884] p-4 animate-fade-in"
    >
      <div className="w-full max-w-[440px] rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-8 text-center text-white shadow-2xl">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-white/15 ring-2 ring-white/30">
          <ShieldCheck className="h-10 w-10 text-emerald-300 animate-pulse" />
        </div>
        <div className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-emerald-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pagamento confirmado
        </div>
        <h2 className="mt-3 text-[22px] font-black leading-tight">Gerando seu Certificado Digital</h2>
        <p className="mt-2 text-[13.5px] text-white/85 leading-relaxed">
          Vinculando ao seu <span className="font-bold">CNPJ {cnpjFmt}</span> no ICP-Brasil...
        </p>
        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-1/2 rounded-full bg-emerald-400 animate-[shimmer_1.4s_ease-in-out_infinite]" style={{ animation: 'issuingBar 1.6s ease-in-out infinite' }} />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-[10.5px] text-white/70">
          <div className="rounded-md bg-white/5 py-2">Validando</div>
          <div className="rounded-md bg-white/5 py-2">Assinando</div>
          <div className="rounded-md bg-white/5 py-2">Vinculando</div>
        </div>
      </div>
      <style>{`@keyframes issuingBar{0%{transform:translateX(-100%);width:40%}50%{width:70%}100%{transform:translateX(220%);width:40%}}`}</style>
    </div>
  );
}

