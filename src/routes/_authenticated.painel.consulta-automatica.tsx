import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Loader2, Play, Power, PowerOff, Save, TestTube2, Calendar, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { formatCNPJ } from '@/lib/format';
import {
  getAutomationState,
  upsertAutomation,
  setAutomationEnabled,
  runAutomationNow,
  testApi,
  countOpeningsTodayFn,
} from '@/lib/casa-dos-dados/automation.functions';

export const Route = createFileRoute('/_authenticated/painel/consulta-automatica')({
  head: () => ({ meta: [{ title: 'Consulta Automática | Painel' }] }),
  component: ConsultaAutomaticaPage,
});

const QUICK_QUANTITIES = [1, 5, 10, 20, 50, 100, 500];

function ConsultaAutomaticaPage() {
  const qc = useQueryClient();
  const getState = useServerFn(getAutomationState);
  const upsertFn = useServerFn(upsertAutomation);
  const enableFn = useServerFn(setAutomationEnabled);
  const runFn = useServerFn(runAutomationNow);
  const testFn = useServerFn(testApi);
  const countFn = useServerFn(countOpeningsTodayFn);

  const stateQ = useQuery({
    queryKey: ['casa-automation-state'],
    queryFn: () => getState(),
    refetchInterval: 5000,
  });

  const automation = stateQ.data?.automation ?? null;
  const runs = stateQ.data?.runs ?? [];

  const filters = (automation?.filters as any) ?? {
    only_mei: true,
    only_active: true,
    only_matriz: true,
    require_email: true,
  };

  const [quantity, setQuantity] = useState<number>(1);
  const [customQuantity, setCustomQuantity] = useState<string>('');
  const [interval, setIntervalMinutes] = useState<number>(60);
  const [localFilters, setLocalFilters] = useState({
    only_mei: true,
    only_active: true,
    only_matriz: true,
    require_email: true,
  });

  useMemo(() => {
    if (automation) {
      setQuantity(automation.quantity_per_run);
      setIntervalMinutes(automation.interval_minutes);
      setLocalFilters({
        only_mei: !!filters.only_mei,
        only_active: !!filters.only_active,
        only_matriz: !!filters.only_matriz,
        require_email: !!filters.require_email,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automation?.id]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          quantity_per_run: quantity,
          interval_minutes: interval,
          filters: localFilters,
        },
      }),
    onSuccess: async () => {
      toast.success('Configuração salva');
      await qc.invalidateQueries({ queryKey: ['casa-automation-state'] });
      await stateQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });

  const enableMut = useMutation({
    mutationFn: (enabled: boolean) =>
      enableFn({ data: { id: automation!.id, enabled } }),
    onSuccess: (_r, enabled) => {
      toast.success(enabled ? 'Automação ativada' : 'Automação desativada');
      qc.invalidateQueries({ queryKey: ['casa-automation-state'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro'),
  });

  const runMut = useMutation({
    mutationFn: (overrideQuantity?: number) =>
      runFn({ data: { id: automation!.id, overrideQuantity } }),
    onSuccess: (r: any) => {
      if (r?.ok === false && r?.reason === 'already_running') {
        toast.warning('Já existe uma execução em andamento');
      } else if (r?.outcome?.status === 'error') {
        toast.error(`Erro na execução: ${r.outcome.error}`);
      } else {
        toast.success(
          `Execução concluída: ${r.outcome.imported} importada(s), ${r.outcome.duplicated} duplicada(s)`,
        );
      }
      qc.invalidateQueries({ queryKey: ['casa-automation-state'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao executar'),
  });

  const testMut = useMutation({
    mutationFn: () => testFn({ data: undefined as any }),
    onSuccess: (r) => {
      toast.info(`API respondeu com status ${r.status}`);
      // eslint-disable-next-line no-console
      console.log('[Casa dos Dados] /v5/saldo →', r);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao testar API'),
  });

  const countMut = useMutation({
    mutationFn: () => countFn({ data: undefined as any }),
    onSuccess: (r) => {
      toast.info(`Quantidade de hoje — HTTP ${r.status}. Veja o console.`);
      // eslint-disable-next-line no-console
      console.log('[Casa dos Dados] /v4/dashboard/.../empresas-abertas/hoje →', r);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao consultar'),
  });

  const statusBadge = () => {
    if (!automation) return <Badge variant="outline">Não configurada</Badge>;
    if (automation.status === 'running') return <Badge className="bg-blue-600">Executando</Badge>;
    if (automation.status === 'error') return <Badge variant="destructive">Erro</Badge>;
    if (automation.enabled) return <Badge className="bg-green-600">Ativa</Badge>;
    return <Badge variant="secondary">Inativa</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Consulta Automática (Casa dos Dados)</h1>
        <p className="text-sm text-slate-600">
          Fase 1 — MEI aberto hoje, situação ATIVA, matriz, com e-mail. O worker roda em background via
          agendamento no banco de dados; a página não precisa ficar aberta.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-lg">{statusBadge()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Última execução</CardDescription>
            <CardTitle className="text-sm">
              {automation?.last_run_at
                ? new Date(automation.last_run_at).toLocaleString('pt-BR')
                : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Próxima execução</CardDescription>
            <CardTitle className="text-sm">
              {automation?.next_run_at
                ? new Date(automation.next_run_at).toLocaleString('pt-BR')
                : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Último erro</CardDescription>
            <CardTitle className="truncate text-sm text-red-600">
              {automation?.last_error ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>
            Modo atual: <strong>Empresas abertas hoje (recomendado)</strong>. Filtros avançados na Fase 2.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="mb-2 block">Quantidade por execução</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUANTITIES.map((q) => (
                <Button
                  key={q}
                  type="button"
                  size="sm"
                  variant={quantity === q ? 'default' : 'outline'}
                  onClick={() => setQuantity(q)}
                >
                  {q}
                </Button>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  className="w-32"
                  type="number"
                  min={1}
                  max={1000}
                  placeholder="personalizada"
                  value={customQuantity}
                  onChange={(e) => setCustomQuantity(e.target.value)}
                  onBlur={() => {
                    const n = Number(customQuantity);
                    if (Number.isFinite(n) && n >= 1 && n <= 1000) setQuantity(n);
                  }}
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Limite máximo desta fase: 1000 por execução.
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Intervalo entre execuções (minutos)</Label>
            <Input
              className="w-40"
              type="number"
              min={1}
              max={1440}
              value={interval}
              onChange={(e) => setIntervalMinutes(Number(e.target.value) || 60)}
            />
            <p className="mt-1 text-xs text-slate-500">Padrão: 60 (execução horária).</p>
          </div>

          <div>
            <Label className="mb-2 block">Filtros</Label>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                { key: 'only_mei', label: 'Somente MEI' },
                { key: 'only_active', label: 'Somente situação ATIVA' },
                { key: 'only_matriz', label: 'Somente matriz' },
                { key: 'require_email', label: 'Somente com e-mail' },
              ].map((f) => (
                <div
                  key={f.key}
                  className="flex items-center justify-between rounded border border-slate-200 p-2"
                >
                  <span className="text-sm">{f.label}</span>
                  <Switch
                    checked={(localFilters as any)[f.key]}
                    onCheckedChange={(v) =>
                      setLocalFilters((prev) => ({ ...prev, [f.key]: v }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {(() => {
            const hasAutomation = !!automation?.id;
            const isRunning = automation?.status === 'running';
            const anyPending =
              saveMut.isPending || enableMut.isPending || runMut.isPending;

            const runDisabledReason = !hasAutomation
              ? 'Salve a configuração para criar a automação.'
              : isRunning
                ? 'Já existe uma execução em andamento.'
                : runMut.isPending
                  ? 'Requisição em andamento…'
                  : anyPending
                    ? 'Aguarde a operação atual terminar.'
                    : null;

            return (
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col">
                  <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                    {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar configurações
                  </Button>
                </div>

                {hasAutomation && (
                  <div className="flex flex-col">
                    {automation!.enabled ? (
                      <Button
                        variant="outline"
                        onClick={() => enableMut.mutate(false)}
                        disabled={enableMut.isPending}
                      >
                        <PowerOff className="mr-2 h-4 w-4" />
                        Desativar automação
                      </Button>
                    ) : (
                      <Button
                        onClick={() => enableMut.mutate(true)}
                        disabled={enableMut.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Power className="mr-2 h-4 w-4" />
                        Ativar automação
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex flex-col">
                  <Button
                    variant="outline"
                    onClick={() => runMut.mutate(undefined)}
                    disabled={!!runDisabledReason}
                  >
                    {runMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Executar agora
                  </Button>
                  {runDisabledReason && (
                    <span className="mt-1 max-w-[220px] text-xs text-slate-500">{runDisabledReason}</span>
                  )}
                </div>

                <div className="flex flex-col">
                  <Button
                    variant="outline"
                    onClick={() => runMut.mutate(1)}
                    disabled={!!runDisabledReason}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Rodar teste com 1 empresa
                  </Button>
                  {runDisabledReason && (
                    <span className="mt-1 max-w-[220px] text-xs text-slate-500">{runDisabledReason}</span>
                  )}
                </div>

                <div className="flex flex-col">
                  <Button variant="secondary" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
                    <TestTube2 className="mr-2 h-4 w-4" />
                    Testar API (/v5/saldo)
                  </Button>
                </div>
                <div className="flex flex-col">
                  <Button variant="secondary" onClick={() => countMut.mutate()} disabled={countMut.isPending}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Quantidade de hoje
                  </Button>
                </div>
                <div className="flex flex-col">
                  <Button variant="ghost" onClick={() => stateQ.refetch()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Atualizar
                  </Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de execuções</CardTitle>
          <CardDescription>Últimas 20 execuções da automação.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma execução ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Início</th>
                    <th className="p-2">Origem</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Pedido</th>
                    <th className="p-2">API Total</th>
                    <th className="p-2">Importadas</th>
                    <th className="p-2">Duplicadas</th>
                    <th className="p-2">Links novos</th>
                    <th className="p-2">Links reutil.</th>
                    <th className="p-2">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r: any) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="p-2">{new Date(r.started_at).toLocaleString('pt-BR')}</td>
                      <td className="p-2">{r.trigger}</td>
                      <td className="p-2">
                        {r.status === 'ok' && <Badge className="bg-green-600">OK</Badge>}
                        {r.status === 'running' && <Badge className="bg-blue-600">Executando</Badge>}
                        {r.status === 'error' && <Badge variant="destructive">Erro</Badge>}
                      </td>
                      <td className="p-2">{r.requested_quantity ?? '—'}</td>
                      <td className="p-2">{r.api_total ?? '—'}</td>
                      <td className="p-2">{r.imported_count}</td>
                      <td className="p-2">{r.duplicate_count}</td>
                      <td className="p-2">{r.link_created_count}</td>
                      <td className="p-2">{r.link_reused_count}</td>
                      <td className="max-w-[260px] truncate p-2 text-xs text-red-600" title={r.error_message ?? ''}>
                        {r.error_message ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {runs[0]?.status === 'ok' && (
        <p className="text-xs text-slate-500">
          Formatação CNPJ de exemplo: <code>{formatCNPJ('12345678000199')}</code>
        </p>
      )}
    </div>
  );
}
