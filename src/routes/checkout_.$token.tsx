import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { resolveCompanyLink } from '@/lib/company-links.functions';
import { createOrderAndPixCharge } from '@/lib/payments/checkout.functions';
import { PixModal } from '@/components/checkout/PixModal';
import { PaymentInfoPopup } from '@/components/checkout/PaymentInfoPopup';
import { getSitePopup, type SitePopupSettings } from '@/lib/site-popup.functions';
import { getLinkPricing, DEFAULT_PRICING, type LinkPricing } from '@/lib/pricing.functions';


// Loads company data by token and forwards to the existing /checkout page.
// The visible URL stays /checkout/$token — no GET parameters are exposed.
// We reuse the existing CheckoutPage implementation via search-based hydration
// under the hood by redirecting once server-side. To fully avoid GET params,
// we render the checkout inline instead.
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import { Check, QrCode, CreditCard, Barcode } from 'lucide-react';
import { SiteHeader, Breadcrumb, SiteFooter, Page } from '@/components/layout/SiteChrome';
import { formatCPFOrCNPJ, maskCPFCNPJ, maskPhone, isValidEmail } from '@/lib/format';
import { trackEvent } from '@/lib/track';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/lib/errors';
import type { ResolvedCompany } from '@/lib/company-links.functions';

export const Route = createFileRoute('/checkout_/$token')({
  loader: async ({ params }) => {
    const [row, popup, pricing] = await Promise.all([
      resolveCompanyLink({ data: { token: params.token } }),
      getSitePopup().catch(() => null),
      getLinkPricing({ data: { token: params.token } }).catch(() => ({
        amount: DEFAULT_PRICING.product_amount,
        originalAmount: DEFAULT_PRICING.product_amount,
        discounted: false,
        discountExpiresAt: null,
      })),
    ]);
    if (!row) throw notFound();
    return { row, popup, pricing };
  },

  head: () => ({
    meta: [{ title: 'Pagamento — Central MEI Digital' }],
  }),
  notFoundComponent: () => (
    <Page>
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Link de checkout não encontrado.</p>
      </main>
      <SiteFooter />
    </Page>
  ),
  errorComponent: () => (
    <Page>
      <SiteHeader />
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Erro ao carregar checkout.</p>
      </main>
      <SiteFooter />
    </Page>
  ),
  component: CheckoutTokenPage,
});


const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;


