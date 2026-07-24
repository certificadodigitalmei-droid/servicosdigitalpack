import { useMemo } from 'react';
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
  runImportOnce,
} from '@/lib/automation/consulta-engine';
import { envioStore } from '@/lib/automation/envio-engine';

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
  const importedRowsAll = useStore(consultaStore, (s) => s.importedRows);
  const failedRowsAll = useStore(consultaStore, (s) => s.failedRows);
  const dateMode = useStore(consultaStore, (s) => s.dateMode);
  const selectedDate = useStore(consultaStore, (s) => s.selectedDate);
  const filters = useStore(consultaStore, (s) => s.filters);

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
      </div>

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
                A importação automática é <strong>escrava do Envio em Massa</strong>: importa
                exatamente <strong>1 empresa por vez</strong> (a mais recente da API) e só
                busca a próxima depois que o envio anterior for confirmado.
              </p>
              <p className="text-slate-500">
                Regra: importa → aparece na fila abaixo → Envio em Massa dispara →
                confirma → libera a próxima importação. Nunca há mais de 1 empresa
                aguardando envio.
              </p>
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
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600" />
            2. Fila em tempo real
            <Badge variant="outline" className="ml-2">
              {pendingQueue.length} aguardando envio
            </Badge>
          </CardTitle>
          <CardDescription>
            Empresas já importadas que ainda não tiveram o e-mail disparado. Assim que o
            Envio em Massa confirmar o envio, o item some daqui e vai para
            <strong> E-mails Enviados</strong> — só então a próxima importação é liberada.
          </CardDescription>
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
