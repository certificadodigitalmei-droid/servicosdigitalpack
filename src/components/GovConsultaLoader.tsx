import { useEffect, useState } from 'react';
import { Check, Loader2, ShieldCheck, Search, FileCheck2, Building2 } from 'lucide-react';

const STEPS = [
  { label: 'Conectando ao Portal gov.br', icon: ShieldCheck },
  { label: 'Autenticando com a Receita Federal', icon: ShieldCheck },
  { label: 'Consultando base do MEI', icon: Search },
  { label: 'Validando dados do CNPJ', icon: Building2 },
  { label: 'Cadastro localizado com sucesso', icon: FileCheck2 },
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
    ? cnpj.replace(/\D/g, '').padEnd(14, '•').slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : '••.•••.•••/••••-••';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gradient-to-b from-[#071a3a] via-[#0b1e3f] to-[#0b1e3f] text-white animate-fade-in">
      {/* Barra gov.br */}
      <div className="w-full bg-[#071a3a] border-b border-white/10">
        <div className="mx-auto flex max-w-[720px] items-center gap-2 px-4 py-2 text-[11px] tracking-wider uppercase text-white/70">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-white text-[9px] font-black text-[#0b1e3f]">g</span>
          gov.br · Portal do Empreendedor
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Selo animado */}
          <div className="mx-auto relative flex h-28 w-28 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-white/10" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-emerald-400 border-r-emerald-400 animate-spin" />
            <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-white/60 animate-spin [animation-duration:2.2s] [animation-direction:reverse]" />
            <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white text-[#0b1e3f] shadow-inner">
              <span className="text-[15px] font-black leading-none">gov</span>
              <span className="text-[10px] font-black tracking-widest text-emerald-600 leading-none mt-0.5">.br</span>
            </div>
            {/* Pings */}
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/20 animate-ping" />
          </div>

          {/* Título */}
          <div className="text-center space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 font-semibold">
              Microempreendedor Individual
            </div>
            <div className="text-[20px] font-black leading-tight">
              Consultando dados do CNPJ
            </div>
            <div className="text-[12px] text-white/60">
              Conexão criptografada · Receita Federal do Brasil
            </div>
          </div>

          {/* CNPJ scanner */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-widest text-white/50 font-semibold mb-1">
              CNPJ em análise
            </div>
            <div className="font-mono text-[18px] font-bold tabular-nums text-emerald-300 tracking-wider">
              {cnpjMask}
            </div>
            {nome && (
              <div className="mt-2 text-[12px] text-white/70 truncate">
                Titular: <span className="font-semibold text-white">{nome}</span>
              </div>
            )}
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500 transition-[width] duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Passos */}
          <div className="space-y-1.5">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className={
                    'flex items-center gap-2.5 rounded-md border px-3 py-2 text-[12.5px] transition-all duration-300 ' +
                    (done
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      : active
                        ? 'border-white/30 bg-white/10 text-white translate-x-0'
                        : 'border-white/5 bg-white/[0.02] text-white/40')
                  }
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/20">
                    {done ? (
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 text-white/40" />
                    )}
                  </span>
                  <span className="truncate font-medium">{s.label}</span>
                  {active && (
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-white/50">
                      processando...
                    </span>
                  )}
                  {done && (
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                      ok
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 text-[10.5px] uppercase tracking-widest text-white/40">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            SSL 256-bit · LGPD · Site oficial
          </div>
        </div>
      </div>
    </div>
  );
}
