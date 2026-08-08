import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { getDeliverability, type DeliverabilityBucket } from '@/lib/email-campaign/deliverability.functions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, MailWarning, ShieldOff, Ban, Gauge } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/_authenticated/painel/entregabilidade')({
  head: () => ({
    meta: [
      { title: 'Entregabilidade de E-mail | Painel' },
      { name: 'description', content: 'Monitor em tempo quase real de bounce rate, reclamações, supressões e taxa de entrega das campanhas.' },
      { property: 'og:title', content: 'Entregabilidade de E-mail | Painel' },
      { property: 'og:description', content: 'Bounce rate, reclamações, supressões e taxa de entrega em tempo quase real.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: EntregabilidadePage,
});

function pct(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

function fmtPct(v: number) {
  return `${v.toFixed(v < 10 ? 2 : 1)}%`;
}

type Health = { label: string; tone: 'ok' | 'warn' | 'bad' };

function healthFor(bounceRate: number, complaintRate: number): Health {
  if (complaintRate >= 0.3 || bounceRate >= 5) return { label: 'Crítico', tone: 'bad' };
  if (complaintRate >= 0.1 || bounceRate >= 2) return { label: 'Atenção', tone: 'warn' };
  return { label: 'Saudável', tone: 'ok' };
}

const toneClass: Record<Health['tone'], string> = {
  ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-100 text-amber-700 border-amber-200',
  bad: 'bg-red-100 text-red-700 border-red-200',
};

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  bar,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof Gauge;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
  bar?: number;
}) {
  const color =
    tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-700';
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        {typeof bar === 'number' && <Progress value={Math.min(100, bar)} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

function WindowView({ b }: { b: DeliverabilityBucket }) {
  const attempts = b.sent + b.bounced + b.rejected;
  const bounceRate = pct(b.bounced, attempts);
  const complaintRate = pct(b.complaint, b.sent);
  const deliveryRate = pct(b.sent, attempts);
  const health = healthFor(bounceRate, complaintRate);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Saúde do remetente:</span>
        <Badge variant="outline" className={toneClass[health.tone]}>
          {health.label}
        </Badge>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Taxa de entrega"
          value={attempts ? fmtPct(deliveryRate) : '—'}
          sub={`${b.sent} aceitos de ${attempts} tentativas`}
          icon={CheckCircle2}
          tone={deliveryRate >= 97 ? 'ok' : deliveryRate >= 92 ? 'warn' : 'bad'}
          bar={deliveryRate}
        />
        <MetricCard
          title="Bounce rate"
          value={attempts ? fmtPct(bounceRate) : '—'}
          sub={`${b.bounced} devolvidos${b.rejected ? ` · ${b.rejected} recusados` : ''}`}
          icon={MailWarning}
          tone={bounceRate < 2 ? 'ok' : bounceRate < 5 ? 'warn' : 'bad'}
          bar={bounceRate * 10}
        />
        <MetricCard
          title="Reclamações (spam)"
          value={b.sent ? fmtPct(complaintRate) : '—'}
          sub={`${b.complaint} marcações de spam`}
          icon={ShieldOff}
          tone={complaintRate < 0.1 ? 'ok' : complaintRate < 0.3 ? 'warn' : 'bad'}
          bar={complaintRate * 100}
        />
        <MetricCard
          title="Supressões"
          value={String(b.suppressed)}
          sub={`${b.unsubscribed} descadastros · ${b.rateLimited} limitados`}
          icon={Ban}
          tone={b.suppressed === 0 ? 'ok' : 'warn'}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ['Enviados', b.sent],
          ['Devolvidos', b.bounced],
          ['Recusados', b.rejected],
          ['Reclamações', b.complaint],
          ['Descadastros', b.unsubscribed],
          ['Suprimidos', b.suppressed],
          ['Rate-limit', b.rateLimited],
        ].map(([label, val]) => (
          <div key={String(label)} className="min-w-0 rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground truncate">{label}</div>
            <div className="text-lg font-semibold">{val as number}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const eventLabel: Record<string, { label: string; className: string }> = {
  sent: { label: 'Enviado', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  bounced: { label: 'Devolvido', className: 'bg-red-100 text-red-700 border-red-200' },
  rejected: { label: 'Recusado', className: 'bg-red-100 text-red-700 border-red-200' },
  complaint: { label: 'Reclamação', className: 'bg-red-100 text-red-700 border-red-200' },
  complained: { label: 'Reclamação', className: 'bg-red-100 text-red-700 border-red-200' },
  unsubscribed: { label: 'Descadastro', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  suppressed: { label: 'Suprimido', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  rate_limited: { label: 'Rate-limit', className: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function EntregabilidadePage() {
  const fetchStats = useServerFn(getDeliverability);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['email-deliverability'],
    queryFn: () => fetchStats({ data: undefined as never }),
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Entregabilidade de E-mail</h1>
          <p className="text-sm text-muted-foreground">
            Bounce rate, reclamações, supressões e taxa de entrega — atualizado a cada 30 segundos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onClick={() => setAutoRefresh((v) => !v)}>
            {autoRefresh ? 'Ao vivo' : 'Pausado'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Não foi possível carregar os dados de entregabilidade.</AlertDescription>
        </Alert>
      )}

      {data && !data.ok && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{data.message || 'Logs de e-mail indisponíveis no momento.'}</AlertDescription>
        </Alert>
      )}

      {!data && isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas...
        </div>
      )}

      {data?.ok && (
        <>
          <Tabs defaultValue="24h">
            <TabsList>
              <TabsTrigger value="1h">Última hora</TabsTrigger>
              <TabsTrigger value="24h">24 horas</TabsTrigger>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
            </TabsList>
            <TabsContent value="1h" className="mt-4">
              <WindowView b={data.windows.lastHour} />
            </TabsContent>
            <TabsContent value="24h" className="mt-4">
              <WindowView b={data.windows.last24h} />
            </TabsContent>
            <TabsContent value="7d" className="mt-4">
              <WindowView b={data.windows.last7d} />
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Volume por hora (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento nas últimas 24 horas.</p>
                ) : (
                  <div className="flex h-40 items-end gap-1 overflow-x-auto">
                    {data.timeline.map((t) => {
                      const max = Math.max(...data.timeline.map((x) => x.sent + x.bounced + x.complaint + x.suppressed), 1);
                      const h = (n: number) => `${(n / max) * 100}%`;
                      return (
                        <div key={t.hour} className="flex h-full min-w-[14px] flex-1 flex-col justify-end gap-[2px]" title={`${t.hour.slice(11)}h — enviados ${t.sent}, devolvidos ${t.bounced}, reclamações ${t.complaint}, suprimidos ${t.suppressed}`}>
                          {t.complaint > 0 && <div className="w-full rounded-sm bg-red-600" style={{ height: h(t.complaint) }} />}
                          {t.bounced > 0 && <div className="w-full rounded-sm bg-red-400" style={{ height: h(t.bounced) }} />}
                          {t.suppressed > 0 && <div className="w-full rounded-sm bg-amber-400" style={{ height: h(t.suppressed) }} />}
                          <div className="w-full rounded-sm bg-emerald-500" style={{ height: h(t.sent) }} />
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-500" /> Enviados</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-red-400" /> Devolvidos</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-red-600" /> Reclamações</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-amber-400" /> Suprimidos</span>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">Domínios com mais devoluções (7d)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.topBouncedDomains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma devolução registrada. 🎉</p>
                ) : (
                  data.topBouncedDomains.map((d) => (
                    <div key={d.domain} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{d.domain}</span>
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{d.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">Eventos recentes</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos no período visível.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Evento</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead className="hidden md:table-cell">Motivo</TableHead>
                      <TableHead className="w-[150px]">Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((ev) => {
                      const meta = eventLabel[ev.eventType] ?? { label: ev.eventType, className: '' };
                      return (
                        <TableRow key={ev.id}>
                          <TableCell>
                            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">{ev.recipient || '—'}</TableCell>
                          <TableCell className="hidden md:table-cell max-w-[260px] truncate text-muted-foreground">
                            {ev.status || ev.subject || '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(ev.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Última leitura: {new Date(data.fetchedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            {data.historyStartsAt && ` · histórico disponível desde ${new Date(data.historyStartsAt).toLocaleDateString('pt-BR')}`}
          </p>
        </>
      )}
    </div>
  );
}
