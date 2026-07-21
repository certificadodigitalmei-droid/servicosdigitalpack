import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2,
  Play,
  Calendar as CalendarIcon,
  Wallet,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { formatCNPJ } from '@/lib/format';
import { getSaldo } from '@/lib/casa-dos-dados/simple-flow.functions';
import { List, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/automation/store';
import {
  consultaStore,
  setAutoCount,
  setAutoImport,
  setAutoIntervalSec,
  setAutoImportDelaySec,
  setAutoImportTarget,
  setDateMode,
  setSelectedDate,
  setFilters,
  setQuantidade,
  setListDialogOpen,
  clearFoundList,
  setSaldo as setSaldoAction,
  runCountOnce,
  runImportOnce,
} from '@/lib/automation/consulta-engine';

export const Route = createFileRoute('/_authenticated/painel/consulta-automatica')({
  head: () => ({ meta: [{ title: 'Consulta Casa dos Dados | Painel' }] }),
  component: ConsultaPage,
});

const QUANTIDADES = [1, 5, 10, 15];

function todayBRString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatBR(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-');
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

function ConsultaPage() {
  const qc = useQueryClient();
  const todayBR = todayBRString();

  // Reads reativos da engine global (persistem entre abas).
  const dateMode = useStore(consultaStore, (s) => s.dateMode);
  const selectedDate = useStore(consultaStore, (s) => s.selectedDate);
  const filters = useStore(consultaStore, (s) => s.filters);
  const quantidade = useStore(consultaStore, (s) => s.quantidade);
  const autoCount = useStore(consultaStore, (s) => s.autoCount);
  const autoIntervalSec = useStore(consultaStore, (s) => s.autoIntervalSec);
  const autoImport = useStore(consultaStore, (s) => s.autoImport);
  const autoImportDelaySec = useStore(consultaStore, (s) => s.autoImportDelaySec);
  const autoStats = useStore(consultaStore, (s) => s.autoStats);
  const autoImportRuns = useStore(consultaStore, (s) => s.autoImportRuns);
  const autoImportTotal = useStore(consultaStore, (s) => s.autoImportTotal);
  const foundList = useStore(consultaStore, (s) => s.foundList);
  const importedRows = useStore(consultaStore, (s) => s.importedRows);
  const failedRows = useStore(consultaStore, (s) => s.failedRows);
  const importedSetArr = useStore(consultaStore, (s) => s.importedSet);
  const countResult = useStore(consultaStore, (s) => s.countResult);
  const saldo = useStore(consultaStore, (s) => s.saldo);
  const isCounting = useStore(consultaStore, (s) => s.isCounting);
  const isImporting = useStore(consultaStore, (s) => s.isImporting);
  const flashes = useStore(consultaStore, (s) => s.flashes);
  const listDialogOpen = useStore(consultaStore, (s) => s.listDialogOpen);

  const importedSet = useMemo(() => new Set(importedSetArr), [importedSetArr]);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saldoLoading, setSaldoLoading] = useState(false);

  // Abre o painel flutuante automaticamente quando o modo automático liga.
  useEffect(() => {
    if (autoCount && !listDialogOpen) setListDialogOpen(true);
  }, [autoCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveDate = dateMode === 'today' ? todayBR : selectedDate || todayBR;

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.only_mei) parts.push('MEI');
    if (filters.only_active) parts.push('ATIVA');
    if (filters.only_matriz) parts.push('MATRIZ');
    if (filters.require_email) parts.push('com e-mail');
    return parts.length ? parts.join(', ') : 'nenhum';
  }, [filters]);

  const disableFuture = (d: Date) => dateToISO(d) > todayBR;

  const onSaldo = async () => {
    setSaldoLoading(true);
    try {
      const r: any = await getSaldo();
      setSaldoAction(r.body ?? '(sem corpo)');
      if (!r.ok) toast.error(`API respondeu ${r.status}`);
      else toast.success('Saldo consultado.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro');
    } finally {
      setSaldoLoading(false);
    }
  };

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.success('Copiado');
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Consulta Casa dos Dados</h1>
          <p className="text-sm text-slate-600">
            Escolha a data, quantos CNPJs quer importar e clique em <strong>Importar agora</strong>.
            Cada CNPJ importado consome <strong>1 crédito</strong> da sua conta Casa dos Dados.
          </p>
          {(autoCount || autoImport) && (
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              ● Automação ativa — continua rodando mesmo se você trocar de aba.
            </p>
          )}
        </div>
        <WipeAllButton
          size="sm"
          label="Apagar histórico"
          title="Apagar toda a fila?"
          description="Remove os registros de descoberta antigos. Empresas e links criados NÃO são apagados por aqui."
          steps={[
            {
              label: 'automatic_company_queue',
              run: () =>
                supabase.from('automatic_company_queue').delete().neq('id', EMPTY_UUID),
            },
          ]}
          onDone={async () => {
            await qc.invalidateQueries();
          }}
        />
      </div>

      {/* 1. Data + filtros */}
      <Card>
        <CardHeader>
          <CardTitle>1. Data e filtros</CardTitle>
          <CardDescription>
            Empresas abertas na data escolhida. Consultar a quantidade é <strong>grátis</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="mb-2 block">Data de abertura</Label>
            <RadioGroup
              value={dateMode}
              onValueChange={(v) => setDateMode(v as 'today' | 'specific')}
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
                    <Button
                      variant="outline"
                      className="w-[260px] justify-start text-left font-normal"
                    >
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
                { key: 'only_active', label: 'Somente ATIVA' },
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
                    onCheckedChange={(v) => setFilters({ [f.key]: v } as any)}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Filtros ativos: <strong>{filtersSummary}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => runCountOnce()}
              disabled={isCounting || autoCount}
            >
              {isCounting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarIcon className="mr-2 h-4 w-4" />
              )}
              Consultar quantidade (grátis)
            </Button>
            <Button variant="ghost" onClick={onSaldo} disabled={saldoLoading}>
              {saldoLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="mr-2 h-4 w-4" />
              )}
              Ver saldo da API
            </Button>
          </div>

          {/* Modo automático — polling grátis, sem parar */}
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <Label htmlFor="auto-count" className="font-medium flex items-center gap-2">
                  {autoCount && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                    </span>
                  )}
                  Modo automático (consulta sem parar)
                </Label>
                <p className="text-xs text-slate-600">
                  Fica consultando sozinho — continua rodando mesmo se você mudar de aba.
                </p>
              </div>
              <Switch id="auto-count" checked={autoCount} onCheckedChange={setAutoCount} />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-interval" className="text-xs whitespace-nowrap">
                Intervalo (seg):
              </Label>
              <input
                id="auto-interval"
                type="number"
                min={5}
                max={600}
                value={autoIntervalSec}
                onChange={(e) => setAutoIntervalSec(Number(e.target.value))}
                className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
              />
              <span className="text-xs text-slate-500">mín. 5 seg</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setListDialogOpen(true)}
              >
                <List className="mr-1 h-4 w-4" />
                Ver lista de CNPJs ({foundList.length})
              </Button>
              {foundList.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm('Limpar a lista salva desta data + filtros?')) {
                      clearFoundList();
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Limpar lista salva
                </Button>
              )}
              <span className="text-xs text-slate-500">
                Salva no navegador por data + filtros.
              </span>
            </div>
          </div>

          {countResult && (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
              <div>
                <strong>Data:</strong> {formatBR(countResult.date)} —{' '}
                <strong>Total encontrado:</strong>{' '}
                <span className="text-lg font-bold text-brand-navy">
                  {countResult.total !== null
                    ? countResult.total.toLocaleString('pt-BR')
                    : '—'}
                </span>{' '}
                <Badge className={countResult.ok ? 'bg-green-600' : 'bg-red-600'}>
                  HTTP {countResult.status}
                </Badge>
                {autoStats.delta > 0 && (
                  <Badge className="ml-2 bg-emerald-600 animate-pulse">
                    +{autoStats.delta} novas
                  </Badge>
                )}
              </div>
              {autoCount && (
                <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  <div>Consultas feitas: <strong>{autoStats.checks}</strong></div>
                  <div>
                    Pico da sessão:{' '}
                    <strong>
                      {autoStats.peak != null
                        ? autoStats.peak.toLocaleString('pt-BR')
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    Última verificação:{' '}
                    <strong>
                      {autoStats.lastCheckAt
                        ? new Date(autoStats.lastCheckAt).toLocaleTimeString('pt-BR')
                        : '—'}
                    </strong>
                  </div>
                  <div>Próxima em: <strong>~{autoIntervalSec}s</strong></div>
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500">Nenhum crédito consumido.</p>
            </div>
          )}

          {saldo && (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs">
              <strong>Saldo:</strong>{' '}
              <code className="break-all">{saldo}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Importar */}
      <Card>
        <CardHeader>
          <CardTitle>
            2. Importar agora <Badge className="ml-2 bg-red-600">Paga créditos</Badge>
          </CardTitle>
          <CardDescription>
            Uma única chamada busca N CNPJs completos, salva as empresas e gera os links.
            Cada CNPJ consome 1 crédito. Máx. por lote: <strong>15</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Quantidade</Label>
            <div className="flex flex-wrap gap-2">
              {QUANTIDADES.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={quantidade === n ? 'default' : 'outline'}
                  onClick={() => setQuantidade(n)}
                  disabled={isImporting}
                >
                  {n}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Vai consumir até <strong>{quantidade} créditos</strong> da Casa dos Dados
              nesta ação.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => runImportOnce()}
              disabled={isImporting}
              className="bg-brand-navy hover:bg-brand-navy/90"
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Importar {quantidade} empresa(s) agora
            </Button>
          </div>

          {isImporting && (
            <p className="text-sm text-slate-600">
              Aguarde… a chamada pode levar de 5 a 30 segundos.
            </p>
          )}

          {/* Importação automática */}
          <div className="mt-4 rounded-lg border-2 border-dashed border-brand-navy/40 bg-brand-navy/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-brand-navy">Importar automático</span>
                  {autoImport && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  Fica importando sozinho — continua ativo mesmo em outras abas do painel.
                  <strong> Consome créditos.</strong> CNPJs repetidos são ignorados.
                </p>
              </div>
              <Switch
                checked={autoImport}
                onCheckedChange={setAutoImport}
                aria-label="Ativar importação automática"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label className="mb-1 block text-xs">Delay entre importações (segundos)</Label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={autoImportDelaySec}
                  onChange={(e) => setAutoImportDelaySec(Number(e.target.value))}
                  disabled={autoImport}
                  className="h-9 w-32 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                />
              </div>
              <div className="text-xs text-slate-600">
                A cada ciclo: <strong>{quantidade}</strong> tentativa(s) · a cada{' '}
                <strong>{autoImportDelaySec}s</strong>
              </div>
            </div>

            {autoImport && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Ciclos" value={autoImportRuns.toString()} />
                <Stat label="Importadas (sessão)" value={autoImportTotal.toString()} />
                <Stat label="Créditos máx/ciclo" value={quantidade.toString()} />
                <Stat
                  label="Próximo em"
                  value={isImporting ? 'rodando…' : `~${autoImportDelaySec}s`}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Resultado do último lote */}
      {(importedRows.length > 0 || failedRows.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado do último lote</CardTitle>
            <CardDescription>
              {importedRows.length} importada(s), {failedRows.length} falha(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {importedRows.map((row) => (
              <div
                key={row.cnpj}
                className="flex flex-col gap-2 rounded border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <strong className="truncate">{row.nome}</strong>
                    {row.isNewCompany ? (
                      <Badge className="bg-blue-600">NOVA</Badge>
                    ) : (
                      <Badge variant="outline">atualizada</Badge>
                    )}
                    {row.isNewLink && <Badge className="bg-purple-600">novo link</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    CNPJ: {formatCNPJ(row.cnpj)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(row.publicUrl)}>
                    <Copy className="mr-1 h-3 w-3" /> Link público
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copy(row.checkoutUrl)}>
                    <Copy className="mr-1 h-3 w-3" /> Checkout
                  </Button>
                  <a href={row.publicUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">
                      <ExternalLink className="mr-1 h-3 w-3" /> Abrir
                    </Button>
                  </a>
                </div>
              </div>
            ))}
            {failedRows.map((row, i) => (
              <div
                key={`f-${i}`}
                className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm"
              >
                <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                <div className="min-w-0">
                  <div><strong>{formatCNPJ(row.cnpj)}</strong></div>
                  <div className="text-xs text-red-700">{row.error}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Painel flutuante de CNPJs montado globalmente em _authenticated.painel.tsx */}
    </div>
  );
}

function DraggableCnpjPanel(props: {
  onClose: () => void;
  autoCount: boolean;
  dateLabel: string;
  savedCount: number;
  apiTotal: number | null;
  foundList: Array<{
    cnpj: string;
    nome: string;
    fantasia: string | null;
    uf: string | null;
    municipio: string | null;
    firstSeenAt: string;
  }>;
  flashes: Array<{ id: number; count: number }>;
  importedSet: Set<string>;
  onCopy: (v: string) => void | Promise<void>;
}) {
  const { onClose, autoCount, dateLabel, savedCount, apiTotal, foundList, flashes, importedSet, onCopy } = props;

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 720, h: 560 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (pos != null) return;
    const w = Math.min(720, window.innerWidth - 40);
    const h = Math.min(560, window.innerHeight - 80);
    setSize({ w, h });
    setPos({ x: Math.max(20, (window.innerWidth - w) / 2), y: Math.max(20, (window.innerHeight - h) / 2) });
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragRef.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragRef.current.dy)),
      });
    };
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if (!pos) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    document.body.style.userSelect = 'none';
  };

  if (!pos) return null;

  return (
    <div
      className="fixed z-50 flex flex-col rounded-2xl border border-slate-200/70 bg-white/95 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.35)] backdrop-blur-xl resize overflow-hidden ring-1 ring-black/5"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, minWidth: 380, minHeight: 300 }}
    >
      {/* Flashes de novos CNPJs */}
      <div className="pointer-events-none absolute -top-2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1">
        {flashes.map((f) => (
          <div
            key={f.id}
            className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/40 animate-in fade-in slide-in-from-bottom-2"
          >
            +{f.count} novo{f.count === 1 ? '' : 's'} CNPJ{f.count === 1 ? '' : 's'}
          </div>
        ))}
      </div>

      {/* Cabeçalho gradiente arrastável */}
      <div
        onMouseDown={startDrag}
        className="cursor-move select-none bg-gradient-to-r from-brand-navy via-slate-800 to-brand-navy px-4 py-3 text-white"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
              {autoCount ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">
                CNPJs encontrados
              </div>
              <div className="text-[11px] text-white/70">
                {dateLabel} · {autoCount ? 'monitorando ao vivo' : 'monitor pausado'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Mini estatísticas */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Salvos</div>
            <div className="text-base font-bold tabular-nums">{savedCount}</div>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Total API</div>
            <div className="text-base font-bold tabular-nums">
              {apiTotal != null ? apiTotal.toLocaleString('pt-BR') : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Importados</div>
            <div className="text-base font-bold tabular-nums text-red-200">
              {foundList.filter((f) => importedSet.has(f.cnpj)).length}
            </div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto bg-slate-50/40">
        {foundList.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
              <List className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-slate-700">
              Nenhum CNPJ ainda
            </div>
            <div className="text-xs text-slate-500">
              Ligue o <strong>Modo automático</strong> — os CNPJs aparecem aqui em tempo real.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {foundList.map((it) => {
              const isImported = importedSet.has(it.cnpj);
              return (
                <li
                  key={it.cnpj}
                  className={cn(
                    'group flex items-start justify-between gap-3 px-4 py-3 transition',
                    isImported ? 'bg-red-50/70' : 'hover:bg-white',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold tabular-nums',
                          isImported ? 'text-red-700 line-through decoration-red-400/60' : 'text-slate-900',
                        )}
                      >
                        {formatCNPJ(it.cnpj)}
                      </span>
                      {isImported && (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          Importado
                        </span>
                      )}
                    </div>
                    <div className={cn('mt-0.5 truncate text-sm', isImported ? 'text-red-800/80' : 'text-slate-700')}>
                      {it.nome}
                    </div>
                    {(it.municipio || it.uf) && (
                      <div className={cn('mt-0.5 text-xs', isImported ? 'text-red-600/80' : 'text-slate-500')}>
                        📍 {[it.municipio, it.uf].filter(Boolean).join(' / ')}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {new Date(it.firstSeenAt).toLocaleTimeString('pt-BR')}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 opacity-70 transition group-hover:opacity-100"
                      onClick={() => onCopy(it.cnpj)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Rodapé */}
      <div className="border-t border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          ✋ Arraste o topo · ↘ redimensione pelo canto · 💾 salvo no navegador
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-bold text-brand-navy">{value}</div>
    </div>
  );
}
