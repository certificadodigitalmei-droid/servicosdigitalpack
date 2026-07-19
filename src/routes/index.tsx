import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Info, FileCheck2, Lock } from "lucide-react";
import { SiteHeader, Breadcrumb, SiteFooter, Page } from "@/components/layout/SiteChrome";
import { formatCNPJ, formatDateBR } from "@/lib/format";

const searchSchema = z.object({
  nome: z.string().optional(),
  cnpj: z.string().optional(),
  abertura: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Portal do Empreendedor - Certificado Mei Digital" },
      {
        name: "description",
        content:
          "Portal do Empreendedor - Certificado Mei Digital",
      },
      { property: "og:title", content: "Portal do Empreendedor - Certificado Mei Digital" },
      {
        property: "og:description",
        content: "Portal do Empreendedor - Certificado Mei Digital",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { nome, cnpj, abertura } = Route.useSearch();
  const cnpjFmt = cnpj ? formatCNPJ(cnpj) : "—";
  const nomeFmt = nome?.trim() || "—";
  const aberturaFmt = abertura ? formatDateBR(abertura) : "—";

  const checkoutSearch: Record<string, string> = {};
  if (cnpj) checkoutSearch.cnpj = cnpj;
  if (nome) checkoutSearch.nome = nome;

  return (
    <Page>
      <SiteHeader userName={nome} userDoc={cnpj} />
      <Breadcrumb
        items={[
          { label: "Empresas e Negócios" },
          { label: "Microempreendedor" },
        ]}
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-3.5 py-6 space-y-4 sm:px-4">
          {/* Yellow info card */}
          <div className="flex gap-3 rounded-md border border-warning-border/60 border-l-4 border-l-warning bg-warning-soft p-4 text-[13px]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <div className="font-semibold text-foreground">
                Serviços digitais disponíveis para sua empresa
              </div>
              <p className="mt-1 text-muted-foreground">
                Os dados públicos da empresa foram localizados. Confira as informações e conheça
                os serviços privados e opcionais disponíveis.
              </p>
            </div>
          </div>

          {/* Success locator card */}
          <div className="flex items-center gap-4 rounded-md border border-border border-l-4 border-l-brand-blue bg-card p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-brand-blue">
                Cadastro localizado com sucesso
              </div>
              <div className="text-[13px] text-muted-foreground">
                Confira os dados da empresa e prossiga para conhecer o serviço.
              </div>
            </div>
          </div>

          {/* Data card */}
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-[14px] font-semibold text-brand-blue">
              Dados do Microempreendedor Individual
            </div>
            <DataRow label="CNPJ" value={cnpjFmt} />
            <DataRow label="TITULAR" value={nomeFmt} />
            <DataRow label="DATA DE ABERTURA" value={aberturaFmt} />
            <DataRow
              label="SITUAÇÃO CADASTRAL"
              value={
                <span className="inline-flex items-center rounded-full bg-success px-3 py-0.5 text-[11px] font-bold uppercase text-primary-foreground">
                  Ativa
                </span>
              }
            />
            <DataRow label="TIPO" value="Microempreendedor Individual" last />
          </div>

          {/* Progress card */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Progresso da contratação</span>
              <span className="font-semibold text-brand-blue">Etapa 2 de 3 — quase lá</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[65%] rounded-full bg-brand-blue" />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px]">
              <span className="text-success">● Identificação</span>
              <span className="text-success">● Dados confirmados</span>
              <span className="text-brand-blue">● Conhecer serviço</span>
            </div>
          </div>

          {/* Service card */}
          <div className="rounded-md border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue">
                <Lock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-brand-blue">
                  Serviço de Apoio Digital para MEI
                </div>
                <p className="mt-1 text-[13px] text-foreground">
                  Conheça nosso serviço privado de apoio digital, organização documental e
                  suporte ao microempreendedor.
                </p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Confira todos os itens incluídos, valores, condições e prazo de atendimento
                  antes de contratar.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-center">
              <Link
                to="/checkout"
                search={checkoutSearch}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand-blue px-6 text-[13px] font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:brightness-110"
              >
                <Lock className="h-4 w-4" />
                Conhecer serviço
              </Link>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="rounded-md border border-border bg-muted/40 p-3 text-center text-[12px] text-muted-foreground">
            Serviço privado e opcional. A Central MEI Digital não possui vínculo com a Receita
            Federal, Gov.br, Portal do Empreendedor ou qualquer órgão público.
          </div>
        </div>
      </main>

      <SiteFooter />
    </Page>
  );
}

function DataRow({
  label,
  value,
  last,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "px-4 py-3" : "border-b border-border px-4 py-3"}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[14px] text-foreground">{value}</div>
    </div>
  );
}
