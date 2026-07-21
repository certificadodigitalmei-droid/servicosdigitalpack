import { useState, useEffect, useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import {
  Loader2,
  Play,
  Power,
  PowerOff,
  Save,
  TestTube2,
  Calendar as CalendarIcon,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { formatCNPJ } from '@/lib/format';
import {
  getAutomationState,
  upsertAutomation,
  setAutomationEnabled,
  runAutomationNow,
  testApi,
  countByDateFn,
} from '@/lib/casa-dos-dados/automation.functions';

export const Route = createFileRoute('/_authenticated/painel/consulta-automatica')({
  head: () => ({ meta: [{ title: 'Consulta Automática | Painel' }] }),
  component: ConsultaAutomaticaPage,
});

const QUICK_QUANTITIES = [1, 5, 10, 20, 50, 100, 500];

function todayBRString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatBR(dateISO: string | null | undefined): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return '—';
  const [y, m, d] = dateISO.split('-');
  return `${d}/${m}/${y}`;
}

function dateToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function ConsultaAutomaticaPage() {
  const qc = useQueryClient();
  const getState = useServerFn(getAutomationState);
  const upsertFn = useServerFn(upsertAutomation);
  const enableFn = useServerFn(setAutomationEnabled);
  const runFn = useServerFn(runAutomationNow);
  const testFn = useServerFn(testApi);
  const countFn = useServerFn(countByDateFn);

  const stateQ = useQuery({
    queryKey: ['casa-automation-state'],
    queryFn: () => getState(),
    refetchInterval: 5000,
  });

  const recentImportsQ = useQuery({
    queryKey: ['casa-recent-imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automatic_company_queue')
        .select('id,query_date,created_at,cnpj,company_id,company_link_id,was_new_link,companies(id,nome_titular_exibicao,razao_social_original)')
        .not('company_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const automation = (stateQ.data?.automation ?? null) as any;
  const runs = stateQ.data?.runs ?? [];
  const todayBR = stateQ.data?.todayBR ?? todayBRString();

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
  const [dateMode, setDateMode] = useState<'today' | 'specific'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(todayBR);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [autoImport, setAutoImport] = useState<boolean>(true);
  const [autoLinks, setAutoLinks] = useState<boolean>(true);
  const [lastRunSummary, setLastRunSummary] = useState<any | null>(null);

  useEffect(() => {
    if (automation) {
      setQuantity(automation.quantity_per_run);
      setIntervalMinutes(automation.interval_minutes);
      setLocalFilters({
        only_mei: !!filters.only_mei,
        only_active: !!filters.only_active,
        only_matriz: !!filters.only_matriz,
        require_email: !!filters.require_email,
      });
      const mode = automation.query_date_mode === 'specific' ? 'specific' : 'today';
      setDateMode(mode);
      setSelectedDate(automation.selected_query_date ?? todayBR);
      setAutoImport(automation.auto_import_enabled ?? true);
      setAutoLinks(automation.auto_generate_links_enabled ?? true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automation?.id]);

  // Enforce: cannot enable links without import
  useEffect(() => {
    if (!autoImport && autoLinks) setAutoLinks(false);
  }, [autoImport, autoLinks]);

  const effectiveDate = useMemo(
    () => (dateMode === 'today' ? todayBR : selectedDate || todayBR),
    [dateMode, selectedDate, todayBR],
  );

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (localFilters.only_mei) parts.push('MEI');
    if (localFilters.only_active) parts.push('ATIVA');
    if (localFilters.only_matriz) parts.push('MATRIZ');
    if (localFilters.require_email) parts.push('com e-mail');
    return parts.length ? parts.join(', ') : 'nenhum';
  }, [localFilters]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          quantity_per_run: quantity,
          interval_minutes: interval,
          filters: localFilters,
          query_date_mode: dateMode,
          selected_query_date: dateMode === 'specific' ? selectedDate : null,
          auto_import_enabled: autoImport,
          auto_generate_links_enabled: autoLinks && autoImport,
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
      toast.success(
        enabled
          ? 'Automação ativada — trabalhando sempre em "Hoje"'
          : 'Automação desativada',
      );
      qc.invalidateQueries({ queryKey: ['casa-automation-state'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro'),
  });

  const runMut = useMutation({
    mutationFn: (overrideQuantity?: number) =>
      runFn({
        data: {
          id: automation!.id,
          overrideQuantity,
          queryDate: effectiveDate,
        },
      }),
    onSuccess: (r: any) => {
      if (r?.ok === false && r?.reason === 'already_running') {
        toast.warning('Já existe uma execução em andamento');
      } else if (r?.outcome?.status === 'error') {
        toast.error(`Erro na execução: ${r.outcome.error}`);
      } else {
        toast.success(
          `Execução concluída (${formatBR(r.queryDate)}): ${r.outcome.imported} importada(s), ${r.outcome.duplicated} duplicada(s)`,
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
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao testar API'),
  });

  const [countResult, setCountResult] = useState<null | {
    date: string;
    total: number | null;
    status: number;
    ok: boolean;
    checkedAt: string;
    filters: typeof localFilters;
    error?: string;
  }>(null);

  const countMut = useMutation({
    mutationFn: () =>
      countFn({
        data: {
          queryDate: effectiveDate,
          filters: localFilters,
        },
      }),
    onSuccess: (r: any) => {
      setCountResult({
        date: r.date,
        total: r.total,
        status: r.status,
        ok: r.ok,
        checkedAt: r.checkedAt,
        filters: r.filters,
      });
      if (!r.ok) toast.error(`API retornou status ${r.status}`);
    },
    onError: (e: any) => {
      setCountResult({
        date: effectiveDate,
        total: null,
        status: 0,
        ok: false,
        checkedAt: new Date().toISOString(),
        filters: localFilters,
        error: e?.message ?? 'Erro',
      });
      toast.error(e?.message ?? 'Erro ao consultar');
    },
  });

  const statusBadge = () => {
    if (!automation) return <Badge variant="outline">Não configurada</Badge>;
    if (automation.status === 'running') return <Badge className="bg-blue-600">Executando</Badge>;
    if (automation.status === 'error') return <Badge variant="destructive">Erro</Badge>;
    if (automation.enabled) return <Badge className="bg-green-600">Ativa</Badge>;
    return <Badge variant="secondary">Inativa</Badge>;
  };

  const disableFuture = (d: Date) => {
    const iso = dateToISO(d);
    return iso > todayBR;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Consulta Automática (Casa dos Dados)</h1>
        <p className="text-sm text-slate-600">
          Consulta empresas abertas em uma data (padrão: hoje, fuso America/Sao_Paulo). A
          automação horária só trabalha no modo <strong>Hoje</strong>.
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
            Modo atual: <strong>Empresas abertas na data selecionada</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data da consulta */}
          <div>
            <Label className="mb-2 block">Data da consulta</Label>
            <RadioGroup
              value={dateMode}
              onValueChange={(v) => {
                const m = v as 'today' | 'specific';
                setDateMode(m);
                if (m === 'today') setSelectedDate(todayBR);
              }}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="today" id="mode-today" />
                <Label htmlFor="mode-today" className="cursor-pointer font-normal">
                  Hoje — recomendada ({formatBR(todayBR)})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="specific" id="mode-specific" />
                <Label htmlFor="mode-specific" className="cursor-pointer font-normal">
                  Escolher outra data
                </Label>
              </div>
            </RadioGroup>

            {dateMode === 'specific' && (
              <div className="mt-3">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[260px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? formatBR(selectedDate) : 'Selecione uma data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate ? isoToDate(selectedDate) : undefined}
                      onSelect={(d) => {
                        if (d) {
                          setSelectedDate(dateToISO(d));
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={disableFuture}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
                <p className="mt-1 text-xs text-amber-700">
                  Consultar uma data histórica pode consumir uma chamada da API.
                </p>
              </div>
            )}
          </div>

          {/* Quantidade */}
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
            <p className="mt-1 text-xs text-slate-500">Limite máximo desta fase: 1000 por execução.</p>
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
            <p className="mt-1 text-xs text-slate-500">
              Padrão: 60 (execução horária). A automação horária só roda no modo <strong>Hoje</strong>.
            </p>
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

          {/* Resumo antes de executar */}
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <div><strong>Consulta:</strong> {formatBR(effectiveDate)}{dateMode === 'today' ? ' (hoje)' : ''}</div>
            <div><strong>Quantidade por execução:</strong> {quantity}</div>
            <div><strong>Filtros:</strong> {filtersSummary}</div>
          </div>

          {(() => {
            const hasAutomation = !!automation?.id;
            const isRunning = automation?.status === 'running';
            const anyPending = saveMut.isPending || enableMut.isPending || runMut.isPending;

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
                        Ativar automação (Hoje)
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
                    Executar agora ({formatBR(effectiveDate)})
                  </Button>
                  {runDisabledReason && (
                    <span className="mt-1 max-w-[240px] text-xs text-slate-500">{runDisabledReason}</span>
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
                    <span className="mt-1 max-w-[240px] text-xs text-slate-500">{runDisabledReason}</span>
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
                    {countMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarIcon className="mr-2 h-4 w-4" />}
                    Consultar quantidade da data
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

      {/* Card de resultado da contagem */}
      {countResult && (
        <Card>
          <CardHeader>
            <CardTitle>Quantidade encontrada</CardTitle>
            <CardDescription>
              Consulta apenas de contagem — não importa empresa, não gera token, não gera link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><strong>Data:</strong> {formatBR(countResult.date)}</div>
            <div>
              <strong>Total com os filtros atuais:</strong>{' '}
              {countResult.total !== null ? countResult.total.toLocaleString('pt-BR') : '—'}
            </div>
            <div>
              <strong>Consultado às:</strong>{' '}
              {new Date(countResult.checkedAt).toLocaleTimeString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
              })}
            </div>
            <div>
              <strong>Status:</strong>{' '}
              {countResult.status ? `HTTP ${countResult.status}` : '—'}{' '}
              {countResult.ok ? (
                <Badge className="bg-green-600">OK</Badge>
              ) : (
                <Badge variant="destructive">Falha</Badge>
              )}
            </div>
            <div>
              <strong>Filtros aplicados:</strong>{' '}
              {[
                countResult.filters.only_mei && 'MEI',
                countResult.filters.only_active && 'ATIVA',
                countResult.filters.only_matriz && 'MATRIZ',
                countResult.filters.require_email && 'com e-mail',
              ]
                .filter(Boolean)
                .join(', ') || 'nenhum'}
            </div>
            {countResult.error && (
              <div className="text-red-600">
                <strong>Erro:</strong> {countResult.error}
              </div>
            )}
            {countResult.ok && countResult.total === 0 && (
              <div className="rounded bg-amber-50 p-2 text-amber-800">
                Nenhuma empresa foi encontrada nessa data com os filtros selecionados.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Últimos registros importados</CardTitle>
            <CardDescription>5 empresas mais recentes vindas da automação.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/painel/empresas-importadas">Ver todas as empresas</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/painel/links-gerados">Ver todos os links</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(recentImportsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum registro importado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Empresa</th>
                    <th className="p-2">CNPJ</th>
                    <th className="p-2">Data consultada</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Link</th>
                    <th className="p-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentImportsQ.data ?? []).map((q: any) => {
                    const c = q.companies;
                    const nome = c ? ((c.nome_titular_exibicao || c.razao_social_original || '').replace(/^\d+[.\-/\s]*/, '').trim() || '—') : '—';
                    return (
                      <tr key={q.id} className="border-t border-slate-100">
                        <td className="p-2 font-medium">{nome}</td>
                        <td className="p-2 font-mono text-xs">{formatCNPJ(q.cnpj)}</td>
                        <td className="p-2">{formatBR(q.query_date)}</td>
                        <td className="p-2">
                          {q.company_link_id
                            ? <Badge className="bg-green-600">Importada</Badge>
                            : <Badge variant="secondary">Sem link</Badge>}
                        </td>
                        <td className="p-2">{q.was_new_link ? 'Novo' : 'Reutilizado'}</td>
                        <td className="p-2 text-right">
                          {q.company_id && (
                            <Button asChild size="sm" variant="ghost">
                              <Link to="/painel/empresas-importadas/$companyId" params={{ companyId: q.company_id }}>
                                Ver
                              </Link>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                    <th className="p-2">Data consultada</th>
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
                      <td className="p-2">{formatBR(r.query_date)}</td>
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
