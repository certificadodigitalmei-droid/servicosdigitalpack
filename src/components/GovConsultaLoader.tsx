import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import heroImg from '@/assets/gov-entrar-hero.jpg.asset.json';

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

  return (
    <div className="fixed inset-0 z-[200] bg-white animate-fade-in overflow-hidden">
      {/* Imagem de referência preenchendo a tela */}
      <img
        src={heroImg.url}
        alt="gov.br"
        className="absolute inset-0 h-full w-full object-contain object-center sm:object-cover"
      />

      {/* Botão flutuante posicionado sobre o "Entrar com gov.br" da imagem
          (a imagem tem 815x1600 e o botão está aproximadamente a 74% da altura) */}
      <div
        className="absolute left-1/2 w-[86%] max-w-[440px] -translate-x-1/2 space-y-3"
        style={{ top: '74%' }}
      >
        <button
          type="button"
          disabled
          aria-live="polite"
          className="relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full px-6 py-4 text-white shadow-[0_10px_30px_-8px_rgba(19,81,180,0.55)]"
          style={{ background: AZUL }}
        >
          <span
            className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite]"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
            }}
          />
          <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
          <span
            key={currentLabel}
            className="animate-fade-in text-[15.5px] font-semibold tracking-tight"
          >
            {currentLabel}
          </span>
        </button>

        <div className="h-1 w-full overflow-hidden rounded-full bg-white/70 shadow-sm">
          <div
            className="h-full rounded-full transition-[width] duration-100 ease-linear"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${AZUL}, ${AMARELO})`,
            }}
          />
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
