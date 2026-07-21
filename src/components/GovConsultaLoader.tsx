import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import heroMobile from '@/assets/gov-entrar-mobile.jpg.asset.json';
import heroDesktop from '@/assets/gov-entrar-desktop-v2.png.asset.json';

const AZUL = '#1351B4';
const AMARELO = '#FFCD07';

function buildSteps(nome?: string | null) {
  return [
    'Consultando dispositivos…',
    'Entrando no portal gov.br',
    'Portal MEI',
    nome ? `Olá, ${nome}` : 'Identificando titular',
    'Buscando CNPJ',
    'Cadastro encontrado',
  ];
}

const STEP_MS = 700;

export function GovConsultaLoader({
  cnpj: _cnpj,
  nome,
  onFinish,
}: {
  cnpj?: string | null;
  nome?: string | null;
  onFinish: () => void;
}) {
  const steps = useMemo(() => buildSteps(nome), [nome]);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const total = steps.length * STEP_MS;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(100, (elapsed / total) * 100));
      setStep(Math.min(steps.length - 1, Math.floor(elapsed / STEP_MS)));
      if (elapsed >= total) {
        clearInterval(tick);
        setTimeout(onFinish, 400);
      }
    }, 60);
    return () => clearInterval(tick);
  }, [onFinish, steps.length]);

  const currentLabel = steps[step] ?? steps[steps.length - 1];

  // MOBILE / TABLET floating button over the hero
  const FloatingCTA = (
    <>
      <button
        type="button"
        disabled
        aria-live="polite"
        className="relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full px-6 py-4 text-white shadow-[0_14px_40px_-10px_rgba(19,81,180,0.65)] ring-1 ring-white/40"
        style={{ background: AZUL }}
      >
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite]"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
          }}
        />
        <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
        <span
          key={currentLabel}
          className={`animate-fade-in whitespace-nowrap font-semibold tracking-tight ${
            currentLabel.length > 30
              ? 'text-[11px]'
              : currentLabel.length > 22
                ? 'text-[13px]'
                : 'text-[15.5px]'
          }`}
        >
          {currentLabel}
        </span>
      </button>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/80 shadow-sm ring-1 ring-black/5">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${AZUL}, ${AMARELO})`,
          }}
        />
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-white animate-fade-in overflow-hidden">
      {/* ================= MOBILE / TABLET (portrait hero + floating button) ================= */}
      <div className="relative h-full w-full md:hidden">
        <img
          src={heroMobile.url}
          alt="gov.br"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="absolute left-1/2 w-[86%] max-w-[440px] -translate-x-1/2"
          style={{ top: '60%' }}
        >
          {FloatingCTA}
        </div>
      </div>

      {/* ================= DESKTOP (split screen: hero photo + login-like menu) ================= */}
      <div className="hidden h-full w-full md:grid md:grid-cols-[1.15fr_1fr] lg:grid-cols-[1.3fr_1fr]">
        {/* LEFT — hero photo */}
        <div className="relative h-full w-full overflow-hidden">
          <img
            src={heroDesktop.url}
            alt="gov.br"
            className="absolute inset-0 h-full w-full object-cover object-left"
          />
          {/* soft gradient fade into the right panel */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-40"
            style={{
              background:
                'linear-gradient(90deg, rgba(248,250,252,0) 0%, rgba(248,250,252,0.85) 70%, #f8fafc 100%)',
            }}
          />
        </div>

        {/* RIGHT — login-style menu with animated steps */}
        <aside className="relative flex h-full w-full flex-col bg-[#f8fafc]">
          <div className="mx-auto flex h-full w-full max-w-[520px] flex-col justify-center px-10 py-12">
            {/* brand */}
            <div className="mb-8 flex items-center gap-3">
              <img src={govLogo.url} alt="gov.br" className="h-10 w-auto object-contain" />
              <div className="h-8 w-px bg-slate-200" />
              <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Portal do MEI
              </div>
            </div>

            {/* Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_-24px_rgba(12,50,111,0.25)]">
              <div className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
                Autenticação segura
              </div>
              <h1 className="text-[26px] font-black leading-tight tracking-tight" style={{ color: AZUL_ESCURO }}>
                Entrando no gov.br
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">
                Estamos validando seu acesso ao Portal do Microempreendedor Individual. Isso leva apenas alguns segundos.
              </p>

              {/* Progress bar */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span>Progresso</span>
                  <span style={{ color: AZUL }}>{Math.round(progress)}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-[width] duration-100 ease-linear"
                    style={{
                      width: `${progress}%`,
                      background: `linear-gradient(90deg, ${AZUL}, ${AMARELO})`,
                    }}
                  />
                </div>
              </div>

              {/* Steps list */}
              <ul className="mt-6 space-y-2.5">
                {steps.map((label, i) => {
                  const done = i < step;
                  const active = i === step;
                  return (
                    <li
                      key={label}
                      className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13.5px] transition-all ${
                        active
                          ? 'border-[#1351B4]/30 bg-[#1351B4]/5 shadow-sm'
                          : done
                            ? 'border-emerald-200/70 bg-emerald-50/50'
                            : 'border-slate-200/70 bg-white'
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                        {done ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : active ? (
                          <Loader2 className="h-5 w-5 animate-spin" style={{ color: AZUL }} />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                        )}
                      </span>
                      <span
                        className={`font-medium tracking-tight ${
                          active ? 'text-[#0C326F]' : done ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Trust badges */}
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-[11.5px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Conexão segura
                </span>
                <span className="flex items-center gap-1.5">
                  <Fingerprint className="h-3.5 w-3.5" style={{ color: AZUL }} />
                  Selo gov.br
                </span>
                <span className="font-semibold" style={{ color: AZUL_ESCURO }}>
                  ICP-Brasil
                </span>
              </div>
            </div>

            <p className="mt-6 text-center text-[11px] text-slate-400">
              Governo Federal · Ministério da Gestão e da Inovação em Serviços Públicos
            </p>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
