import { useState, useMemo, useRef } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import {
  Loader2,
  Play,
  Search,
  TestTube2,
  Calendar as CalendarIcon,
  RefreshCw,
  ListPlus,
  Wallet,
  StopCircle,
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
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { formatCNPJ } from '@/lib/format';
import { testApi, countByDateFn } from '@/lib/casa-dos-dados/automation.functions';
import {
  discoverList,
  importOne,
  getFlowStats,
  retryErrors,
} from '@/lib/casa-dos-dados/manual-flow.functions';

export const Route = createFileRoute('/_authenticated/painel/consulta-automatica')({
  head: () => ({ meta: [{ title: 'Consulta Casa dos Dados | Painel' }] }),
  component: ConsultaPage,
});

const QUICK_QUANTITIES = [1, 5, 10, 25, 50, 100];

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

type ImportLog = {
  ts: string;
  cnpj: string;
  ok: boolean;
  nome?: string;
  error?: string;
};

function ConsultaPage() {
  const qc = useQueryClient();
  const todayBR = todayBRString();

  const testFn = useServerFn(testApi);
  const countFn = useServerFn(countByDateFn);
  const discoverFn = useServerFn(discoverList);
  const importFn = useServerFn(importOne);
  const statsFn = useServerFn(getFlowStats);
  const retryFn = useServerFn(retryErrors);

  const [dateMode, setDateMode] = useState<'today' | 'specific'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(todayBR);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [filters, setFilters] = useState({
    only_mei: true,
    only_active: true,
    only_matriz: true,
    require_email: false,
  });

  const [maxDiscover, setMaxDiscover] = useState<number>(500);
  const [importCount, setImportCount] = useState<number>(10);
  const [importCustom, setImportCustom] = useState<string>('');

  const [countResult, setCountResult] = useState<null | {
    date: string;
    total: number | null;
    status: number;
    ok: boolean;
    checkedAt: string;
  }>(null);
  const [discoverResult, setDiscoverResult] = useState<null | {
    date: string;
    enqueued: number;
    duplicated: number;
    apiTotal: number | null;
  }>(null);

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const stopRequested = useRef(false);

  const effectiveDate = useMemo(
    () => (dateMode === 'today' ? todayBR : selectedDate || todayBR),
    [dateMode, selectedDate, todayBR],
  );

  const statsQ = useQuery({
    queryKey: ['casa-flow-stats'],
    queryFn: () => statsFn(),
    refetchInterval: importing ? 3000 : 8000,
  });

  const recentImportsQ = useQuery({
    queryKey: ['casa-recent-imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automatic_company_queue')
        .select(
          'id,query_date,created_at,cnpj,company_id,company_link_id,was_new_link,companies(id,nome_titular_exibicao,razao_social_original)',
        )
        .not('company_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: importing ? 3000 : 15000,
  });

  const byStatus = statsQ.data?.byStatus ?? {};
  const byDate = statsQ.data?.byDate ?? {};
  const dateStats = byDate[effectiveDate] ?? {};
  const readyToImport =
    (dateStats.discovered ?? 0) + (dateStats.pending_enrichment ?? 0);
  const importedForDate = dateStats.imported ?? 0;
  const errorForDate = dateStats.error ?? 0;

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.only_mei) parts.push('MEI');
    if (filters.only_active) parts.push('ATIVA');
    if (filters.only_matriz) parts.push('MATRIZ');
    if (filters.require_email) parts.push('com e-mail');
    return parts.length ? parts.join(', ') : 'nenhum';
  }, [filters]);

  const disableFuture = (d: Date) => dateToISO(d) > todayBR;

  // -------- MUTATIONS --------

  const testMut = useMutation({
    mutationFn: () => testFn({ data: undefined as any }),
    onSuccess: (r) => toast.info(`API respondeu com status ${r.status}`),
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao testar API'),
  });

  const countMut = useMutation({
    mutationFn: () =>
      countFn({ data: { queryDate: effectiveDate, filters } }),
    onSuccess: (r: any) => {
      setCountResult({
        date: r.date,
        total: r.total,
        status: r.status,
        ok: r.ok,
        checkedAt: r.checkedAt,
      });
      if (!r.ok) toast.error(`API retornou status ${r.status}`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao consultar'),
  });

  const discoverMut = useMutation({
    mutationFn: () =>
      discoverFn({
        data: { date: effectiveDate, filters, maxCnpjs: maxDiscover },
      }),
    onSuccess: (r) => {
      setDiscoverResult({
        date: r.date,
        enqueued: r.enqueued,
        duplicated: r.duplicated,
        apiTotal: r.apiTotal,
      });
      toast.success(
        `Descoberta concluída: ${r.enqueued} novos, ${r.duplicated} já existiam. Nenhum crédito consumido.`,
      );
      qc.invalidateQueries({ queryKey: ['casa-flow-stats'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao descobrir'),
  });

  const retryMut = useMutation({
    mutationFn: () => retryFn({ data: { date: effectiveDate } }),
    onSuccess: () => {
      toast.success('Registros com erro voltaram para a fila.');
      qc.invalidateQueries({ queryKey: ['casa-flow-stats'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro'),
  });

  const runImport = async (limit: number) => {
    if (limit < 1) return;
    setImporting(true);
    stopRequested.current = false;
    setImportProgress({ done: 0, total: limit, failed: 0 });
    setImportLogs([]);

    let done = 0;
    let failed = 0;

    for (let i = 0; i < limit; i += 1) {
      if (stopRequested.current) break;
      try {
        const r: any = await importFn({ data: { date: effectiveDate } });
        if (r?.ok === false && r.reason === 'empty') {
          toast.info('Fila vazia. Rode "Descobrir CNPJs" para pegar mais.');
          break;
        }
        if (r?.ok) {
          done += 1;
          setImportLogs((prev) => [
            { ts: new Date().toISOString(), cnpj: r.cnpj, ok: true, nome: r.nome },
            ...prev,
          ].slice(0, 50));
        } else {
          failed += 1;
          setImportLogs((prev) => [
            {
              ts: new Date().toISOString(),
              cnpj: r?.cnpj ?? '—',
              ok: false,
              error: r?.error ?? `${r?.reason ?? 'erro'} ${r?.status ?? ''}`,
            },
            ...prev,
          ].slice(0, 50));
        }
      } catch (e: any) {
        failed += 1;
        setImportLogs((prev) => [
          {
            ts: new Date().toISOString(),
            cnpj: '—',
            ok: false,
            error: e?.message ?? 'Erro',
          },
          ...prev,
        ].slice(0, 50));
      }
      setImportProgress({ done: done + failed, total: limit, failed });
      qc.invalidateQueries({ queryKey: ['casa-flow-stats'] });
      qc.invalidateQueries({ queryKey: ['casa-recent-imports'] });
    }

    setImporting(false);
    if (failed === 0 && done > 0) toast.success(`Importadas ${done} empresas (consumiu ${done} créditos).`);
    else if (done > 0) toast.warning(`Importadas ${done}, falhas: ${failed}.`);
    else if (failed > 0) toast.error(`Todas as ${failed} tentativas falharam.`);
  };

  const canDiscover = !discoverMut.isPending;
  const canImport = readyToImport > 0 && !importing;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Consulta Casa dos Dados</h1>
          <p className="text-sm text-slate-600">
            Fluxo em <strong>2 etapas</strong>: descobrir CNPJs de uma data (grátis) e depois
            importar 1-a-1 as empresas escolhidas (consome saldo).
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <WipeAllButton
            size="sm"
            label="Apagar resultados"
            title="Apagar toda a fila de descoberta?"
            description="Remove todos os CNPJs descobertos, importados ou com erro. Empresas e links já criados NÃO são afetados."
            steps={[
              {
                label: 'automatic_company_queue',
                run: () =>
                  supabase.from('automatic_company_queue').delete().neq('id', EMPTY_UUID),
              },
            ]}
            onDone={async () => {
              await qc.invalidateQueries({ queryKey: ['casa-flow-stats'] });
              await qc.invalidateQueries({ queryKey: ['casa-recent-imports'] });
              setDiscoverResult(null);
            }}
          />
        </div>
      </div>

      {/* Stats globais */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prontos p/ importar (total)</CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              {(byStatus.discovered ?? 0) + (byStatus.pending_enrichment ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Já importadas (total)</CardDescription>
            <CardTitle className="text-2xl text-green-600">{byStatus.imported ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com erro (total)</CardDescription>
            <CardTitle className="text-2xl text-red-600">{byStatus.error ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data em uso</CardDescription>
            <CardTitle className="text-lg">{formatBR(effectiveDate)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Configuração de data e filtros */}
      <Card>
        <CardHeader>
          <CardTitle>1. Escolher data e filtros</CardTitle>
          <CardDescription>
            Estas escolhas valem para as três ações: consultar quantidade, descobrir CNPJs e importar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="mb-2 block">Data</Label>
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
                  Hoje ({formatBR(todayBR)})
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
              </div>
            )}
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
                    checked={(filters as any)[f.key]}
                    onCheckedChange={(v) => setFilters((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Filtros ativos: <strong>{filtersSummary}</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => countMut.mutate()} disabled={countMut.isPending}>
              {countMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarIcon className="mr-2 h-4 w-4" />
              )}
              Consultar quantidade da data (grátis)
            </Button>
            <Button variant="ghost" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
              <Wallet className="mr-2 h-4 w-4" />
              Ver saldo API
            </Button>
          </div>

          {countResult && (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <div>
                <strong>Data:</strong> {formatBR(countResult.date)} —{' '}
                <strong>Total encontrado:</strong>{' '}
                {countResult.total !== null ? countResult.total.toLocaleString('pt-BR') : '—'}{' '}
                <Badge className={countResult.ok ? 'bg-green-600' : 'bg-red-600'}>
                  HTTP {countResult.status}
                </Badge>
              </div>
              <div className="text-xs text-slate-500">
                Consultado às{' '}
                {new Date(countResult.checkedAt).toLocaleTimeString('pt-BR', {
                  timeZone: 'America/Sao_Paulo',
                })}{' '}
                — nenhum crédito consumido.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Descoberta */}
      <Card>
        <CardHeader>
          <CardTitle>
            2. Descobrir CNPJs <Badge className="ml-2 bg-slate-500">Grátis</Badge>
          </CardTitle>
          <CardDescription>
            Busca a lista de CNPJs da data e coloca na fila para importar depois. Não consome saldo
            porque não pega os dados completos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Quantos CNPJs no máximo?</Label>
            <div className="flex flex-wrap gap-2">
              {[50, 100, 250, 500, 1000, 2000].map((q) => (
                <Button
                  key={q}
                  type="button"
                  size="sm"
                  variant={maxDiscover === q ? 'default' : 'outline'}
                  onClick={() => setMaxDiscover(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => discoverMut.mutate()}
              disabled={!canDiscover}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {discoverMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Descobrir CNPJs ({formatBR(effectiveDate)})
            </Button>

            <Button
              variant="outline"
              onClick={() => runImport(1)}
              disabled={importing}
              title="Faz uma descoberta + tentativa de importação limitada a 1 CNPJ, útil pra validar o fluxo."
            >
              <TestTube2 className="mr-2 h-4 w-4" /> Rodar teste com 1 empresa
            </Button>
          </div>

          {discoverResult && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
              <div>
                <strong>Data:</strong> {formatBR(discoverResult.date)} —{' '}
                <strong>Total na API:</strong>{' '}
                {discoverResult.apiTotal?.toLocaleString('pt-BR') ?? '—'}
              </div>
              <div>
                Novos na fila: <strong>{discoverResult.enqueued}</strong> · Já existiam:{' '}
                <strong>{discoverResult.duplicated}</strong>
              </div>
              <div className="text-xs text-slate-600">Nenhum crédito consumido.</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Importação */}
      <Card>
        <CardHeader>
          <CardTitle>
            3. Importar empresas <Badge className="ml-2 bg-red-600">Consome saldo</Badge>
          </CardTitle>
          <CardDescription>
            Cada empresa importada = 1 crédito da Casa dos Dados. Importa 1-a-1 na ordem da fila,
            criando empresa completa e link público automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border p-3">
              <div className="text-xs text-slate-500">Prontos para importar ({formatBR(effectiveDate)})</div>
              <div className="text-2xl font-bold text-blue-600">{readyToImport}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-slate-500">Importadas ({formatBR(effectiveDate)})</div>
              <div className="text-2xl font-bold text-green-600">{importedForDate}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-slate-500">Com erro ({formatBR(effectiveDate)})</div>
              <div className="text-2xl font-bold text-red-600">{errorForDate}</div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Quantas importar agora?</Label>
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_QUANTITIES.map((q) => (
                <Button
                  key={q}
                  type="button"
                  size="sm"
                  variant={importCount === q ? 'default' : 'outline'}
                  onClick={() => setImportCount(q)}
                >
                  {q}
                </Button>
              ))}
              <Input
                className="w-32"
                type="number"
                min={1}
                max={1000}
                placeholder="personalizada"
                value={importCustom}
                onChange={(e) => setImportCustom(e.target.value)}
                onBlur={() => {
                  const n = Number(importCustom);
                  if (Number.isFinite(n) && n >= 1 && n <= 1000) setImportCount(n);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setImportCount(readyToImport)}
                disabled={readyToImport === 0}
              >
                Todas ({readyToImport})
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => runImport(Math.min(importCount, readyToImport))}
              disabled={!canImport}
              className="bg-red-600 hover:bg-red-700"
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Executar agora — Importar {Math.min(importCount, readyToImport)}
            </Button>

            {importing && (
              <Button
                variant="outline"
                onClick={() => {
                  stopRequested.current = true;
                  toast.info('Parada solicitada — vai terminar a empresa atual.');
                }}
              >
                <StopCircle className="mr-2 h-4 w-4" /> Parar
              </Button>
            )}

            {errorForDate > 0 && !importing && (
              <Button variant="outline" onClick={() => retryMut.mutate()} disabled={retryMut.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reenviar {errorForDate} com erro para a fila
              </Button>
            )}
          </div>

          {(importing || importProgress.total > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Progresso: <strong>{importProgress.done}</strong> / {importProgress.total}
                  {importProgress.failed > 0 && (
                    <span className="text-red-600"> ({importProgress.failed} falhas)</span>
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  Saldo consumido nesta rodada:{' '}
                  {importProgress.done - importProgress.failed}
                </span>
              </div>
              <Progress value={(importProgress.done / Math.max(1, importProgress.total)) * 100} />
            </div>
          )}

          {importLogs.length > 0 && (
            <div className="rounded border">
              <div className="border-b bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
                Últimas importações
              </div>
              <ul className="max-h-64 divide-y overflow-y-auto text-sm">
                {importLogs.map((l, i) => (
                  <li key={`${l.ts}-${i}`} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="font-mono text-xs">{formatCNPJ(l.cnpj)}</div>
                      {l.ok ? (
                        <div className="text-xs text-slate-600">{l.nome}</div>
                      ) : (
                        <div className="text-xs text-red-600">{l.error}</div>
                      )}
                    </div>
                    {l.ok ? (
                      <Badge className="bg-green-600">Importada</Badge>
                    ) : (
                      <Badge variant="destructive">Erro</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Últimos registros importados</CardTitle>
            <CardDescription>Os 10 mais recentes.</CardDescription>
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
                  </tr>
                </thead>
                <tbody>
                  {(recentImportsQ.data ?? []).map((q: any) => {
                    const c = q.companies;
                    const nome = c
                      ? (
                          (c.nome_titular_exibicao || c.razao_social_original || '').replace(
                            /^\d+[.\-/\s]*/,
                            '',
                          ).trim() || '—'
                        )
                      : '—';
                    return (
                      <tr key={q.id} className="border-t border-slate-100">
                        <td className="p-2 font-medium">{nome}</td>
                        <td className="p-2 font-mono text-xs">{formatCNPJ(q.cnpj)}</td>
                        <td className="p-2">{formatBR(q.query_date)}</td>
                        <td className="p-2">
                          {q.company_link_id ? (
                            <Badge className="bg-green-600">Com link</Badge>
                          ) : (
                            <Badge variant="secondary">Sem link</Badge>
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
    </div>
  );
}
