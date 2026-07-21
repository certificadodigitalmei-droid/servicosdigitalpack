import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import govLogo from '@/assets/gov-br-logo.png.asset.json';

// Cores oficiais gov.br
const AZUL = '#1351B4';
const AMARELO = '#FFCD07';
const VERDE = '#168821';

const STEPS = [
  'Conectando ao Portal gov.br',
  'Autenticando com a Receita Federal',
  'Consultando base do MEI',
  'Validando dados do CNPJ',
  'Cadastro localizado com sucesso',
];

const STEP_MS = 750;

export function GovConsultaLoader({
  cnpj,
  nome,
  onFinish,
}: {
  cnpj?: string | null;
  nome?: string | null;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const total = STEPS.length * STEP_MS;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
      const idx = Math.min(STEPS.length - 1, Math.floor(elapsed / STEP_MS));
      setStep(idx);
      if (elapsed >= total) {
        clearInterval(tick);
        setTimeout(onFinish, 450);
      }
    }, 60);
    return () => clearInterval(tick);
  }, [onFinish]);

  const cnpjMask = cnpj
    ? cnpj
        .replace(/\D/g, '')
        .padEnd(14, '•')
        .slice(0, 14)
        .replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, '$1.$2.$3/$4-$5')
    : '••.•••.•••/••••-••';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white text-[#1351B4] animate-fade-in">
      {/* Barra superior gov.br */}
      <div className="w-full border-b-4" style={{ borderColor: AMARELO }}>
        <div className="w-full h-1" style={{ background: `linear-gradient(90deg, ${AZUL} 0 33%, ${AMARELO} 33% 66%, ${VERDE} 66% 100%)` }} />
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-3">
          <img src={govLogo.url} alt="gov.br" className="h-6 w-auto" />
          <div className="text-[10.5px] uppercase tracking-widest text-[#1351B4]/70 font-semibold">
            Portal do Empreendedor
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] space-y-7">
          {/* Logo gov.br animada com pulso */}
          <div className="relative mx-auto flex items-center justify-center">
            {/* Anéis coloridos */}
            <div className="absolute h-40 w-40 rounded-full border-4 animate-spin"
              style={{ borderColor: 'transparent', borderTopColor: AZUL, borderRightColor: AZUL, animationDuration: '1.4s' }} />
            <div className="absolute h-32 w-32 rounded-full border-4 animate-spin"
              style={{ borderColor: 'transparent', borderBottomColor: AMARELO, animationDuration: '2s', animationDirection: 'reverse' }} />
            <div className="absolute h-24 w-24 rounded-full border-4 animate-spin"
              style={{ borderColor: 'transparent', borderLeftColor: VERDE, animationDuration: '1.7s' }} />

            {/* Pulso */}
            <div className="absolute h-40 w-40 rounded-full animate-ping" style={{ background: `${AZUL}15` }} />

            {/* Logo central */}
            <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-[0_8px_30px_-8px_rgba(19,81,180,0.4)] p-3">
              <img src={govLogo.url} alt="gov.br" className="w-full h-auto" />
            </div>
          </div>

          {/* Título */}
          <div className="text-center space-y-2">
            <div className="text-[10.5px] uppercase tracking-[0.24em] font-bold" style={{ color: VERDE }}>
              ● Microempreendedor Individual
            </div>
            <div className="text-[22px] font-black leading-tight text-[#0c3d8c]">
              Consultando dados do CNPJ
            </div>
            <div className="text-[12.5px] text-[#1351B4]/70">
              Conexão segura · Receita Federal do Brasil
            </div>
          </div>

          {/* Painel CNPJ */}
          <div className="rounded-lg border-2 p-4 shadow-sm" style={{ borderColor: `${AZUL}25`, background: `${AZUL}05` }}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-[#1351B4]/70 mb-1.5">
              <span>CNPJ em análise</span>
              <span className="flex items-center gap-1 text-[9px]" style={{ color: VERDE }}>
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: VERDE }} />
                ONLINE
              </span>
            </div>
            <div className="font-mono text-[19px] font-black tabular-nums tracking-wider text-[#0c3d8c]">
              {cnpjMask}
            </div>
            {nome && (
              <div className="mt-2 text-[12px] text-[#1351B4]/80 truncate">
                Titular: <span className="font-bold text-[#0c3d8c]">{nome}</span>
              </div>
            )}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#1351B4]/10">
              <div
                className="h-full rounded-full transition-[width] duration-100 ease-linear"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${AZUL}, ${VERDE}, ${AMARELO})`,
                }}
              />
            </div>
          </div>

          {/* Passos */}
          <div className="space-y-1.5">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div
                  key={label}
                  className={
                    'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-[12.5px] transition-all duration-300 ' +
                    (done
                      ? 'bg-white'
                      : active
                        ? 'bg-white shadow-sm'
                        : 'bg-[#1351B4]/[0.02]')
                  }
                  style={{
                    borderColor: done ? `${VERDE}40` : active ? `${AZUL}40` : `${AZUL}12`,
                  }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: done ? VERDE : active ? AZUL : `${AZUL}10`,
                    }}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                    ) : (
                      <span className="text-[10px] font-black text-[#1351B4]/40">{i + 1}</span>
                    )}
                  </span>
                  <span
                    className="truncate font-semibold"
                    style={{ color: done ? '#0c3d8c' : active ? '#0c3d8c' : '#1351B450' }}
                  >
                    {label}
                  </span>
                  {active && (
                    <span className="ml-auto text-[9.5px] uppercase tracking-wider font-bold" style={{ color: AZUL }}>
                      processando
                    </span>
                  )}
                  {done && (
                    <span className="ml-auto text-[9.5px] uppercase tracking-wider font-bold" style={{ color: VERDE }}>
                      ok
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selo rodapé */}
          <div className="flex items-center justify-center gap-3 text-[10px] uppercase tracking-widest text-[#1351B4]/50 font-semibold">
            <span>SSL 256-bit</span>
            <span className="h-0.5 w-0.5 rounded-full bg-[#1351B4]/30" />
            <span>LGPD</span>
            <span className="h-0.5 w-0.5 rounded-full bg-[#1351B4]/30" />
            <span>Site oficial</span>
          </div>
        </div>
      </div>

      {/* Barra inferior tricolor */}
      <div className="w-full h-1.5" style={{ background: `linear-gradient(90deg, ${AZUL} 0 33%, ${AMARELO} 33% 66%, ${VERDE} 66% 100%)` }} />
    </div>
  );
}
