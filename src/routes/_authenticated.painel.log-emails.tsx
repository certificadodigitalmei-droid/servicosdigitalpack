import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, Search, Play, RotateCcw, Mail, CheckCircle2, Clock, AlertTriangle, Download } from 'lucide-react';
import { listEmailLog, retryFailedEmails } from '@/lib/emails/email-log.functions';
import { processWorkspaceQueue } from '@/lib/gmail/send.functions';
import { DateRangeFilter, computeDateRange, type DatePreset } from '@/components/painel/DateRangeFilter';

export const Route = createFileRoute('/_authenticated/painel/log-emails')({
  component: LogEmailsPage,
  head: () => ({
    meta: [
      { title: 'Log de E-mails | Painel' },
      { name: 'description', content: 'Acompanhe cada e-mail enviado, na fila ou com falha.' },
    ],
  }),
});

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  sent: { label: 'Enviado', variant: 'default' },
  queued: { label: 'Na fila', variant: 'secondary' },
  sending: { label: 'Enviando', variant: 'secondary' },
  retrying: { label: 'Retentando', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

function LogEmailsPage() {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const range = useMemo(() => computeDateRange(preset, from, to), [preset, from, to]);

  const fetchLog = useServerFn(listEmailLog);
  const doRetry = useServerFn(retryFailedEmails);
  const doProcess = useServerFn(processWorkspaceQueue);
  const qc = useQueryClient();

  const params = {
    from: range.from?.toISOString(),
    to: range.to?.toISOString(),
    status,
    search: search.trim() || undefined,
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['email-log', params],
    queryFn: () => fetchLog({ data: params }),
    refetchInterval: 30_000,
  });

  const retryMut = useMutation({
    mutationFn: () => doRetry({ data: {} }),
    onSuccess: (r: any) => {
      toast.success(`${r.requeued} e-mail(s) recolocado(s) na fila.`);
      qc.invalidateQueries({ queryKey: ['email-log'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao reenfileirar'),
  });

  const processMut = useMutation({
    mutationFn: () => doProcess({ data: { maxBatch: 20 } }),
    onSuccess: (r: any) => {
      toast.success(`Fila processada: ${r.sent} enviado(s), ${r.failed} falha(s).`);
      qc.invalidateQueries({ queryKey: ['email-log'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao processar fila'),
  });

  const rows = data?.rows ?? [];
  const stats = data?.stats;

  const exportCsv = () => {
    const header = ['criado_em', 'atualizado_em', 'destinatario', 'assunto', 'tipo', 'status', 'tentativas', 'erro'];
    const csv = [
      header.join(';'),
      ...rows.map((r) =>
        [fmt(r.createdAt), fmt(r.updatedAt), r.to, r.subject, r.tipo, r.status, r.attempts, r.lastError ?? '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(';'),
      ),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `log-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    { label: 'Total no período', value: stats?.total ?? 0, icon: Mail },
    { label: 'Enviados', value: stats?.enviados ?? 0, icon: CheckCircle2 },
    { label: 'Na fila', value: stats?.naFila ?? 0, icon: Clock },
    { label: 'Falhas', value: stats?.falhas ?? 0, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Log de E-mails</h1>
          <p className="text-sm text-muted-foreground">
            Cada e-mail disparado pelo sistema: quem recebeu, qual modelo, status e erros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => retryMut.mutate()} disabled={retryMut.isPending}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reenviar falhas
          </Button>
          <Button size="sm" onClick={() => processMut.mutate()} disabled={processMut.isPending}>
            <Play className="mr-2 h-4 w-4" />
            Processar fila
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DateRangeFilter
            preset={preset}
            onPresetChange={setPreset}
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por e-mail ou assunto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {['all', 'sent', 'queued', 'failed'].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? 'default' : 'outline'}
                onClick={() => setStatus(s)}
              >
                {s === 'all' ? 'Todos' : (STATUS_LABEL[s]?.label ?? s)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Último envio bem-sucedido: {fmt(stats?.ultimoEnvioAt ?? null)} · Enviados na última hora:{' '}
            {stats?.ultimaHora ?? 0}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Envios ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Destinatário</th>
                  <th className="p-3">Modelo</th>
                  <th className="p-3">Assunto</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tent.</th>
                  <th className="p-3">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status, variant: 'outline' as const };
                  return (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{fmt(r.createdAt)}</td>
                      <td className="p-3 font-medium">{r.to}</td>
                      <td className="p-3 text-xs">
                        <Badge variant="outline">{r.tipo}</Badge>
                      </td>
                      <td className="max-w-[280px] truncate p-3">{r.subject}</td>
                      <td className="p-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td className="p-3">{r.attempts}</td>
                      <td className="max-w-[260px] p-3 text-xs text-muted-foreground">
                        {r.lastError
                          ? r.lastError
                          : r.status === 'sent'
                            ? `Confirmado em ${fmt(r.updatedAt)}`
                            : r.nextRetryAt
                              ? `Próxima tentativa: ${fmt(r.nextRetryAt)}`
                              : '—'}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                      Nenhum e-mail no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
