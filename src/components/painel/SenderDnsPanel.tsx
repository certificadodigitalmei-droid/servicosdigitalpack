import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SenderDnsStatus } from '@/lib/email-campaign/dns-status.server';

function Row({
  label,
  ok,
  message,
  values,
  failLabel = 'Não propagado',
}: {
  label: string;
  ok: boolean;
  message: string;
  values?: string[];
  failLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">
          {label} · {ok ? 'Verificado' : failLabel}
        </p>
        <p className="text-[11px] leading-snug text-slate-600">{message}</p>
        {values && values.length > 0 ? (
          <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{values.join(' | ')}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Formata uma duração em ms como "2 h 14 min" / "45 s". */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s.toString().padStart(2, '0')} s`;
  return `${s} s`;
}

/** Prazo máximo típico de propagação de DNS. */
const PROPAGATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const FIRST_SEEN_KEY = 'envio:dns-first-pending-at';

export function SenderDnsPanel({
  data,
  loading,
  onRefresh,
  intervalMs = 5 * 60_000,
}: {
  data?: SenderDnsStatus;
  loading?: boolean;
  onRefresh?: () => void;
  /** Intervalo da reverificação automática enquanto a propagação não conclui. */
  intervalMs?: number;
}) {
  const pending = !!data && !data.allReady;
  const [now, setNow] = useState(() => Date.now());

  // Relógio de 1s apenas enquanto há propagação pendente.
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [pending]);

  // Marca quando a propagação pendente foi vista pela primeira vez (base da estimativa).
  const [firstPendingAt, setFirstPendingAt] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !data) return;
    if (!pending) {
      window.localStorage.removeItem(FIRST_SEEN_KEY);
      setFirstPendingAt(null);
      return;
    }
    const stored = Number(window.localStorage.getItem(FIRST_SEEN_KEY));
    if (stored > 0) {
      setFirstPendingAt(stored);
    } else {
      const started = Date.parse(data.checkedAt) || Date.now();
      window.localStorage.setItem(FIRST_SEEN_KEY, String(started));
      setFirstPendingAt(started);
    }
  }, [pending, data]);

  const checkedAtMs = data ? Date.parse(data.checkedAt) : 0;
  const nextCheckIn = pending && checkedAtMs ? checkedAtMs + intervalMs - now : 0;
  const etaRemaining =
    pending && firstPendingAt ? firstPendingAt + PROPAGATION_WINDOW_MS - now : 0;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">
          Autenticação do domínio {data?.domain ?? ''}
        </p>
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Verificar
        </Button>
      </div>

      {pending ? (
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
          <Timer className="h-3 w-3 shrink-0 text-slate-400" />
          <span>
            {loading ? (
              'Reverificando SPF e DKIM agora…'
            ) : (
              <>
                Reverificação automática a cada {Math.round(intervalMs / 60_000)} min · próxima em{' '}
                <strong>{formatDuration(Math.max(0, nextCheckIn))}</strong>
              </>
            )}
            {etaRemaining > 0 ? (
              <> · prazo estimado de propagação: até <strong>{formatDuration(etaRemaining)}</strong></>
            ) : null}
          </span>
        </div>
      ) : null}


      {!data ? (
        <p className="text-[11px] text-slate-500">
          {loading ? 'Consultando registros DNS…' : 'Status DNS indisponível no momento.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          <Row label="SPF" ok={data.spf.ok} message={data.spf.message} values={data.spf.values} />
          <Row label="DKIM" ok={data.dkim.ok} message={data.dkim.message} values={data.dkim.values} />
          <Row label="Delegação NS" ok={data.ns.ok} message={data.ns.message} values={data.ns.values} />
          <Row label="MX (retornos)" ok={data.mx.ok} message={data.mx.message} values={data.mx.values} />
          <Row
            label={`DMARC${data.dmarc.policy ? ` (p=${data.dmarc.policy})` : ''}`}
            failLabel={data.dmarc.values.length === 0 ? 'Ausente' : 'Mal configurado'}
            ok={data.dmarc.ok}
            message={data.dmarc.message}
            values={data.dmarc.values}
          />
          {!data.allReady ? (
            <p className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">
              Propagação pendente: a verificação DNS pode levar até 72 horas. Enquanto SPF e a delegação NS não
              estiverem verificados, os envios podem falhar ou cair em spam. Acompanhe em Cloud → E-mails.
            </p>
          ) : (
            <p className="rounded-md bg-emerald-50 p-2 text-[11px] text-emerald-800">
              Domínio autenticado e propagado — pronto para envio em massa.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
