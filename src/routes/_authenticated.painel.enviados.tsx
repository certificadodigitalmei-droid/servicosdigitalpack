import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Search, Download, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DateRangeFilter, computeDateRange, type DatePreset } from '@/components/painel/DateRangeFilter';
import { getEmailMetrics, listSentEmails } from '@/lib/emails/email-metrics.functions';

export const Route = createFileRoute('/_authenticated/painel/enviados')({
  component: EnviadosPage,
});

function EnviadosPage() {
  const [q, setQ] = useState('');
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = useMemo(() => computeDateRange(preset, from, to), [preset, from, to]);
  const fromISO = range.from?.toISOString() ?? null;
  const toISO = range.to?.toISOString() ?? null;

  const fetchMetrics = useServerFn(getEmailMetrics);
  const fetchList = useServerFn(listSentEmails);

  const metricsQ = useQuery({
    queryKey: ['email_send_queue', 'metrics', fromISO, toISO],
    queryFn: () => fetchMetrics({ data: { from: fromISO, to: toISO } }),
    refetchInterval: 30_000,
  });

  const listQ = useQuery({
    queryKey: ['email_send_queue', 'sent-list', fromISO, toISO, q.trim()],
    queryFn: () => fetchList({ data: { from: fromISO, to: toISO, search: q.trim() || null, limit: 500 } }),
    refetchInterval: 30_000,
  });

  const rows = listQ.data ?? [];
  const m = metricsQ.data;

  const exportCsv = () => {
    const header = ['data_envio', 'email', 'assunto', 'id_mensagem'];
    const csvRows = rows.map((e) => [e.sentAt, e.to, e.subject, e.messageId ?? '']);
    const csv = [header, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enviados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            E-mails Enviados
          </h1>
          <p className="text-sm text-slate-500">
            Histórico real do servidor (fila de envio). Os mesmos números aparecem no Dashboard e em Links
            Gerados — e funcionam em qualquer dispositivo, mesmo com o painel fechado.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            metricsQ.refetch();
            listQ.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <DateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Enviados no período" value={m?.periodo} color="text-indigo-600" />
        <StatCard label="Enviados hoje (Brasília)" value={m?.hoje} color="text-emerald-600" />
        <StatCard label="Última hora" value={m?.ultimaHora} color="text-blue-600" />
        <StatCard label="Saldo da hora" value={m?.saldoHora} color="text-amber-600" />
        <StatCard label="Na fila" value={m?.fila} color="text-slate-600" />
        <StatCard label="Falhas / suprimidos" value={(m?.falhas ?? 0) + (m?.suprimidos ?? 0)} color="text-red-600" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Histórico</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="w-64 pl-8"
                placeholder="Buscar por e-mail ou assunto..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">Carregando envios...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Nenhum e-mail enviado no período selecionado.
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Data / Hora</th>
                    <th className="pr-2">Destinatário</th>
                    <th className="pr-2">Assunto</th>
                    <th className="pr-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 align-top hover:bg-slate-50">
                      <td className="py-2 pr-2 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(e.sentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </td>
                      <td className="pr-2 font-medium text-slate-900">{e.to}</td>
                      <td className="pr-2 max-w-[360px] truncate text-slate-700">{e.subject}</td>
                      <td className="pr-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(e.to);
                            toast.success('E-mail copiado.');
                          }}
                          title="Copiar e-mail"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>
        {value === undefined ? '—' : value.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
