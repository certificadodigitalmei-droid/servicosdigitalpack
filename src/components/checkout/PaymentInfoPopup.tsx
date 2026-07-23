import { useEffect } from 'react';
import { X, Info, ShieldCheck, ArrowRight, Loader2, FileCheck2, Building2, CalendarClock } from 'lucide-react';
import type { SitePopupSettings } from '@/lib/site-popup.functions';
import { POPUP_DEFAULTS } from '@/lib/site-popup.functions';

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
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3 backdrop-blur-sm sm:items-center sm:p-6 animate-in fade-in duration-200"
      onClick={loading ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
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
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0b1e3f]">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0b1e3f]/5 text-[#0b1e3f]">
                  <Info className="h-4 w-4" />
                </div>
                {s.payment_badge_text}
              </div>
            </div>

            <div className="space-y-4 px-5 py-6 sm:px-8 sm:py-7">
              <h2 className="text-[22px] font-black leading-tight text-[#0b1e3f] sm:text-[24px]">
                {s.payment_title}
              </h2>

              <div className="space-y-3 text-[13.5px] leading-relaxed text-slate-700">
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1351b4]" />
                  <p>{s.payment_partner_text}</p>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <p>{s.payment_alert_text}</p>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p>{s.payment_confirmation_text}</p>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <CalendarClock className="h-5 w-5 shrink-0 text-[#1351b4]" />
                  <p className="font-semibold text-[#0b1e3f]">{s.payment_validity_text}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <button
                onClick={onClose}
                className="rounded-md px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                {s.payment_cancel_button_text}
              </button>
              <button
                onClick={onContinue}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-[#1351b4] px-6 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-[#1351b4]/25 transition hover:bg-[#004884] active:scale-[0.98]"
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
