import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SenderDnsStatus } from '@/lib/email-campaign/dns-status.server';

function Row({ label, ok, message, values }: { label: string; ok: boolean; message: string; values?: string[] }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">
          {label} · {ok ? 'Verificado' : 'Não propagado'}
        </p>
        <p className="text-[11px] leading-snug text-slate-600">{message}</p>
        {values && values.length > 0 ? (
          <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{values.join(' | ')}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SenderDnsPanel({
  data,
  loading,
  onRefresh,
}: {
  data?: SenderDnsStatus;
  loading?: boolean;
  onRefresh?: () => void;
}) {
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
