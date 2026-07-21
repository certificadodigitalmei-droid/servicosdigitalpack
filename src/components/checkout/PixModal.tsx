import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Copy, Loader2, ShieldCheck, X } from 'lucide-react';
import pixLoader from '@/assets/pix-loader.png.asset.json';
import { toast } from 'sonner';

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

const LOADING_STEPS = [
  'Conectando ao portal gov.br...',
  'Validando dados do contribuinte...',
  'Consultando Receita Federal...',
  'Emitindo cobrança Pix...',
];

const MIN_LOADING_MS = 2800;
const EXPIRES_IN_MS = 24 * 60 * 60 * 1000; // 24h

export type PixModalProps = {
  open: boolean;
  amount: number;
  orderId: string | null;
  pixData: { pix_code: string; qr_code_base64?: string; transaction_id: string } | null;
  onClose: () => void;
};

export function PixModal({ open, amount, orderId, pixData, onClose }: PixModalProps) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expiresAt] = useState<number>(() => Date.now() + EXPIRES_IN_MS);
  const [now, setNow] = useState<number>(() => Date.now());

  // Marca o momento de abertura
  useEffect(() => {
    if (open && openedAt == null) {
      setOpenedAt(Date.now());
      setMinElapsed(false);
      setStepIdx(0);
    }
    if (!open) {
      setOpenedAt(null);
      setMinElapsed(false);
      setStepIdx(0);
      setCopied(false);
    }
  }, [open, openedAt]);

  // Avança os passos da animação
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      setStepIdx((s) => (s + 1) % LOADING_STEPS.length);
    }, 700);
    return () => clearInterval(t);
  }, [open]);

  // Garante um tempo mínimo de "loading"
  useEffect(() => {
    if (!open || openedAt == null) return;
    const t = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, [open, openedAt]);

  // Tick para countdown
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const showPix = open && !!pixData && minElapsed;

  const remaining = useMemo(() => {
    const ms = Math.max(0, expiresAt - now);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pct = Math.max(0, Math.min(100, (ms / EXPIRES_IN_MS) * 100));
    return {
      label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      pct,
      expired: ms <= 0,
    };
  }, [expiresAt, now]);

  function handleCopy() {
    if (!pixData?.pix_code) return;
    try {
      navigator.clipboard.writeText(pixData.pix_code);
      setCopied(true);
      toast.success('Código PIX copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.');
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 sm:p-6 animate-fade-in"
    >
      <div className="relative w-full max-w-[520px] max-h-[92vh] overflow-y-auto rounded-lg bg-card shadow-2xl animate-scale-in">
        {/* Header estilo gov.br */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-[#0b1e3f] px-4 py-3 text-white rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-white/70 leading-none">
                gov.br · Emissão de Guia
              </div>
              <div className="truncate text-[14px] font-bold">Pagamento via PIX</div>
            </div>
          </div>
          {showPix && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!showPix ? (
          <GovLoading stepIdx={stepIdx} />
        ) : (
          <div className="p-5 space-y-5">
            {/* Countdown */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <div className="flex items-center gap-2 text-amber-900">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">Pix válido por 24h</span>
                </div>
                <div className={`font-mono font-bold tabular-nums ${remaining.expired ? 'text-destructive' : 'text-amber-900'}`}>
                  {remaining.expired ? 'EXPIRADO' : remaining.label}
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${remaining.pct}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-amber-800/80">
                Após esse período, será necessário gerar uma nova cobrança.
              </p>
            </div>

            {/* QR + valor */}
            <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Escaneie com o app do seu banco
              </div>
              <div
                className="relative cursor-pointer group"
                onClick={handleCopy}
                title="Clique para copiar"
              >
                {pixData?.qr_code_base64 ? (
                  <img
                    src={
                      pixData.qr_code_base64.startsWith('data:')
                        ? pixData.qr_code_base64
                        : `data:image/png;base64,${pixData.qr_code_base64.replace(/^base64,/, '')}`
                    }
                    alt="QR Code PIX"
                    className="h-48 w-48 rounded bg-white p-2 shadow-inner ring-1 ring-border object-contain"
                  />
                ) : pixData?.pix_code ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixData.pix_code)}`}
                    alt="QR Code PIX"
                    className="h-48 w-48 rounded bg-white p-2 shadow-inner ring-1 ring-border object-contain"
                  />
                ) : (
                  <div className="grid h-48 w-48 place-items-center rounded bg-white p-2 shadow-inner ring-1 ring-border text-[11px] text-muted-foreground">
                    QR indisponível
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                  <span className="bg-white px-3 py-1 rounded-full text-[10px] font-bold shadow-sm">
                    CLIQUE PARA COPIAR
                  </span>
                </div>
              </div>
              <div className="text-[20px] font-black text-[#0b1e3f]">{brl(amount)}</div>
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                Aguardando pagamento...
              </div>
            </div>

            {/* Copia e cola */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                PIX Copia e Cola
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={pixData?.pix_code || ''}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full truncate rounded-md border border-input bg-muted/30 px-3 py-2.5 text-[12px] font-mono"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#1351b4] px-4 text-[13px] font-bold text-white hover:bg-[#0b1e3f] transition-colors"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Detalhes */}
            <div className="grid gap-1.5 rounded-md border border-border bg-muted/10 p-3 text-[12.5px]">
              <RowKV k="Beneficiário" v="Central MEI Digital" />
              <RowKV k="Referência" v={orderId ? orderId.slice(0, 8).toUpperCase() : '—'} />
              <RowKV k="Valor" v={<span className="font-bold">{brl(amount)}</span>} />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md border border-border bg-background py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GovLoading({ stepIdx }: { stepIdx: number }) {
  const progress = ((stepIdx + 1) / LOADING_STEPS.length) * 100;
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      {/* Imagem oficial animada */}
      <div className="relative">
        <div className="absolute -inset-3 rounded-full bg-[#1351b4]/10 blur-xl animate-pulse" />
        <div className="relative h-40 w-40 rounded-full bg-white shadow-[0_8px_30px_-8px_rgba(19,81,180,0.5)] ring-2 ring-[#1351b4]/20 overflow-hidden">
          <img
            src={pixLoader.url}
            alt="Gerando cobrança Pix"
            className="h-full w-full object-contain p-2 animate-[pulse_2.2s_ease-in-out_infinite]"
          />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#1351b4] border-r-emerald-500 animate-spin [animation-duration:2.4s]" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[16px] font-black text-[#0b1e3f] tracking-tight">Gerando sua guia PIX</div>
        <div className="text-[12.5px] text-muted-foreground min-h-[18px]">
          {LOADING_STEPS[stepIdx]}
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="w-full max-w-[320px] space-y-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-[#1351b4] via-[#2670e8] to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10.5px] font-medium text-muted-foreground">
          <span>Etapa {stepIdx + 1} de {LOADING_STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="h-3 w-3 text-emerald-600" />
        conexão segura · portal oficial
      </div>
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate text-right text-foreground">{v}</span>
    </div>
  );
}
