import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Copy, Loader2, ShieldCheck, X } from 'lucide-react';
import pixLoader from '@/assets/pix-loader.png.asset.json';
import { formatCPFOrCNPJ } from '@/lib/format';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { useNavigate } from '@tanstack/react-router';
import { checkOrderStatus } from '@/lib/payments/status.functions';
import { trackEvent } from '@/lib/track';

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
  cnpj?: string | null;
  token?: string | null;
  onClose: () => void;
};

export function PixModal({ open, amount, orderId, pixData, cnpj, token, onClose }: PixModalProps) {

  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expiresAt] = useState<number>(() => Date.now() + EXPIRES_IN_MS);
  const [now, setNow] = useState<number>(() => Date.now());
  const [paid, setPaid] = useState(false);
  const [redirectIn, setRedirectIn] = useState<number>(4);
  const checkStatus = useServerFn(checkOrderStatus);
  const navigate = useNavigate();


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

  // Polling de status do pedido (fallback caso o webhook não chegue)
  useEffect(() => {
    if (!open || !orderId || paid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await checkStatus({ data: { orderId } });
        if (!cancelled && res?.paid) {
          setPaid(true);
          toast.success('Pagamento confirmado!');
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, orderId, paid, checkStatus]);

  // Reset "paid" quando o modal fecha
  useEffect(() => {
    if (!open) {
      setPaid(false);
      setRedirectIn(4);
    }
  }, [open]);

  // Ao confirmar pagamento: countdown e redirect automático para /c/$token
  useEffect(() => {
    if (!paid) return;
    setRedirectIn(4);
    const t = setInterval(() => {
      setRedirectIn((s) => {
        if (s <= 1) {
          clearInterval(t);
          if (token) {
            navigate({ to: '/c/$token', params: { token } });
          } else {
            onClose();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paid, token, navigate, onClose]);


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

  async function handleCopy() {
    if (!pixData?.pix_code) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(pixData.pix_code);
      } else {
        // Fallback para contextos não seguros ou clipboard API indisponível
        const textarea = document.createElement('textarea');
        textarea.value = pixData.pix_code;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('execCommand copy failed');
      }
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
            {paid && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 flex items-start gap-2 text-emerald-800 text-[13px] font-semibold animate-fade-in">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div>Pagamento confirmado! Certificado vinculado automaticamente.</div>
                  {token && (
                    <div className="mt-1 text-[12px] font-normal text-emerald-700">
                      Redirecionando para sua página em {redirectIn}s...
                    </div>
                  )}
                </div>
              </div>
            )}
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

            {/* Valor */}
            <div className="text-center">
              <div className="text-[24px] font-black text-[#0b1e3f]">{brl(amount)}</div>
              <div className="mt-1 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                Aguardando pagamento...
              </div>
            </div>

            {/* QR Code */}
            {pixData?.qr_code_base64 && (
              <div className="flex flex-col items-center gap-2">
                <div className="text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Escaneie o QR Code
                </div>
                <div className="rounded-md border border-border bg-white p-3">
                  <img
                    src={
                      pixData.qr_code_base64.startsWith('data:')
                        ? pixData.qr_code_base64
                        : `data:image/png;base64,${pixData.qr_code_base64}`
                    }
                    alt="QR Code Pix"
                    className="h-48 w-48 object-contain"
                  />
                </div>
              </div>
            )}

            {/* Copia e cola */}
            <div className="space-y-3">
              <div className="text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                PIX Copia e Cola
              </div>
              <div
                className="max-h-40 overflow-y-auto break-all rounded-md border border-input bg-muted/30 p-4 text-center text-[13px] font-mono leading-relaxed select-all"
                onClick={(e) => {
                  const selection = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(e.currentTarget);
                  selection?.removeAllRanges();
                  selection?.addRange(range);
                }}
                title="Clique para selecionar o código"
              >
                {pixData?.pix_code || '—'}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#1351b4] px-4 py-3 text-[14px] font-bold text-white hover:bg-[#0b1e3f] transition-colors"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Código copiado!' : 'Copiar código PIX'}
              </button>
            </div>

            {/* Detalhes */}
            <div className="grid gap-1.5 rounded-md border border-border bg-muted/10 p-3 text-[12.5px]">
              <RowKV k="Emissão Certificado — CNPJ" v={cnpj ? formatCPFOrCNPJ(cnpj) : '—'} />
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

function GovLoading({ stepIdx: _stepIdx }: { stepIdx: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="relative h-24 w-24">
        <img
          src={pixLoader.url}
          alt="Gerando cobrança Pix"
          className="h-full w-full object-contain"
        />
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#1351b4] animate-spin" />
      </div>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0b1e3f]">
        <Loader2 className="h-4 w-4 animate-spin text-[#1351b4]" />
        Carregando...
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
