<div className="hidden">Execute esta instrucao no projeto: tem: 724

Links gerados

Links criados no período

526

E-mails enviados com sucesso

ate momento faça enviar os email que falta para essas empresas que já foram importadas ai sim depois começa importar mais, quase 200 empresas de diferença</div>
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, FileCheck2, Lock, BadgeCheck, ArrowRight, Building2, Fingerprint, Clock } from "lucide-react";

const GOV_URL = "https://www.gov.br/empresas-e-negocios/pt-br/empreendedor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digital Certifica A1 — Certificado digital para o seu CNPJ" },
      {
        name: "description",
        content:
          "Certificado Digital para Microempreendedor Individual (MEI). Vinculado ao seu CNPJ, com validade jurídica, assinatura digital ICP-Brasil e acesso aos portais gov.br.",
      },
      { property: "og:title", content: "Digital Certifica A1 — Certificado digital para o seu CNPJ" },
      {
        property: "og:description",
        content:
          "Certificado Digital para Microempreendedor Individual (MEI). Vinculado ao seu CNPJ, com validade jurídica, assinatura digital ICP-Brasil e acesso aos portais gov.br.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-white text-slate-900">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/logo-site.png" alt="Logo" className="h-9 w-auto object-contain" />
            <div>
              <div className="text-sm font-bold leading-tight text-[#0b1e3f]">Digital Certifica A1</div>
              <div className="text-[11px] leading-tight text-slate-500">Certificado digital para o MEI</div>
            </div>
          </div>
          <a
            href={GOV_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-md border border-[#0b1e3f] px-4 py-2 text-xs font-semibold text-[#0b1e3f] transition hover:bg-[#0b1e3f] hover:text-white sm:inline-flex"
          >
            Acessar gov.br
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0b1e3f 0%, #12305e 50%, #0b1e3f 100%)" }}>
        <div className="absolute inset-0 -z-10 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="text-white">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <BadgeCheck className="h-3.5 w-3.5" />
              Validade jurídica ICP-Brasil
            </div>
            <h1 className="text-4xl font-black leading-tight md:text-5xl">
              Tenha o Certificado Digital <br />
              <span className="text-amber-300">da sua empresa MEI</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-white/85 md:text-lg">
              Documento eletrônico vinculado ao seu <strong>CNPJ MEI</strong> que garante autenticidade,
              integridade e valor jurídico às suas assinaturas digitais e ao acesso aos portais do
              governo.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={GOV_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-amber-400 px-6 py-3 text-sm font-bold text-[#0b1e3f] shadow-lg transition hover:bg-amber-300"
              >
                Saiba mais no gov.br
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#beneficios"
                className="inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Ver benefícios
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-white/70">
              <div className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Criptografia ICP-Brasil</div>
              <div className="flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" /> Assinatura eletrônica</div>
              <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Emissão rápida</div>
            </div>
          </div>

          {/* Certificate card mockup */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-amber-300/20 blur-2xl" />
            <div className="rotate-1 rounded-2xl border border-white/20 bg-white p-6 shadow-2xl transition hover:rotate-0">
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6 text-[#0b1e3f]" />
                  <span className="text-sm font-bold text-[#0b1e3f]">e-CNPJ MEI</span>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  ATIVO
                </span>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-dashed border-slate-100 py-1">
                  <dt className="text-slate-500">Titular</dt>
                  <dd className="font-semibold text-slate-800">Sua Empresa MEI</dd>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-100 py-1">
                  <dt className="text-slate-500">CNPJ</dt>
                  <dd className="font-mono font-semibold text-slate-800">00.000.000/0001-00</dd>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-100 py-1">
                  <dt className="text-slate-500">Tipo</dt>
                  <dd className="font-semibold text-slate-800">A1 — Digital</dd>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-100 py-1">
                  <dt className="text-slate-500">Emissor</dt>
                  <dd className="font-semibold text-slate-800">ICP-Brasil</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-slate-500">Validade</dt>
                  <dd className="font-semibold text-emerald-700">12 meses</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-[10px] leading-relaxed text-slate-500">
                Documento eletrônico com validade jurídica reconhecida pela legislação brasileira.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section id="beneficios" className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-black text-[#0b1e3f]">Por que emitir o seu Certificado Digital MEI?</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
            O Certificado Digital é a identidade eletrônica do seu CNPJ. Ele permite realizar diversas
            operações fiscais, contratuais e bancárias com total segurança.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: FileCheck2,
              title: "Assinatura de documentos",
              text: "Assine contratos, notas fiscais e declarações eletronicamente com validade jurídica.",
            },
            {
              icon: Building2,
              title: "Acesso a portais gov",
              text: "Entre nos portais gov.br, e-CAC, Conectividade Social e prefeituras com segurança.",
            },
            {
              icon: Lock,
              title: "Segurança máxima",
              text: "Criptografia ICP-Brasil impede fraudes e garante a autenticidade do titular.",
            },
            {
              icon: BadgeCheck,
              title: "Emissão de NF-e",
              text: "Emita notas fiscais eletrônicas para empresas e órgãos públicos sem restrições.",
            },
            {
              icon: Fingerprint,
              title: "Identidade digital",
              text: "Comprove a titularidade da sua empresa em qualquer transação online.",
            },
            {
              icon: Clock,
              title: "Economia de tempo",
              text: "Resolva questões burocráticas do MEI sem sair de casa, 100% online.",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0b1e3f] hover:shadow-md"
            >
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-[#0b1e3f]/5 text-[#0b1e3f] group-hover:bg-[#0b1e3f] group-hover:text-white">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-base font-bold text-[#0b1e3f]">{b.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-[#0b1e3f] text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <h3 className="text-2xl font-black md:text-3xl">Regularize seu MEI com o Certificado Digital</h3>
            <p className="mt-1 text-sm text-white/80">
              Informações oficiais e completas no Portal do Empreendedor do Governo Federal.
            </p>
          </div>
          <a
            href={GOV_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-amber-400 px-8 py-4 text-sm font-bold text-[#0b1e3f] shadow-lg transition hover:bg-amber-300"
          >
            Saiba mais no gov.br
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-slate-500 md:flex-row">
          <span>© {new Date().getFullYear()} Digital Certifica A1.</span>
          <a href={GOV_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[#0b1e3f]">
            gov.br/empreendedor
          </a>
        </div>
      </footer>


    </div>
  );
}
