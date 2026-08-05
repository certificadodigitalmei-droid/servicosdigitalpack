import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Loader2,
  Play,
  Copy,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Inbox,
  Zap,
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
import { toast } from 'sonner';
import { formatCNPJ } from '@/lib/format';
import { useStore } from '@/lib/automation/store';
import {
  consultaStore,
  setAutoImport,
  setQuantidade,
  setBufferTarget,
  runImportOnce,
} from '@/lib/automation/consulta-engine';
import { envioStore } from '@/lib/automation/envio-engine';

import { supabase } from '@/integrations/supabase/client';
import {
  DateRangeFilter,
  computeDateRange,
  type DatePreset,
} from '@/components/painel/DateRangeFilter';
import { WipeAllButton, EMPTY_UUID } from '@/components/painel/WipeAllButton';

export const Route = createFileRoute('/_authenticated/painel/importacao-automatica')({
  head: () => ({
    meta: [
      { title: 'Importação Automática | Painel' },
      { name: 'description', content: 'Importa CNPJs 1 a 1 e alimenta a fila de envio.' },
    ],
  }),
  component: ImportacaoAutomaticaPage,
});

const QUANTIDADES = [1, 5, 10, 15];

function formatBR(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function ImportacaoAutomaticaPage() {
  const quantidade = useStore(consultaStore, (s) => s.quantidade);
  const autoImport = useStore(consultaStore, (s) => s.autoImport);
  const isImporting = useStore(consultaStore, (s) => s.isImporting);
  const autoImportRuns = useStore(consultaStore, (s) => s.autoImportRuns);
  const autoImportTotal = useStore(consultaStore, (s) => s.autoImportTotal);
  const bufferTarget = useStore(consultaStore, (s) => s.bufferTarget);

  const importedRowsAll = useStore(consultaStore, (s) => s.importedRows);
  const failedRowsAll = useStore(consultaStore, (s) => s.failedRows);
  const dateMode = useStore(consultaStore, (s) => s.dateMode);
  const selectedDate = useStore(consultaStore, (s) => s.selectedDate);
  const filters = useStore(consultaStore, (s) => s.filters);

  // Filtro de período — conta empresas importadas no banco no intervalo.
  const [preset, setPreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [periodCount, setPeriodCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [periodRows, setPeriodRows] = useState<
    Array<{ id: string; cnpj: string; nome: string | null; uf: string | null; municipio: string | null; created_at: string }>
  >([]);
  const [periodRowsLoading, setPeriodRowsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setCountLoading(true);
      setPeriodRowsLoading(true);
      try {
        const { from, to } = computeDateRange(preset, customFrom, customTo);
        let cq = supabase.from('companies').select('id', { count: 'exact', head: true });
        if (from) cq = cq.gte('created_at', from.toISOString());
        if (to) cq = cq.lte('created_at', to.toISOString());
        const { count, error } = await cq;
        if (!cancelled) {
          if (error) throw error;
          setPeriodCount(count ?? 0);
        }

        let lq = supabase
          .from('companies')
          .select('id, cnpj, nome_titular_exibicao, razao_social_original, uf, municipio_descricao, created_at')
          .order('created_at', { ascending: false })
          .limit(500);
        if (from) lq = lq.gte('created_at', from.toISOString());
        if (to) lq = lq.lte('created_at', to.toISOString());
        const { data: rows, error: rowsErr } = await lq;
        if (!cancelled) {
          if (rowsErr) throw rowsErr;
          setPeriodRows(
            (rows ?? []).map((r: any) => ({
              id: r.id,
              cnpj: r.cnpj,
              nome: r.nome_titular_exibicao ?? r.razao_social_original ?? null,
              uf: r.uf,
              municipio: r.municipio_descricao,
              created_at: r.created_at,
            })),
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setPeriodCount(null);
          setPeriodRows([]);
          console.error(e);
        }
      } finally {
        if (!cancelled) {
          setCountLoading(false);
          setPeriodRowsLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [preset, customFrom, customTo, refreshTick]);


  // Fila em tempo real = itens PENDENTES (aguardando envio) na engine de envio.
  const queue = useStore(envioStore, (s) => s.queue);
  const envioRunning = useStore(envioStore, (s) => s.running);
  const envioPaused = useStore(envioStore, (s) => s.paused);
  const envioTestMode = useStore(envioStore, (s) => s.testMode);
  const sentEmails = useStore(envioStore, (s) => s.sentEmails);

  const sentCnpjSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of sentEmails) {
      const d = (e.cnpj ?? '').replace(/\D/g, '');
      if (d) s.add(d);
    }
    for (const q of queue) {
      if (q.status === 'sent') {
        const d = (q.cnpj ?? '').replace(/\D/g, '');
        if (d) s.add(d);
      }
    }
    return s;
  }, [sentEmails, queue]);

  const importedRows = useMemo(
    () => importedRowsAll.filter((r) => !sentCnpjSet.has((r.cnpj ?? '').replace(/\D/g, ''))),
    [importedRowsAll, sentCnpjSet],
  );
  const failedRows = useMemo(
    () => failedRowsAll.filter((r) => !sentCnpjSet.has((r.cnpj ?? '').replace(/\D/g, ''))),
    [failedRowsAll, sentCnpjSet],
  );

  const pendingQueue = useMemo(
    () => queue.filter((q) => q.status === 'pending' || q.status === 'sending'),
    [queue],
  );

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.only_mei) parts.push('MEI');
    if (filters.only_active) parts.push('ATIVA');
    if (filters.only_matriz) parts.push('MATRIZ');
    if (filters.require_email) parts.push('com e-mail');
    return parts.length ? parts.join(', ') : 'nenhum';
  }, [filters]);

  const dateLabel =
    dateMode === 'today'
      ? 'Hoje'
      : selectedDate
      ? formatBR(selectedDate)
      : 'Hoje';

  const envioAtivo = envioRunning && !envioPaused && !envioTestMode;

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
          <h1 className="text-2xl font-bold text-brand-navy">Importação Automática</h1>
          <p className="text-sm text-slate-600">
            Importa CNPJs da API oficial e enfileira 1 empresa por vez para o Envio em Massa.
            Data e filtros são configurados na aba <strong>Consulta Automática</strong>.
          </p>
          {autoImport && (
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              ● Importação automática ativa — continua rodando mesmo em outras abas.
            </p>
          )}
        </div>
        <WipeAllButton
          label="Apagar importadas"
          title="Apagar todas as empresas importadas?"
          description="Remove permanentemente todas as empresas importadas, seus links públicos, gerações, eventos e a fila de importação. Não afeta configurações, modelos, campanhas ou histórico de envios. Não pode ser desfeito."
          steps={[
            { label: 'link_events', run: () => supabase.from('link_events').delete().neq('id', EMPTY_UUID) },
            { label: 'company_links', run: () => supabase.from('company_links').delete().neq('id', EMPTY_UUID) },
            { label: 'link_generations', run: () => supabase.from('link_generations').delete().neq('id', EMPTY_UUID) },
            { label: 'automatic_company_queue', run: () => supabase.from('automatic_company_queue').delete().neq('id', EMPTY_UUID) },
            { label: 'companies', run: () => supabase.from('companies').delete().neq('id', EMPTY_UUID) },
          ]}
          onDone={() => setRefreshTick((t) => t + 1)}
        />
      </div>

      <PipelineStrip />

      <div className="grid gap-4 lg:grid-cols-2">
        <AguardandoLinkCard />
        <AguardandoEnvioCard />
      </div>



      <DateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        from={customFrom}
        to={customTo}
        onFromChange={setCustomFrom}
        onToChange={setCustomTo}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <span className="text-slate-600">Empresas importadas no período:</span>
          <span className="text-2xl font-bold tabular-nums text-brand-navy">
            {countLoading ? '…' : (periodCount ?? 0).toLocaleString('pt-BR')}
          </span>
          <span className="ml-auto text-xs text-slate-500">
            Contagem por data de importação (created_at) no banco.
          </span>
        </CardContent>
      </Card>

      {/* Lista de empresas importadas no período selecionado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Empresas importadas no período
            <Badge variant="outline" className="ml-2">
              {periodRowsLoading ? '…' : periodRows.length}
              {periodCount != null && periodCount > periodRows.length
                ? ` de ${periodCount.toLocaleString('pt-BR')}`
                : ''}
            </Badge>
          </CardTitle>
          <CardDescription>
            Somente empresas cuja <strong>data de importação</strong> cai no filtro acima
            (mais recentes primeiro, até 500).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {periodRowsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : periodRows.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-sm text-slate-500">
              Nenhuma empresa importada nesse período.
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {periodRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {formatCNPJ(r.cnpj)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(r.created_at).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </span>
                    </div>
                    <div className="truncate text-sm text-slate-700">
                      {r.nome || '—'}
                      {(r.municipio || r.uf) && (
                        <span className="ml-2 text-xs text-slate-500">
                          · {[r.municipio, r.uf].filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => copy(r.cnpj)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>


      {/* Config atual (herdada da Consulta) */}
      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-xs text-slate-600">
          <span>
            <strong className="text-slate-800">Data:</strong> {dateLabel}
          </span>
          <span className="text-slate-300">•</span>
          <span>
            <strong className="text-slate-800">Filtros:</strong> {filtersSummary}
          </span>
          <span className="ml-auto text-[11px] text-slate-500">
            Ajuste em <strong>Consulta Automática</strong>.
          </span>
        </CardContent>
      </Card>

      {/* 1. Importar agora */}
      <Card>
        <CardHeader>
          <CardTitle>
            1. Importar agora <Badge className="ml-2 bg-red-600">Paga créditos</Badge>
          </CardTitle>
          <CardDescription>
            Digite quantos CNPJs quer importar de uma vez. A API oficial entrega em lotes de 15,
            então valores maiores são feitos em várias chamadas automaticamente.
            Cada CNPJ consome 1 crédito.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Quantidade a importar</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                step={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
                disabled={isImporting}
                className="h-10 w-32 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
              />
              <div className="flex flex-wrap gap-1">
                {QUANTIDADES.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="outline"
                    onClick={() => setQuantidade(n)}
                    disabled={isImporting}
                  >
                    {n}
                  </Button>
                ))}
                {[50, 100, 500].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="outline"
                    onClick={() => setQuantidade(n)}
                    disabled={isImporting}
                  >
                    {n}
                  </Button>
                ))}
              </div>
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

          {/* Importação automática (slave do envio) */}
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

            <div className="mt-3 rounded-md border border-brand-navy/20 bg-white/60 p-3 text-xs text-slate-700 space-y-2">
              <p>
                Mantém sempre <strong>{bufferTarget} empresa(s)</strong> prontas na fila.
                Quando o envio consome uma, a importação puxa a
                próxima (sempre a mais recente). Empresas já processadas
                <strong> nunca</strong> entram novamente na fila — sem envio duplicado.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Label className="text-xs">Empresas prontas na fila:</Label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={bufferTarget}
                  onChange={(e) => setBufferTarget(Number(e.target.value) || 100)}
                  className="h-8 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm"
                />
                <div className="flex gap-1">
                  {[10, 50, 100, 200, 500].map((n) => (
                    <Button key={n} size="sm" variant="outline" onClick={() => setBufferTarget(n)}>
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              {autoImport && !envioAtivo && (
                <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-800">
                  ⏸ Aguardando o <strong>Envio em Massa</strong> ser iniciado em modo real
                  (não teste). Sem envio ativo, nada é importado.
                </p>
              )}
            </div>


            {autoImport && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Ciclos" value={autoImportRuns.toString()} />
                <Stat label="Importadas (sessão)" value={autoImportTotal.toString()} />
                <Stat
                  label="Status"
                  value={
                    isImporting
                      ? 'importando…'
                      : envioAtivo
                      ? 'aguardando envio'
                      : 'envio parado'
                  }
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Fila em tempo real */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-600" />
                2. Fila em tempo real
                <Badge variant="outline" className="ml-2">
                  {pendingQueue.length} aguardando envio
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Empresas já importadas que ainda não tiveram o e-mail disparado. Assim que o
                Envio em Massa confirmar o envio, o item some daqui e vai para
                <strong> E-mails Enviados</strong> — só então a próxima importação é liberada.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pendingQueue.length === 0}
              onClick={() => {
                if (!confirm(`Remover ${pendingQueue.length} pendente(s) da fila? O histórico de envios não é afetado.`)) return;
                import('@/lib/automation/envio-engine').then((m) => m.clearPendingQueue());
              }}
            >
              Limpar fila
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {pendingQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
                <Inbox className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-slate-700">
                Nenhuma empresa aguardando envio
              </div>
              <div className="max-w-md text-xs text-slate-500">
                {autoImport
                  ? envioAtivo
                    ? 'Buscando a próxima empresa na API…'
                    : 'Ative o Envio em Massa em modo real para começar o ciclo.'
                  : 'Ative a Importação automática acima para começar a alimentar a fila.'}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {pendingQueue.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {formatCNPJ(item.cnpj)}
                      </span>
                      {item.status === 'sending' ? (
                        <Badge className="bg-amber-500">enviando…</Badge>
                      ) : (
                        <Badge variant="outline">pendente</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-700">
                      {item.company_name || '—'}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {item.email}
                      {(item.municipio || item.uf) && (
                        <span className="ml-2">
                          · 📍 {[item.municipio, item.uf].filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(item.cnpj)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {item.publicUrl && (
                      <a href={item.publicUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 3. Resultado do último lote */}
      {(importedRows.length > 0 || failedRows.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Resultado do último lote</CardTitle>
                <CardDescription>
                  {importedRows.length} importada(s), {failedRows.length} falha(s).
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!confirm('Limpar resultado do último lote? Isso não apaga empresas nem links já salvos.')) return;
                  consultaStore.set({ importedRows: [], failedRows: [] });
                }}
              >
                Limpar
              </Button>
            </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-bold text-brand-navy">{value}</div>
    </div>
  );
}
