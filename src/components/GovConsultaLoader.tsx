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

      {/* ================= DESKTOP (mobile hero à esquerda + botão flutuante à direita) ================= */}
      <div className="relative hidden h-full w-full md:grid md:grid-cols-2">
        {/* Lado esquerdo: mesma arte do mobile */}
        <div className="relative h-full w-full overflow-hidden bg-white">
          <img
            src={heroMobile.url}
            alt="gov.br"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        </div>

        {/* Lado direito: botão flutuante centralizado */}
        <div className="relative flex h-full w-full items-center justify-center bg-white px-10">
          <div className="w-full max-w-[440px]">
            {FloatingCTA}
          </div>
        </div>
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
