import { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, QrCode } from 'lucide-react';
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
  cnpj,
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
    <div className="fixed inset-0 z-[200] flex flex-col bg-white animate-fade-in">
      {/* Tricolor top bar */}
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${AZUL} 0 33%, ${AMARELO} 33% 66%, #168821 66% 100%)` }}
      />

      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-5 pb-8 pt-2">
        {/* Hero image (recreates the reference) */}
        <div className="relative mx-auto w-full flex-1 min-h-0 overflow-hidden">
          <img
            src={heroImg.url}
            alt="gov.br"
            className="h-full w-full object-contain object-center"
          />
        </div>

        {/* Botão "Entrar com gov.br" com animação de status no lugar do texto */}
        <div className="mt-4 space-y-3">
          <button
            type="button"
            disabled
            aria-live="polite"
            className="relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full px-6 py-4 text-white shadow-lg"
            style={{ background: '#1351B4' }}
          >
            {/* Shimmer */}
            <span
              className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite]"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)',
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

          {/* Progress bar sob o botão */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#1351B4]/10">
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${AZUL}, ${AMARELO})`,
              }}
            />
          </div>

          <p className="text-center text-[13px] text-[#4a4a4a]">
            Aguarde… <span className="font-semibold text-[#1351B4]">estamos validando</span> sua conta gov.br
          </p>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-center gap-2 text-[14px] font-semibold text-[#1351B4]">
              <ShieldCheck className="h-[18px] w-[18px]" />
              Gerar código de acesso
            </div>
            <div className="flex items-center justify-center gap-2 text-[14px] font-semibold text-[#1351B4]">
              <QrCode className="h-[18px] w-[18px]" />
              Ler QR code
            </div>
          </div>

          <div className="pt-1 text-right text-[11px] text-[#9a9a9a]">3.8.4</div>
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
