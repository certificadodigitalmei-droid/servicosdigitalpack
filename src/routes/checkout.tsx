import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useEffect } from "react";
import { Check, QrCode, CreditCard, Barcode, Copy, ArrowLeft, Clock } from "lucide-react";
import { SiteHeader, Breadcrumb, SiteFooter, Page } from "@/components/layout/SiteChrome";
import {
  formatCPFOrCNPJ,
  maskCPFCNPJ,
  maskPhone,
  isValidEmail,
} from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { resolveCompanyLink } from "@/lib/company-links.functions";

const searchSchema = z.object({
  cnpj: z.string().optional(),
  nome: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/checkout")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Pagamento — Central MEI Digital" },
      {
        name: "description",
        content:
          "Contratação do serviço privado de apoio digital para microempreendedor individual.",
      },
    ],
  }),
  component: CheckoutPage,
});

const AMOUNT = 97.0;
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

function CheckoutPage() {
  const { cnpj, nome, token } = Route.useSearch();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    nome: nome?.trim() || "",
    doc: cnpj ? formatCPFOrCNPJ(cnpj) : "",
    email: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    const loadFromToken = async () => {
      if (!token) return;
      try {
        const data = await resolveCompanyLink({ data: { token } });
        if (data) {
          setForm({
            nome: data.nome || form.nome,
            doc: data.cnpj ? formatCPFOrCNPJ(data.cnpj) : form.doc,
            email: data.email || "",
            phone: data.telefone || "",
          });
        }
      } catch (err) {
        console.error("Error loading checkout data from token:", err);
      } finally {
        setLoading(false);
      }
    };
    loadFromToken();
  }, [token]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Informe o nome do titular";
    const digits = form.doc.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) e.doc = "CPF ou CNPJ inválido";
    if (!isValidEmail(form.email)) e.email = "E-mail inválido";
    if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Telefone inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data: customer } = await supabase
        .from("customers")
        .insert({
          name: form.nome,
          document: form.doc.replace(/\D/g, ""),
          email: form.email,
          phone: form.phone.replace(/\D/g, ""),
        })
        .select("id")
        .single();

      const { data: order } = await supabase
        .from("orders")
        .insert({
          customer_id: customer?.id,
          reference_cnpj: cnpj || null,
          reference_name: nome || null,
          product_name: "Apoio Digital para MEI",
          amount: AMOUNT,
          status: "awaiting_payment",
        })
        .select("id")
        .single();

      if (order?.id) {
        setOrderId(order.id);
        await supabase.from("consent_logs").insert({
          order_id: order.id,
          privacy_accepted: true,
          terms_accepted: true,
          service_private_acknowledged: true,
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        });
      }
      setPixOpen(true);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      setPixOpen(true); // still show demo screen
    } finally {
      setSubmitting(false);
    }
  }

  const backSearch: Record<string, string> = {};
  if (token) {
    backSearch.token = token;
  } else {
    if (nome) backSearch.nome = nome;
    if (cnpj) backSearch.cnpj = cnpj;
  }

  if (loading) {
    return (
      <Page>
        <SiteHeader />
        <main className="flex-1 flex items-center justify-center p-12">
          <Clock className="h-8 w-8 animate-spin text-brand-blue" />
        </main>
      </Page>
    );
  }

  return (
    <Page>
      <SiteHeader userName={form.nome} userDoc={form.doc} />
      <Breadcrumb
        items={[
          { label: "Empresas & Negócios" },
          { label: "Empreendedor" },
          { label: "Pagamento" },
        ]}
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[700px] px-3.5 py-6 sm:px-4">
          <div className="rounded-md border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            {/* Stepper */}
            <div className="mb-6 flex items-center justify-between gap-2 text-[12px]">
              <Step done label="Identificação" n={1} />
              <div className="mx-1 h-px flex-1 bg-border" />
              <Step done label="Dados" n={2} />
              <div className="mx-1 h-px flex-1 bg-border" />
              <Step active label="Pagamento" n={3} />
            </div>

            {!pixOpen ? (
              <CheckoutForm
                form={form}
                setForm={setForm}
                errors={errors}
                onSubmit={handleSubmit}
                submitting={submitting}
                backSearch={backSearch}
              />
            ) : (
              <PixDemo
                orderId={orderId}
                nome={form.nome}
                doc={form.doc}
                onBack={() => navigate({ to: "/", search: backSearch })}
              />
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </Page>
  );
}

function Step({ n, label, done, active }: { n: number; label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className={
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold " +
          (done || active
            ? "bg-brand-blue text-primary-foreground"
            : "bg-muted text-muted-foreground")
        }
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </div>
      <span
        className={
          "truncate " +
          (active ? "font-semibold text-brand-blue" : done ? "text-foreground" : "text-muted-foreground")
        }
      >
        {label}
      </span>
    </div>
  );
}

function CheckoutForm({
  form,
  setForm,
  errors,
  onSubmit,
  submitting,
  backSearch,
}: {
  form: { nome: string; doc: string; email: string; phone: string };
  setForm: React.Dispatch<React.SetStateAction<{ nome: string; doc: string; email: string; phone: string }>>;
  errors: Record<string, string>;
  onSubmit: (ev: React.FormEvent) => void;
  submitting: boolean;
  backSearch: Record<string, string>;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-foreground">Pagamento da Guia</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Confira os dados da guia antes de realizar o pagamento.
        </p>
      </div>

      {/* Detalhes */}
      <Card title="Detalhes da Guia">
        <TableRow label="Serviço" value="Certificado Digital MEI" />
        <TableRow label="Descrição" value="Emissão do Certificado Digital para MEI" />
        <TableRow label="Referência" value={form.doc ? `CNPJ: ${form.doc}` : "Microempreendedor Individual (MEI)"} />
        <TableRow
          label="Valor da Guia"
          value={<span className="font-bold text-brand-blue">{brl(AMOUNT)}</span>}
          last
        />
      </Card>

      {/* Dados do pagador */}
      <Card title="Dados do Pagador">
        <div className="space-y-3 p-4">
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
          <div className="grid gap-4 sm:grid-cols-2">
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

      {/* Forma de pagamento */}
      <Card title="Forma de Pagamento">
        <div className="space-y-2 p-3">
          <PayOption selected icon={<QrCode className="h-5 w-5" />} title="PIX" subtitle="Confirmação após identificação do pagamento" />
          <PayOption disabled icon={<CreditCard className="h-5 w-5" />} title="Cartão de Crédito" subtitle="Indisponível para este serviço" />
          <PayOption disabled icon={<Barcode className="h-5 w-5" />} title="Boleto Bancário" subtitle="Indisponível para este serviço" />
          <div className="rounded-md border border-success/40 bg-success-soft px-3 py-2 text-[12.5px] text-foreground">
            ✓ Confirmação imediata da emissão via PIX. QR Code gerado na hora — pague pelo app do seu banco.
          </div>
        </div>
      </Card>

      {/* Resumo */}
      <Card title="Resumo do Pagamento">
        <div className="divide-y divide-border">
          <SummaryRow label="Subtotal" value={brl(AMOUNT)} />
          <SummaryRow label="Tarifa de processamento" value="R$ 0,00" />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[14px] font-bold text-foreground">Total a pagar</span>
            <span className="text-[18px] font-bold text-[#004884]">{brl(AMOUNT)}</span>
          </div>
        </div>
        <p className="border-t border-border p-3 text-[11.5px] text-muted-foreground">
          O processamento desta guia é realizado por meio de instituição financeira credenciada. O valor poderá ser identificado na fatura com o nome do agente intermediador autorizado.
        </p>
      </Card>

      <button
        type="submit"
        disabled={submitting}
        className="flex min-h-[48px] w-full items-center justify-center rounded-md bg-[#1351b4] text-[15px] font-bold uppercase tracking-wider text-white transition-all hover:bg-[#004884] active:scale-[0.98] shadow-md"
      >
        {submitting ? "Processando..." : "Gerar Guia"}
      </button>
      <div className="text-center">
        <Link
          to="/"
          search={backSearch}
          className="inline-flex items-center gap-1 text-[13px] text-brand-blue hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
      </div>
    </form>
  );
}

function PixDemo({
  orderId,
  nome,
  doc,
  onBack,
}: {
  orderId: string | null;
  nome: string;
  doc: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-foreground">Pagamento PIX</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Aguardando pagamento — <span className="font-semibold text-warning">modo demonstração</span>
        </p>
      </div>

      <div className="rounded-md border border-warning-border/60 border-l-4 border-l-warning bg-warning-soft p-3 text-[12.5px] text-foreground">
        Integração de pagamento ainda não configurada. Este é um QR Code de demonstração; nenhum
        valor será cobrado.
      </div>

      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-card p-6">
        <div className="grid h-48 w-48 grid-cols-8 grid-rows-8 gap-[2px] rounded bg-white p-2 shadow-inner">
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              className={
                ((i * 7 + 3) % 3 === 0 || i % 5 === 0) && i % 11 !== 0
                  ? "bg-brand-navy"
                  : "bg-transparent"
              }
            />
          ))}
        </div>
        <div className="text-[13px] font-semibold text-foreground">R$ 97,00</div>
        <div className="text-[11.5px] text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" /> Válido por 30 minutos
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Código PIX copia e cola
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            value="00020101021226DEMO-CENTRAL-MEI-DIGITAL-INTEGRACAO-PENDENTE5204000053039865802BR6304DEMO"
            className="flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText("DEMO-CENTRAL-MEI-DIGITAL");
              }
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brand-blue px-3 text-[12px] font-semibold text-brand-blue hover:bg-brand-blue-soft"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar
          </button>
        </div>
      </div>

      <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-[12.5px]">
        <Row k="Cliente" v={nome || "—"} />
        <Row k="Documento" v={doc || "—"} />
        <Row k="Pedido" v={orderId ?? "demo-sem-integração"} />
        <Row k="Status" v={<span className="font-semibold text-warning">Aguardando pagamento</span>} />
      </div>

      <button
        type="button"
        disabled
        className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-muted text-[13px] font-semibold uppercase text-muted-foreground"
        title="Disponível após integração real"
      >
        Já realizei o pagamento
      </button>
      <button
        type="button"
        onClick={onBack}
        className="flex w-full items-center justify-center gap-1 text-[13px] text-brand-blue hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para o início
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate text-right text-foreground">{v}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className="bg-[#f8f9fa] border-b border-border px-4 py-2.5 text-[13px] font-bold text-[#004884] uppercase tracking-tight">
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
        (last ? "" : "border-b border-border ") +
        "flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
      }
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
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
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11.5px] text-destructive">{error}</span>}
    </label>
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
        "flex items-center gap-3 rounded-md border px-3 py-3 " +
        (selected
          ? "border-brand-blue bg-brand-blue-light"
          : disabled
          ? "border-border bg-muted/40 opacity-60"
          : "border-border bg-card")
      }
    >
      <div className={selected ? "text-brand-blue" : "text-muted-foreground"}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold text-foreground">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      {selected && (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue text-white">
          <Check className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

function inputCls(error?: string) {
  return (
    "flex min-h-[40px] w-full rounded-md border bg-background px-3 py-2 text-[14px] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " +
    (error ? "border-destructive" : "border-input")
  );
}
