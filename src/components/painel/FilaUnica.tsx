import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCNPJ } from '@/lib/format';
import {
  getUnifiedQueue,
  getSendHealth,
  getSendWindow,
  getFlowSettings,
  updateFlowSettings,
  type QueueStage,
} from '@/lib/pipeline/pipeline.functions';
import { toast } from 'sonner';
import { Inbox, Send, AlertTriangle, Gauge, Zap, Timer, Settings2, Rocket } from 'lucide-react';


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

function Metric({
  label,
  value,
  cls,
  hint,
}: {
  label: string;
  value: number;
  cls?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${cls ?? 'text-slate-900'}`}>
        {value.toLocaleString('pt-BR')}
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
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
          Números reais da fila do servidor. Cada caixa abaixo explica exatamente o que está
          contando — <strong>rate limit (HTTP 429) não é erro</strong>, é só o provedor pedindo para
          esperar; esses e-mails voltam sozinhos para a fila.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Na fila"
          value={data?.naFila ?? 0}
          cls="text-amber-600"
          hint="E-mails prontos que ainda não foram disparados. Diminui conforme o envio acontece."
        />
        <Metric
          label="Enviando agora"
          value={data?.enviando ?? 0}
          cls="text-indigo-600"
          hint="E-mails em processamento neste exato momento (normalmente 0 entre os lotes)."
        />
        <Metric
          label="Enviados na última hora"
          value={data?.enviadosUltimaHora ?? 0}
          cls="text-emerald-600"
          hint="Aceitos pelo provedor nos últimos 60 minutos. É este número que consome a cota da janela."
        />
        <Metric
          label="Enviados (total)"
          value={data?.enviados ?? 0}
          cls="text-emerald-700"
          hint="Total histórico de e-mails entregues ao provedor desde o início."
        />
        <Metric
          label="Falhas definitivas"
          value={data?.falhas ?? 0}
          cls="text-red-600"
          hint="Desistimos do envio (e-mail inválido, caixa inexistente). A empresa é removida automaticamente."
        />
        <Metric
          label="Esperando por 429"
          value={data?.aguardando429 ?? 0}
          cls="text-orange-600"
          hint="Ainda na fila, só aguardando o tempo do rate limit passar. Serão enviados sozinhos."
        />
        <Metric
          label="Já bateram 429 (histórico)"
          value={data?.retries429 ?? 0}
          cls="text-orange-500"
          hint="Quantos e-mails em algum momento receberam rate limit. Não significa perda — é só contagem de reagendamentos."
        />
        <Metric
          label="Suprimidos"
          value={data?.suprimidos ?? 0}
          cls="text-slate-600"
          hint="Bloqueados de propósito: descadastro, reclamação de spam ou domínio que não recebe e-mail."
        />
      </CardContent>
      <CardContent className="pt-0">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">
          <p className="mb-1 font-semibold text-slate-700">Como ler estes números</p>
          <p>
            <strong>Na fila + Enviando + Enviados</strong> é o caminho normal de cada e-mail. Só
            preocupe-se com <strong>Falhas definitivas</strong>: as outras caixas laranjas são
            apenas espera técnica e se resolvem sozinhas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


/** Janela de 1 hora: abre no 1º envio, mostra restante e conta regressiva. */
export function SendWindowCard() {
  const fetchWindow = useServerFn(getSendWindow);
  const { data } = useQuery({
    queryKey: ['send-window'],
    queryFn: () => fetchWindow(),
    refetchInterval: 5_000,
  });

  // Countdown local entre os refetches (atualiza a cada segundo).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const endMs = data?.windowEnd ? new Date(data.windowEnd).getTime() : null;
  const secondsLeft = endMs ? Math.max(0, Math.round((endMs - now) / 1000)) : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const limit = data?.limit ?? 100;
  const sent = data?.open && secondsLeft > 0 ? (data?.sentInWindow ?? 0) : 0;
  const remaining = Math.max(0, limit - sent);
  const pct = limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0;
  const esgotada = remaining === 0 && secondsLeft > 0;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4 text-indigo-600" />
          Janela de envio (1 hora)
        </CardTitle>
        <CardDescription>
          O lote começa no primeiro e-mail e nunca passa do limite. Ao bater o limite, o próximo
          lote só libera 1 hora depois do <strong>último e-mail enviado</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label={`Enviados (de ${limit})`} value={sent} cls="text-indigo-700" />
          <Metric label="Restam nesta janela" value={remaining} cls="text-emerald-700" />
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Libera em</div>
            <div className="text-xl font-bold tabular-nums text-slate-900">
              {data?.open && secondsLeft > 0 ? `${mm}:${ss}` : '--:--'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Último envio</div>
            <div className="text-xl font-bold text-slate-900">
              {data?.lastSentAt
                ? new Date(data.lastSentAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </div>
          </div>
        </div>



        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full transition-all ${esgotada ? 'bg-red-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="text-xs text-slate-600">
          {!data?.open || secondsLeft === 0 ? (
            <>Nenhuma janela aberta — ela começa automaticamente no próximo e-mail enviado.</>
          ) : esgotada ? (
            <>
              Cota da janela esgotada. Novos disparos liberam às{' '}
              <strong>
                {endMs
                  ? new Date(endMs).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </strong>
              .
            </>
          ) : (
            <>
              Pode enviar mais <strong>{remaining}</strong> e-mail(s) até{' '}
              <strong>
                {endMs
                  ? new Date(endMs).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </strong>
              .
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

type ProfileKey = 'turbo' | 'rapido' | 'equilibrado' | 'moderado';

const PROFILES: Array<{
  key: ProfileKey;
  nome: string;
  desc: string;
  ritmo: string;
  icon: typeof Zap;
  cls: string;
}> = [
  {
    key: 'turbo',
    nome: 'Turbo (máximo)',
    desc: 'Esvazia o lote da janela o mais rápido possível',
    ritmo: 'tudo de uma vez · 10 em paralelo',
    icon: Rocket,
    cls: 'text-red-600',
  },
  {
    key: 'rapido',
    nome: 'Rápido',
    desc: 'Bem rápido, com margem de segurança',
    ritmo: 'tudo de uma vez · 5 em paralelo',
    icon: Zap,
    cls: 'text-orange-600',
  },
  {
    key: 'equilibrado',
    nome: 'Equilibrado',
    desc: 'Rápido, mas em blocos menores',
    ritmo: 'blocos de 2 · pausa curta',
    icon: Gauge,
    cls: 'text-blue-600',
  },
  {
    key: 'moderado',
    nome: 'Moderado (uso normal)',
    desc: 'Ritmo conservador, menor risco de bloqueio',
    ritmo: '1 a cada 36s',
    icon: Timer,
    cls: 'text-emerald-600',
  },
];

/** Perfis de disparo prontos + tamanho do lote. */
export function SendProfileCard() {
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
      await qc.invalidateQueries({ queryKey: ['send-window'] });
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
          Perfil de disparo
        </CardTitle>
        <CardDescription>
          Um clique aplica o ritmo inteiro. O lote é o máximo de e-mails por janela de 1 hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILES.map((p) => {
            const Icon = p.icon;
            const active = data.sendProfile === p.key;
            return (
              <button
                key={p.key}
                type="button"
                disabled={saving}
                onClick={() => void apply({ sendProfile: p.key })}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? 'border-brand-blue bg-blue-50 ring-1 ring-brand-blue'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${p.cls}`} />
                  <span className="text-sm font-semibold text-slate-900">{p.nome}</span>
                  {active && <Badge className="ml-auto bg-brand-blue text-white">ativo</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-600">{p.desc}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {data.hourlyBatchSize}/h · {p.ritmo}
                </p>
              </button>
            );
          })}
        </div>

        {data.sendProfile === 'custom' && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Perfil <strong>personalizado</strong> — modo {data.sendMode === 'burst' ? 'rajada' : 'espaçado'},{' '}
            {data.sendMode === 'burst'
              ? `${data.burstConcurrency} em paralelo`
              : `1 a cada ${data.pacedDelaySec}s`}
            .
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block text-sm font-semibold">Lote por janela (e-mails/h)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1000}
                className="w-24"
                value={data.hourlyBatchSize}
                onChange={(e) =>
                  void apply({ hourlyBatchSize: Math.max(1, Number(e.target.value) || 1) })
                }
                disabled={saving}
              />
              {[25, 50, 100, 200].map((n) => (
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

          <div>
            <Label className="mb-2 block text-sm font-semibold">Empresas por importação</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={500}
                className="w-24"
                value={data.importBatchSize}
                onChange={(e) =>
                  void apply({ importBatchSize: Math.max(1, Number(e.target.value) || 1) })
                }
                disabled={saving}
              />
              {[5, 20, 50, 100].map((n) => (
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
          </div>
        </div>

        {data.sendMode === 'paced' && (
          <div>
            <Label className="mb-2 block text-sm font-semibold">Intervalo entre e-mails (s)</Label>
            <Input
              type="number"
              min={1}
              max={3600}
              className="w-24"
              value={data.pacedDelaySec}
              onChange={(e) =>
                void apply({ pacedDelaySec: Math.max(1, Number(e.target.value) || 1) })
              }
              disabled={saving}
            />
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Se o provedor responder <strong>HTTP 429</strong>, os e-mails voltam para a fila com
            espera automática e aparecem em “Retries (HTTP 429)” — ninguém é perdido.
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Send className="h-3.5 w-3.5" />
          Fluxo: importar {data.importBatchSize} → gerar links → fila → enviar até{' '}
          {data.hourlyBatchSize} por janela → importar de novo.
        </p>
      </CardContent>
    </Card>
  );
}

/** Compatibilidade: nome antigo usado em outras abas. */
export const FlowSettingsCard = SendProfileCard;

