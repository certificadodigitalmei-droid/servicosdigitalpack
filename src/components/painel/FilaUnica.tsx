import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCNPJ } from '@/lib/format';
import {
  getUnifiedQueue,
  getSendHealth,
  getFlowSettings,
  updateFlowSettings,
  type QueueStage,
} from '@/lib/pipeline/pipeline.functions';
import { toast } from 'sonner';
import { Inbox, Send, AlertTriangle, Gauge, Zap, Timer, Settings2 } from 'lucide-react';

const STAGE_UI: Record<QueueStage, { label: string; cls: string }> = {
  sem_link: { label: 'gerando link', cls: 'bg-slate-100 text-slate-700' },
  aguardando_fila: { label: 'aguardando fila', cls: 'bg-blue-100 text-blue-700' },
  na_fila: { label: 'na fila', cls: 'bg-amber-100 text-amber-800' },
  enviando: { label: 'enviando', cls: 'bg-indigo-100 text-indigo-700' },
  erro: { label: 'erro', cls: 'bg-red-100 text-red-700' },
};

/**
 * FILA ÚNICA do painel: empresas importadas com link gerado que estão
 * apenas aguardando o envio. Mesma lista em todas as abas.
 */
export function FilaUnicaCard({ limit = 100 }: { limit?: number }) {
  const fetchQueue = useServerFn(getUnifiedQueue);
  const { data, isLoading } = useQuery({
    queryKey: ['fila-unica', limit],
    queryFn: () => fetchQueue({ data: { limit } }),
    refetchInterval: 10_000,
  });
  const rows = data ?? [];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-amber-600" />
          Fila de envio (empresas importadas com link)
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <CardDescription>
          Fila única do sistema: empresas já importadas e com link criado, aguardando apenas o
          disparo do e-mail. Só depois de esvaziar esta fila o sistema importa novas empresas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-slate-500">Carregando fila…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            Fila vazia — o sistema já pode importar o próximo lote de empresas.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-2 pl-2">#</th>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>E-mail</th>
                  <th className="pr-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pl-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="max-w-[200px] truncate font-medium text-slate-800">{r.nome}</td>
                    <td className="font-mono text-xs text-slate-500">{formatCNPJ(r.cnpj)}</td>
                    <td className="max-w-[200px] truncate text-xs text-slate-500">
                      {r.email ?? 'sem e-mail'}
                    </td>
                    <td className="pr-2">
                      <Badge className={STAGE_UI[r.stage].cls}>{STAGE_UI[r.stage].label}</Badge>
                      {r.lastStatusCode === 429 && (
                        <span className="ml-1 text-[10px] font-semibold text-orange-600">429</span>
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
  );
}

function Metric({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${cls ?? 'text-slate-900'}`}>
        {value.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}

/** Saúde do disparo: enviados, erros e rate limit (HTTP 429). */
export function SendHealthCard() {
  const fetchHealth = useServerFn(getSendHealth);
  const { data } = useQuery({
    queryKey: ['send-health'],
    queryFn: () => fetchHealth(),
    refetchInterval: 10_000,
  });

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-emerald-600" />
          Status dos disparos
        </CardTitle>
        <CardDescription>
          Números reais da fila do servidor — enviados, erros e quantas vezes o provedor respondeu
          rate limit (HTTP 429).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Na fila" value={data?.naFila ?? 0} cls="text-amber-600" />
        <Metric label="Enviados (1h)" value={data?.enviadosUltimaHora ?? 0} cls="text-emerald-600" />
        <Metric label="Enviados (total)" value={data?.enviados ?? 0} cls="text-emerald-700" />
        <Metric label="Erros" value={data?.falhas ?? 0} cls="text-red-600" />
        <Metric label="Retries (HTTP 429)" value={data?.retries429 ?? 0} cls="text-orange-600" />
        <Metric label="Suprimidos" value={data?.suprimidos ?? 0} cls="text-slate-600" />
        <Metric label="Enviando agora" value={data?.enviando ?? 0} cls="text-indigo-600" />
      </CardContent>
    </Card>
  );
}

/** Configuração do ritmo: lote de importação + modo de envio. */
export function FlowSettingsCard() {
  const fetchSettings = useServerFn(getFlowSettings);
  const save = useServerFn(updateFlowSettings);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['flow-settings'],
    queryFn: () => fetchSettings(),
    refetchInterval: 30_000,
  });
  const [saving, setSaving] = useState(false);

  const apply = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await save({ data: patch as any });
      await qc.invalidateQueries({ queryKey: ['flow-settings'] });
      toast.success('Configuração salva');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-4 text-sm text-slate-500">Carregando configuração…</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-brand-blue" />
          Ritmo do fluxo automático
        </CardTitle>
        <CardDescription>
          Escolha quantas empresas importar por vez e como os e-mails saem: em rajada (o lote
          inteiro o mais rápido possível, uma vez por hora) ou espaçado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label className="mb-2 block text-sm font-semibold">
            Empresas por importação (lote)
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={1}
              max={500}
              className="w-28"
              value={data.importBatchSize}
              onChange={(e) =>
                void apply({ importBatchSize: Math.max(1, Number(e.target.value) || 1) })
              }
              disabled={saving}
            />
            {[5, 10, 20, 50, 100].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={data.importBatchSize === n ? 'default' : 'outline'}
                onClick={() => void apply({ importBatchSize: n })}
                disabled={saving}
              >
                {n}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            A cada ciclo o sistema importa até {data.importBatchSize} empresa(s) novas (as mais
            recentes), gera os links e coloca na fila de envio.
          </p>
        </div>

        <div>
          <Label className="mb-2 block text-sm font-semibold">Modo de envio</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={data.sendMode === 'burst' ? 'default' : 'outline'}
              onClick={() => void apply({ sendMode: 'burst' })}
              disabled={saving}
            >
              <Zap className="h-4 w-4" /> Rajada (rápido)
            </Button>
            <Button
              variant={data.sendMode === 'paced' ? 'default' : 'outline'}
              onClick={() => void apply({ sendMode: 'paced' })}
              disabled={saving}
            >
              <Timer className="h-4 w-4" /> Espaçado
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {data.sendMode === 'burst'
              ? `Dispara até ${data.hourlyBatchSize} e-mails o mais rápido possível e só volta a enviar quando a janela de 1 hora liberar.`
              : `Envia 1 e-mail a cada ${data.pacedDelaySec}s, respeitando o teto de ${data.hourlyBatchSize}/h.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block text-sm font-semibold">E-mails por hora (teto)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1000}
                className="w-28"
                value={data.hourlyBatchSize}
                onChange={(e) =>
                  void apply({ hourlyBatchSize: Math.max(1, Number(e.target.value) || 1) })
                }
                disabled={saving}
              />
              {[50, 100, 200, 300].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={data.hourlyBatchSize === n ? 'default' : 'outline'}
                  onClick={() => void apply({ hourlyBatchSize: n })}
                  disabled={saving}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
          {data.sendMode === 'paced' && (
            <div>
              <Label className="mb-2 block text-sm font-semibold">Intervalo entre e-mails (s)</Label>
              <Input
                type="number"
                min={1}
                max={3600}
                className="w-28"
                value={data.pacedDelaySec}
                onChange={(e) =>
                  void apply({ pacedDelaySec: Math.max(1, Number(e.target.value) || 1) })
                }
                disabled={saving}
              />
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Em rajada, se o provedor responder <strong>HTTP 429</strong>, os itens voltam para a
            fila com backoff automático e aparecem em “Retries (HTTP 429)”.
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Send className="h-3.5 w-3.5" />
          Fluxo: importar {data.importBatchSize} → gerar links → fila → enviar → importar de novo.
        </p>
      </CardContent>
    </Card>
  );
}
