import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
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
import {
  getSaldo,
  countByDate,
  importBatch,
  listByDate,
} from '@/lib/casa-dos-dados/simple-flow.functions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { List, Trash2 } from 'lucide-react';

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

type ImportedRow = {
  cnpj: string;
  nome: string;
  publicUrl: string;
  checkoutUrl: string;
  isNewCompany: boolean;
  isNewLink: boolean;
};

function ConsultaPage() {
  const qc = useQueryClient();
  const todayBR = todayBRString();

  const saldoFn = useServerFn(getSaldo);
  const countFn = useServerFn(countByDate);
  const importFn = useServerFn(importBatch);
  const listFn = useServerFn(listByDate);

  const [dateMode, setDateMode] = useState<'today' | 'specific'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(todayBR);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [filters, setFilters] = useState({
    only_mei: true,
    only_active: true,
    only_matriz: true,
    require_email: false,
  });

  const [quantidade, setQuantidade] = useState<number>(5);

  const [saldo, setSaldo] = useState<string | null>(null);
  const [countResult, setCountResult] = useState<null | {
    date: string;
    total: number | null;
    ok: boolean;
    status: number;
  }>(null);

  // Consulta automática (loop): fica chamando countByDate a cada X segundos.
  const [autoCount, setAutoCount] = useState(false);
  const [autoIntervalSec, setAutoIntervalSec] = useState(30);
  const [autoStats, setAutoStats] = useState<{
    checks: number;
    lastTotal: number | null;
    prevTotal: number | null;
    delta: number;
    peak: number | null;
    lastCheckAt: string | null;
    startedAt: string | null;
  }>({
    checks: 0,
    lastTotal: null,
    prevTotal: null,
    delta: 0,
    peak: null,
    lastCheckAt: null,
    startedAt: null,
  });

  const [importedRows, setImportedRows] = useState<ImportedRow[]>([]);
  const [failedRows, setFailedRows] = useState<Array<{ cnpj: string; error: string }>>([]);

  // Lista acumulada de CNPJs descobertos no Modo Automático.
  type FoundRow = {
    cnpj: string;
    nome: string;
    fantasia: string | null;
    uf: string | null;
    municipio: string | null;
    firstSeenAt: string;
  };
  const [foundList, setFoundList] = useState<FoundRow[]>([]);
  const [listDialogOpen, setListDialogOpen] = useState(false);



  const effectiveDate = useMemo(
    () => (dateMode === 'today' ? todayBR : selectedDate || todayBR),
    [dateMode, selectedDate, todayBR],
  );

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.only_mei) parts.push('MEI');
    if (filters.only_active) parts.push('ATIVA');
    if (filters.only_matriz) parts.push('MATRIZ');
    if (filters.require_email) parts.push('com e-mail');
    return parts.length ? parts.join(', ') : 'nenhum';
  }, [filters]);

  const disableFuture = (d: Date) => dateToISO(d) > todayBR;

  const saldoMut = useMutation({
    mutationFn: () => saldoFn(),
    onSuccess: (r) => {
      setSaldo(r.body ?? '(sem corpo)');
      if (!r.ok) toast.error(`API respondeu ${r.status}`);
      else toast.success('Saldo consultado.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro'),
  });

  const countMut = useMutation({
    mutationFn: () => countFn({ data: { date: effectiveDate, filters } }),
    onSuccess: (r) => {
      setCountResult({ date: r.date, total: r.total, ok: r.ok, status: r.status });
      setAutoStats((prev) => {
        const now = new Date().toISOString();
        const next = {
          checks: prev.checks + 1,
          prevTotal: prev.lastTotal,
          lastTotal: r.total,
          delta:
            r.total != null && prev.lastTotal != null ? r.total - prev.lastTotal : 0,
          peak:
            r.total != null
              ? prev.peak != null
                ? Math.max(prev.peak, r.total)
                : r.total
              : prev.peak,
          lastCheckAt: now,
          startedAt: prev.startedAt ?? now,
        };
        if (
          next.delta > 0 &&
          prev.lastTotal != null &&
          r.total != null
        ) {
          toast.success(`+${next.delta} nova(s) empresa(s) encontrada(s)!`);
        }
        return next;
      });
      if (!r.ok) toast.error(`API respondeu ${r.status}`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro'),
  });

  // Loop de consulta automática. Enquanto autoCount=true, chama countMut a
  // cada autoIntervalSec segundos. Não consome créditos (endpoint grátis).
  const countMutRef = useRef(countMut);
  countMutRef.current = countMut;
  useEffect(() => {
    if (!autoCount) return;
    // Dispara imediatamente ao ligar.
    countMutRef.current.mutate();
    const id = window.setInterval(() => {
      if (!countMutRef.current.isPending) {
        countMutRef.current.mutate();
      }
    }, Math.max(5, autoIntervalSec) * 1000);
    return () => window.clearInterval(id);
    // Reinicia o loop quando muda data/filtros/intervalo.
  }, [autoCount, autoIntervalSec, effectiveDate, filters]);

  // Ao desligar, reseta estatísticas do próximo ciclo.
  const prevAutoRef = useRef(autoCount);
  useEffect(() => {
    if (prevAutoRef.current && !autoCount) {
      // desligou: mantém último resultado exibido, mas zera contadores
      setAutoStats((s) => ({ ...s, checks: 0, startedAt: null }));
    }
    prevAutoRef.current = autoCount;
  }, [autoCount]);


  const importMut = useMutation({
    mutationFn: () =>
      importFn({
        data: { date: effectiveDate, filters, limit: quantidade, page: 1 },
      }),
    onSuccess: (r: any) => {
      if (!r.ok) {
        toast.error(r.error ?? `API respondeu ${r.status}`);
        return;
      }
      setImportedRows(r.imported ?? []);
      setFailedRows(r.failed ?? []);
      const nImp = r.imported?.length ?? 0;
      const nFail = r.failed?.length ?? 0;
      if (nImp > 0) {
        toast.success(
          `${nImp} empresa(s) importada(s) e link(s) gerado(s). ${nImp} créditos consumidos.`,
        );
      } else if (nFail > 0) {
        toast.error(`Nenhuma importada. ${nFail} falha(s).`);
      } else {
        toast.info('Nenhuma empresa retornada pela API para esta data/filtros.');
      }
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao importar'),
  });

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
                    onCheckedChange={(v) =>
                      setFilters((prev) => ({ ...prev, [f.key]: v }))
                    }
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
              onClick={() => countMut.mutate()}
              disabled={countMut.isPending || autoCount}
            >
              {countMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarIcon className="mr-2 h-4 w-4" />
              )}
              Consultar quantidade (grátis)
            </Button>
            <Button
              variant="ghost"
              onClick={() => saldoMut.mutate()}
              disabled={saldoMut.isPending}
            >
              {saldoMut.isPending ? (
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
                  Fica consultando a quantidade sozinho a cada X segundos. Não consome créditos.
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
                onChange={(e) =>
                  setAutoIntervalSec(Math.max(5, Math.min(600, Number(e.target.value) || 30)))
                }
                className="h-8 w-24 rounded border border-slate-300 px-2 text-sm"
              />
              <span className="text-xs text-slate-500">mín. 5 seg</span>
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
                  <div>
                    Consultas feitas: <strong>{autoStats.checks}</strong>
                  </div>
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
                  <div>
                    Próxima em: <strong>~{autoIntervalSec}s</strong>
                  </div>
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
                  disabled={importMut.isPending}
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
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              className="bg-brand-navy hover:bg-brand-navy/90"
            >
              {importMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Importar {quantidade} empresa(s) agora
            </Button>
          </div>

          {importMut.isPending && (
            <p className="text-sm text-slate-600">
              Aguarde… a chamada pode levar de 5 a 30 segundos.
            </p>
          )}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(row.publicUrl)}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Link público
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(row.checkoutUrl)}
                  >
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
                  <div>
                    <strong>{formatCNPJ(row.cnpj)}</strong>
                  </div>
                  <div className="text-xs text-red-700">{row.error}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