function cleanPersonName(v?: string | null): string {
  if (!v) return '';
  return v.replace(/\d+/g, '').replace(/[.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function CheckoutTokenPage() {
  const { row, popup, pricing } = Route.useLoaderData() as {
    row: ResolvedCompany;
    popup: SitePopupSettings | null;
    pricing: LinkPricing;
  };
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const headerName = cleanPersonName(row.nome) || cleanPersonName(row.razao_social) || '';
  // O valor é sempre o configurado em Configurações > Preços — aplica-se a
  // todos os links (novos e já enviados). PIX gerado usa esse valor.
  const AMOUNT = pricing?.amount ?? DEFAULT_PRICING.product_amount;




  const [form, setForm] = useState({
    nome: cleanPersonName(row.nome) || cleanPersonName(row.razao_social) || '',
    doc: row.cnpj ? formatCPFOrCNPJ(row.cnpj) : '',
    email: row.email || '',
    phone: row.telefone ? maskPhone(row.telefone) : '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ pix_code: string; qr_code_base64?: string; transaction_id: string } | null>(null);

  const [popupSettings] = useState<SitePopupSettings | null>(popup);

  useEffect(() => {
    trackEvent(token, 'view_checkout');
  }, [token]);



  function validate() {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = 'Informe o nome do titular';
    const digits = form.doc.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) e.doc = 'CPF ou CNPJ inválido';
    if (!isValidEmail(form.email)) e.email = 'E-mail inválido';
    if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      toast.error('Preencha corretamente os campos destacados antes de gerar a guia.');
      return;
    }
    trackEvent(token, 'click_guia');
    setSubmitting(true);
    setInfoOpen(true);
    setInfoLoading(true);
    try {
      const [result] = await Promise.all([
        createOrderAndPixCharge({
          data: {
            name: form.nome,
            document: form.doc.replace(/\D/g, ''),
            email: form.email,
            phone: form.phone.replace(/\D/g, ''),
            productName: 'Pack de Fotos',
            amount: AMOUNT,
            webhookUrl: `${window.location.origin}/api/public/webhook-sigilopay`,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            token,
          }
        }),
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]);

      if (result.orderId) setOrderId(result.orderId);
      if (result.pix_code || result.qr_code_base64) {
        setPixData({ pix_code: result.pix_code, qr_code_base64: result.qr_code_base64, transaction_id: result.transaction_id });
        setInfoLoading(false);
      } else {
        setInfoOpen(false);
        setInfoLoading(false);
        toast.error('A cobrança foi criada mas o PIX não foi retornado. Tente novamente em instantes.');
      }
    } catch (err) {
      console.error('[Checkout] Erro ao gerar cobrança PIX:', err);
      const msg = extractErrorMessage(err);
      setInfoOpen(false);
      setInfoLoading(false);
      toast.error(`Erro ao gerar cobrança: ${msg}`, { duration: 12000 });
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <Page>
      <SiteHeader userName={headerName || undefined} userDoc={row.cnpj ? formatCPFOrCNPJ(row.cnpj) : undefined} />
      <Breadcrumb
        items={[{ label: 'Empresas & Negócios' }, { label: 'Empreendedor' }, { label: 'Pagamento' }]}
      />

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-[700px] px-2.5 py-4 sm:px-4 sm:py-6 md:max-w-[860px] md:px-6 lg:max-w-[1180px] lg:px-8 lg:py-10">
          <div className="rounded-md border border-border bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 md:p-6 lg:p-8 lg:shadow-[0_20px_60px_-30px_rgba(0,72,132,0.25)]">
            {/* Stepper */}
            <div className="mb-4 flex items-center justify-between gap-1 text-[11px] sm:mb-5 sm:gap-2 sm:text-[12px] md:mb-7 lg:mb-8 lg:text-[13px]">
              <Step done label="Identificação" n={1} />
              <div className="mx-0.5 h-px flex-1 bg-border sm:mx-1" />
              <Step done label="Dados" n={2} />
              <div className="mx-0.5 h-px flex-1 bg-border sm:mx-1" />
              <Step active label="Pagamento" n={3} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h1 className="text-[18px] font-bold text-foreground sm:text-[20px] md:text-[22px] lg:text-[26px]">Pagamento da Guia</h1>
                <p className="mt-1 text-[12.5px] text-muted-foreground sm:text-[13px] lg:text-[14px]">
                  Confira os dados da guia antes de realizar o pagamento.
                </p>
              </div>

              {/* Responsive columns: stack on mobile/tablet, split on desktop */}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
                {/* LEFT column */}
                <div className="space-y-5">
                  <Card title="Detalhes da Guia">
                    <TableRow label="Serviço" value="Certificado Digital MEI" />
                    <TableRow label="Descrição" value="Emissão do Certificado Digital para MEI" />
                    <TableRow label="Adquirente" value={row.razao_social || row.nome || '—'} />
                    <TableRow label="CNPJ" value={row.cnpj ? formatCPFOrCNPJ(row.cnpj) : '—'} />

                    <TableRow
                      label="Valor da Guia"
                      value={<span className="font-bold text-brand-blue">{brl(AMOUNT)}</span>}
                      last
                    />
                  </Card>

                  <Card title="Dados do Pagador">
                    <div className="space-y-3 p-3 sm:p-4 lg:p-5">
                      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                        <Field label="NOME DO TITULAR" error={errors.nome} required>
                          <input
                            type="text"
                            value={form.nome}
                            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                            className={inputCls(errors.nome)}
                            maxLength={120}
                          />
                        </Field>
                        <Field label="CNPJ/CPF" error={errors.doc} required>
                          <input
                            type="text"
                            value={form.doc}
                            onChange={(e) => setForm((f) => ({ ...f, doc: maskCPFCNPJ(e.target.value) }))}
                            className={inputCls(errors.doc)}
                            inputMode="numeric"
                          />
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                        <Field label="E-MAIL" error={errors.email} required>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            className={inputCls(errors.email)}
                            placeholder="seu@email.com"
                            maxLength={255}
                          />
                        </Field>
                        <Field label="TELEFONE" error={errors.phone} required>
                          <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
                            className={inputCls(errors.phone)}
                            placeholder="(11) 99999-9999"
                            inputMode="tel"
                          />
                        </Field>
                      </div>
                    </div>
                  </Card>

                  <Card title="Forma de Pagamento">
                    <div className="space-y-2 p-3 lg:p-4">
                      <PayOption selected icon={<QrCode className="h-5 w-5" />} title="PIX" subtitle="Confirmação após identificação do pagamento" />
                      <PayOption disabled icon={<CreditCard className="h-5 w-5" />} title="Cartão de Crédito" subtitle="Indisponível para este serviço" />
                      <PayOption disabled icon={<Barcode className="h-5 w-5" />} title="Boleto Bancário" subtitle="Indisponível para este serviço" />
                      <div className="rounded-md border border-success/40 bg-success-soft px-3 py-2 text-[12px] leading-snug text-foreground sm:text-[12.5px]">
                        ✓ Confirmação imediata da emissão via PIX. QR Code gerado na hora — pague pelo app do seu banco.
                      </div>
                    </div>
                  </Card>
                </div>

                {/* RIGHT column — sticky summary */}
                <aside className="lg:sticky lg:top-6 space-y-4">
                  <Card title="Resumo do Pagamento">
                    <div className="divide-y divide-border">
                      <SummaryRow label="Subtotal" value={brl(AMOUNT)} />
                      <SummaryRow label="Tarifa de processamento" value="R$ 0,00" />
                      <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
                        <span className="text-[13px] font-bold text-foreground sm:text-[14px]">Total a pagar</span>
                        <span className="text-[18px] font-bold text-[#004884] lg:text-[22px]">{brl(AMOUNT)}</span>
                      </div>
                    </div>
                    <div className="border-t border-border bg-[#f8f9fa] p-3 space-y-3 sm:p-4">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-[#1351b4] text-[14px] font-bold uppercase tracking-wider text-white transition-all hover:bg-[#004884] active:scale-[0.98] shadow-md lg:min-h-[54px] lg:text-[15px]"
                      >
                        <QrCode className="h-4 w-4" />
                        {submitting ? 'Processando...' : 'Gerar Guia'}
                      </button>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground sm:text-[11px]">
                        <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" />Pagamento seguro</span>
                        <span className="font-semibold text-[#004884]">gov.br</span>
                        <span>ICP-Brasil</span>
                      </div>
                    </div>
                  </Card>

                  <div className="hidden lg:block rounded-md border border-border bg-muted/30 p-4 text-[12px] leading-relaxed text-muted-foreground">
                    Após o pagamento via PIX, seu Certificado Digital MEI é emitido automaticamente e enviado ao seu e-mail em minutos.
                  </div>

                </aside>
              </div>
            </form>
          </div>
        </div>
      </main>

      <PaymentInfoPopup
        open={infoOpen}
        loading={infoLoading}
        settings={popupSettings ?? undefined}
        onClose={() => { setInfoOpen(false); setInfoLoading(false); }}
        onContinue={() => {
          setInfoOpen(false);
          setPixOpen(true);
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <PixModal
        open={pixOpen}
        amount={AMOUNT}
        orderId={orderId}
        pixData={pixData}
        cnpj={row.cnpj || form.doc}
        token={token}
        onClose={() => setPixOpen(false)}
      />

      <SiteFooter />
    </Page>
  );
}

function Step({ n, label, done, active }: { n: number; label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <div
        className={
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold sm:h-7 sm:w-7 sm:text-[12px] ' +
          (done || active ? 'bg-brand-blue text-primary-foreground' : 'bg-muted text-muted-foreground')
        }
      >
        {done ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : n}
      </div>
      <span
        className={
          'hidden truncate xs:inline sm:inline ' +
          (active ? 'font-semibold text-brand-blue' : done ? 'text-foreground' : 'text-muted-foreground')
        }
      >
        {label}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className="bg-[#f8f9fa] border-b border-border px-3 py-2.5 text-[12px] font-bold uppercase tracking-tight text-[#004884] sm:px-4 sm:text-[13px]">
        {title}
      </div>
      {children}
    </div>
  );
}

function TableRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div
      className={
        (last ? '' : 'border-b border-border ') +
        'flex flex-col gap-0.5 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4'
      }
    >
      <span className="shrink-0 text-[11.5px] uppercase tracking-wide text-muted-foreground sm:text-[13px] sm:normal-case sm:tracking-normal">{label}</span>
      <span className="min-w-0 break-words text-foreground sm:text-right">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] sm:px-4">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 text-foreground">{value}</span>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </div>
      {children}
      {error && <div className="mt-1 text-[11.5px] text-destructive">{error}</div>}
    </label>
  );
}

function inputCls(err?: string) {
  return (
    'w-full rounded-md border bg-background px-3 py-2 text-[14px] outline-none transition-all focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 ' +
    (err ? 'border-destructive' : 'border-input')
  );
}

function PayOption({
  icon,
  title,
  subtitle,
  selected,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={
        'flex items-center gap-3 rounded-md border p-3 text-[13px] ' +
        (selected
          ? 'border-brand-blue bg-brand-blue-soft'
          : disabled
          ? 'border-border bg-muted/30 opacity-60'
          : 'border-border')
      }
    >
      <div className="text-brand-blue">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-foreground">{title}</div>
        <div className="truncate text-[12px] text-muted-foreground">{subtitle}</div>
      </div>
      {selected && <Check className="h-4 w-4 text-brand-blue" />}
    </div>
  );
}

// PixDemo/Row removidos — PIX agora é exibido no componente <PixModal/>

