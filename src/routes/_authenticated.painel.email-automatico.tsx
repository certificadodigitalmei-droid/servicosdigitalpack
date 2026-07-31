import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BellRing, CheckCircle2, Clock, Loader2, Mail, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  listNotifyFlow,
  runNotifyFlowNow,
  type NotifyFlowRow,
  type NotifyFlowStats,
  type NotifyFlowEvent,
} from '@/lib/emails/notify-flow.functions';

import { formatCNPJ } from '@/lib/format';


export const Route = createFileRoute('/_authenticated/painel/email-automatico')({
  component: EmailAutomaticoPage,
  head: () => ({
    meta: [
      { title: 'E-mail Automático | Painel' },
      {
        name: 'description',
        content:
          'Acompanhe o fluxo automático de e-mails: guia gerada, cobrança a cada hora e confirmação de pagamento.',
      },
    ],
  }),
});

const fmtHora = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '—';

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function EmailAutomaticoPage() {
  const [day, setDay] = useState('');
  const [rows, setRows] = useState<NotifyFlowRow[]>([]);
  const [stats, setStats] = useState<NotifyFlowStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const doList = useServerFn(listNotifyFlow);
  const doRun = useServerFn(runNotifyFlowNow);



  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await doList({ data: day ? { day } : {} });
      setRows(r.orders);
      setStats(r.stats);
      if (!day) setDay(r.day);
    } catch (e: any) {
      toast.error('Falha ao carregar: ' + (e?.message ?? 'erro'));
    } finally {
      setLoading(false);
    }
  }, [doList, day]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);




  const runNow = async () => {
    setRunning(true);
    try {
      const r = await doRun();
      if (r.skippedByHour) {
        toast.info('Fora da janela de envio (após as 22h). Nenhum e-mail enviado.');
      } else {
        toast.success(
          `${r.firstReminders} primeira(s) cobrança(s) e ${r.hourlyReminders} reenvio(s) horário(s).`,
        );
      }
      void load();
    } catch (e: any) {
      toast.error('Falha: ' + (e?.message ?? 'erro'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BellRing className="h-6 w-6" /> E-mail Automático (notificações)
        </h1>
        <p className="text-muted-foreground text-sm">
          Fluxo automático para as empresas do dia: ao gerar o PIX recebe a{' '}
          <strong>Guia gerada</strong>; após 30 minutos sem pagamento recebe a{' '}
          <strong>Cobrança</strong>; depois disso a cobrança se repete a cada 1 hora até as{' '}
          <strong>22h</strong>. Ao confirmar o pagamento é enviado o e-mail de{' '}
          <strong>Pagamento confirmado</strong>. A régua <strong>nunca cria desconto</strong>: se a
          empresa já recebeu um e-mail promocional antes e o link dela está com desconto ativo, as
          cobranças saem com esse mesmo valor promocional.
        </p>
      </div>




      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Kpi icon={Mail} label="Guias geradas hoje" value={stats?.pedidosHoje ?? 0} />
        <Kpi
          icon={Mail}
          label="E-mail de guia enviado"
          value={stats?.guiaEnviada ?? 0}
          hint={stats?.semEmail ? `${stats.semEmail} sem e-mail` : undefined}
        />
        <Kpi
          icon={Clock}
          label="Cobranças enviadas"
          value={stats?.cobrancasEnviadas ?? 0}
          hint={stats ? `${stats.emCobranca} empresa(s) em cobrança` : undefined}
        />
        <Kpi
          icon={Clock}
          label="Guias substituídas"
          value={stats?.duplicadas ?? 0}
          hint="não recebem cobrança"
        />
        <Kpi icon={CheckCircle2} label="Pagos" value={stats?.pagos ?? 0} />
        <Kpi
          icon={BellRing}
          label="Janela de envio"
          value={stats?.janelaAberta ? 'Aberta' : 'Encerrada'}
          hint={stats ? `Agora: ${String(stats.horaAtual).padStart(2, '0')}h (até 22h)` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Controles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Dia</Label>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button onClick={runNow} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Rodar agora
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Empresas do dia ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !rows.length ? (
            <div className="p-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma guia gerada neste dia.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left p-3">Empresa</th>
                    <th className="text-left p-3">CNPJ</th>
                    <th className="text-left p-3">E-mail</th>
                    <th className="text-center p-3">Guia</th>
                    <th className="text-center p-3">1ª cobrança</th>
                    <th className="text-center p-3">Cobranças</th>
                    <th className="text-center p-3">Próximo envio</th>
                    <th className="text-center p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-3 max-w-[220px] truncate">{o.empresa ?? '—'}</td>
                      <td className="p-3 whitespace-nowrap">{formatCNPJ(o.cnpj)}</td>
                      <td className="p-3 max-w-[200px] truncate">{o.email ?? '—'}</td>
                      <td className="p-3 text-center whitespace-nowrap">{fmtHora(o.guiaSentAt)}</td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {fmtHora(o.firstReminderAt)}
                      </td>
                      <td className="p-3 text-center">{o.reminderCount}</td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {o.status === 'paid' || o.finished ? '—' : fmtHora(o.nextSendAt)}
                      </td>
                      <td className="p-3 text-center">
                        {o.status === 'paid' ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">pago</Badge>
                        ) : o.superseded ? (
                          <Badge variant="outline">substituída</Badge>
                        ) : o.finished ? (
                          <Badge variant="secondary">encerrado</Badge>
                        ) : (
                          <Badge variant="destructive">pendente</Badge>
                        )}
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
