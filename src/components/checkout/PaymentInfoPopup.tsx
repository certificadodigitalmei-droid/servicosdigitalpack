import { useEffect } from 'react';
import {
  X,
  Info,
  ShieldCheck,
  ArrowRight,
  Loader2,
  FileCheck2,
  Building2,
  CalendarClock,
  Lock,
  Landmark,
  QrCode,
} from 'lucide-react';
import type { SitePopupSettings } from '@/lib/site-popup.functions';
import { POPUP_DEFAULTS } from '@/lib/site-popup.functions';
import { renderRich } from '@/lib/rich-text';

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onContinue: () => void;
  settings?: Pick<
    SitePopupSettings,
    | 'payment_badge_text'
    | 'payment_title'
    | 'payment_partner_text'
    | 'payment_alert_text'
    | 'payment_confirmation_text'
    | 'payment_validity_text'
    | 'payment_loading_title'
    | 'payment_loading_subtitle'
    | 'payment_continue_button_text'
    | 'payment_cancel_button_text'
  >;
};

export function PaymentInfoPopup({ open, loading, onClose, onContinue, settings }: Props) {
  const s = { ...POPUP_DEFAULTS, ...(settings ?? {}) };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, loading]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/80 p-3 backdrop-blur-md sm:items-center sm:p-6 animate-in fade-in duration-200"
      onClick={loading ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200/60 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 px-8 py-16">
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-[#0b1e3f]/5">
              <Loader2 className="h-10 w-10 animate-spin text-[#1351b4]" />
            </div>
            <div className="text-center">
              <div className="text-[16px] font-bold text-[#0b1e3f]">{s.payment_loading_title}</div>
              <div className="mt-1 text-[13px] text-slate-500">{s.payment_loading_subtitle}</div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Conexão criptografada
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5 sm:px-8 sm:py-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#1351b4]/10 text-[#1351b4] shadow-sm">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351b4]">
                    {s.payment_badge_text}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500">Leia com atenção antes de continuar</p>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
              {/* Title */}
              <div className="rounded-2xl border-l-4 border-[#1351b4] bg-gradient-to-r from-[#1351b4]/5 to-transparent p-4 sm:p-5">
                <h2 className="text-[20px] font-black leading-tight text-[#0b1e3f] sm:text-[24px]">
                  {renderRich(s.payment_title)}
                </h2>
              </div>

              {/* Partner / Institution block */}
              <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <Landmark className="h-4 w-4 text-[#1351b4]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Empresa credenciada
                  </span>
                </div>
                <div className="flex items-start gap-4 p-4 sm:p-5">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1351b4]/10 text-[#1351b4]">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div className="text-[13.5px] leading-[1.7] text-slate-700">
                    {renderRich(s.payment_partner_text)}
                  </div>
                </div>
              </div>

              {/* How to pay / PIX instructions */}
              <div className="group overflow-hidden rounded-2xl border border-[#1351b4]/15 bg-gradient-to-br from-[#1351b4]/[0.04] to-white shadow-sm transition hover:shadow-md">
                <div className="flex items-center gap-2 border-b border-[#1351b4]/10 bg-[#1351b4]/[0.04] px-4 py-2.5">
                  <QrCode className="h-4 w-4 text-[#1351b4]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#0b1e3f]">
                    Pagamento simples e 100% digital
                  </span>
                </div>
                <div className="flex items-start gap-4 p-4 sm:p-5">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1351b4]/10 text-[#1351b4]">
                    <Info className="h-6 w-6" />
                  </div>
                  <div className="text-[13.5px] leading-[1.7] text-slate-700">
                    {renderRich(s.payment_alert_text)}
                  </div>
                </div>
              </div>

              {/* Confirmation */}
              <div className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                  <FileCheck2 className="h-6 w-6" />
                </div>
                <div className="text-[13.5px] leading-[1.7] text-slate-700">
                  {renderRich(s.payment_confirmation_text)}
                </div>
              </div>

              {/* Validity */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1351b4]/10 text-[#1351b4]">
                  <CalendarClock className="h-6 w-6" />
                </div>
                <p className="text-[14px] font-bold text-[#0b1e3f]">{renderRich(s.payment_validity_text)}</p>
              </div>

              {/* Security seal */}
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[12px] font-medium text-slate-500">
                <Lock className="h-4 w-4 text-emerald-600" />
                Ambiente seguro e criptografado • Processo credenciado ICP-Brasil
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <button
                onClick={onClose}
                className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white hover:shadow-sm"
              >
                {s.payment_cancel_button_text}
              </button>
              <button
                onClick={onContinue}
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1351b4] to-[#0b1e3f] px-8 text-sm font-bold uppercase tracking-wide text-white shadow-xl shadow-[#1351b4]/25 transition hover:from-[#004884] hover:to-[#0b1e3f] active:scale-[0.98]"
              >
                {s.payment_continue_button_text}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
