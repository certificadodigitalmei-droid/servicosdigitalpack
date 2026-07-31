import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ShoppingCart, Send } from 'lucide-react';
import { toast } from 'sonner';
import { listRecoveryOrders, runRecoveryNow, type RecoveryOrder } from '@/lib/emails/recovery.functions';

export const Route = createFileRoute('/_authenticated/painel/recuperacao-carrinho')({
  component: RecuperacaoPage,
  head: () => ({
    meta: [
      { title: 'Recuperação de Carrinho | Painel' },
      { name: 'description', content: 'Acompanhe os pedidos pendentes e os e-mails diários de recuperação.' },
    ],
  }),
});

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function RecuperacaoPage() {
  const [orders, setOrders] = useState<RecoveryOrder[]>([]);
  const [stats, setStats] = useState({ total: 0, semEmail: 0, prontos: 0, emailsEnviados: 0 });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const doList = useServerFn(listRecoveryOrders);
  const doRun = useServerFn(runRecoveryNow);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await doList({ data: { days: 15 } });
      setOrders(r.orders);
      setStats(r.stats);
    } catch (e: any) {
      toast.error('Falha ao carregar: ' + (e?.message ?? 'erro'));
    } finally {
      setLoading(false);
    }
  }, [doList]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await doRun();
      toast.success(`Rodada concluída: ${r.sent} e-mail(s) enviado(s).`);
      load();
    } catch (e: any) {
      toast.error('Falha ao executar: ' + (e?.message ?? 'erro'));
    } finally {
      setRunning(false);
    }
  };

  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" /> Recuperação de Carrinho
          </h1>
          <p className="text-muted-foreground text-sm">
            Todo pedido com PIX gerado e não pago recebe 1 e-mail por dia (até 15 dias) — automaticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar rodada agora
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pendentes na régua', value: stats.total },
          { label: 'Prontos para envio', value: stats.prontos },
          { label: 'E-mails já enviados', value: stats.emailsEnviados },
          { label: 'Sem e-mail cadastrado', value: stats.semEmail },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pedidos pendentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Empresa</th>
                  <th className="text-left p-3">CNPJ</th>
                  <th className="text-left p-3">E-mail</th>
                  <th className="text-left p-3">Criado</th>
                  <th className="text-center p-3">Avisos</th>
                  <th className="text-left p-3">Último contato</th>
                  <th className="text-left p-3">Próximo envio</th>
                </tr>
              </thead>
              <tbody>
                {loading && orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Nenhum pedido pendente nos últimos 15 dias.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const due = o.email && o.nextSendAt && new Date(o.nextSendAt).getTime() <= now;
                    return (
                      <tr key={o.id} className="border-t">
                        <td className="p-3 max-w-[220px] truncate">{o.empresa ?? '—'}</td>
                        <td className="p-3 whitespace-nowrap">{o.cnpj ?? '—'}</td>
                        <td className="p-3 max-w-[220px] truncate">
                          {o.email ?? <span className="text-muted-foreground">sem e-mail</span>}
                        </td>
                        <td className="p-3 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                        <td className="p-3 text-center">{o.recoveryCount}</td>
                        <td className="p-3 whitespace-nowrap">{fmtDate(o.lastContactAt)}</td>
                        <td className="p-3 whitespace-nowrap">
                          {!o.email ? (
                            <Badge variant="outline">—</Badge>
                          ) : due ? (
                            <Badge>na próxima rodada</Badge>
                          ) : (
                            <span className="text-muted-foreground">{fmtDate(o.nextSendAt)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
