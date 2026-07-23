import { useEffect, useState } from 'react';
import { Bell, ShieldAlert, Scale, Award, ShieldCheck, X, Lock, KeyRound, Headphones, ArrowRight, FileText } from 'lucide-react';
import { getSitePopup, POPUP_DEFAULTS, type SitePopupSettings } from '@/lib/site-popup.functions';
import { formatCNPJ } from '@/lib/format';

const FOOTER_ICONS: Record<string, any> = {
  lock: Lock,
  key: KeyRound,
  headset: Headphones,
  shield: ShieldCheck,
  file: FileText,
};

type Props = {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  cnpj?: string | null;
  settings?: SitePopupSettings | null;
};

export function CertificatePopup({ open, onClose, onContinue, cnpj, settings: initial }: Props) {
  const [settings, setSettings] = useState<SitePopupSettings | null>(initial ?? null);

  useEffect(() => {
    if (!open || settings) return;
    getSitePopup()
      .then(setSettings)
      .catch(() => setSettings(POPUP_DEFAULTS));
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const s = settings ?? POPUP_DEFAULTS;
  const cnpjFmt = cnpj ? formatCNPJ(cnpj) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3 backdrop-blur-sm sm:items-center sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0b1e3f]">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0b1e3f]/5 text-[#0b1e3f]">
              <Bell className="h-4 w-4" />
            </div>
            {s.badge_text}
          </div>
        </div>

        <div className="grid gap-6 px-5 py-6 sm:px-8 sm:py-7 md:grid-cols-[1.15fr_1fr]">
          {/* Left column */}
          <div className="space-y-5">
            <h2 className="text-2xl font-black leading-tight text-[#0b1e3f] sm:text-[26px]">
              {s.title}
            </h2>

            {cnpjFmt ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
                <span className="text-slate-500">CNPJ:</span>{' '}
                <span className="font-mono font-bold text-[#0b1e3f]">{cnpjFmt}</span>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0b1e3f]/5 text-[#0b1e3f]">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 text-sm">
                  <div className="text-slate-500">Porém encontra-se</div>
                  <div className="font-bold text-[#0b1e3f]">{s.highlight_text}</div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0b1e3f]/5 text-[#0b1e3f]">
                <Scale className="h-5 w-5" />
              </div>
              <div className="text-sm">
                <div className="text-[13px] font-bold uppercase tracking-wide text-[#0b1e3f]">
                  {s.law_title}
                </div>
                <p className="mt-1 leading-relaxed text-slate-600">{s.law_text}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-t border-dashed border-slate-200 pt-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
              <div className="text-sm">
                <div className="font-bold text-[#0b1e3f]">Emita direto conosco</div>
                <p className="mt-1 leading-relaxed text-slate-600">{s.provider_text}</p>
              </div>
            </div>
          </div>

          {/* Right column — risks */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 bg-[#0b1e3f] px-5 py-4 text-white">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="text-[15px] font-bold leading-tight">{s.risks_title}</div>
            </div>
            <ul className="divide-y divide-slate-100">
              {s.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-[13.5px] leading-snug text-slate-700">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Price band */}
        <div className="mx-5 mb-5 rounded-2xl bg-linear-to-br from-slate-50 to-white p-5 ring-1 ring-slate-200 sm:mx-8 sm:mb-6">
          <div className="grid gap-4 sm:grid-cols-3 sm:items-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{s.price_main_label}</div>
              <div className="mt-1 flex items-baseline gap-1 text-[#0b1e3f]">
                <span className="text-4xl font-black leading-none">{s.price_main}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{s.price_main_note}</div>
            </div>
            <div className="border-slate-200 sm:border-l sm:pl-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{s.price_installment_label}</div>
              <div className="mt-1 text-3xl font-black leading-none text-[#0b1e3f]">{s.price_installment}</div>
              <div className="mt-1 text-[11px] text-slate-500">{s.price_installment_note}</div>
            </div>
            <div className="flex items-center gap-3 border-slate-200 sm:border-l sm:pl-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#0b1e3f]">{s.validity_title}</div>
                <div className="text-[11px] text-slate-500">{s.validity_subtitle}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer items */}
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 sm:px-8">
          <div className="grid gap-3 text-[12px] text-slate-600 sm:grid-cols-3">
            {s.footer_items.map((f, i) => {
              const Icon = FOOTER_ICONS[f.icon] ?? ShieldCheck;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#0b1e3f]" />
                  <span>{f.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            {s.cancel_button_text}
          </button>
          <button
            onClick={onContinue}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-[#1351b4] px-6 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-[#1351b4]/25 transition hover:bg-[#004884] active:scale-[0.98]"
          >
            {s.continue_button_text}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
