import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import {
  Loader2,
  MessageCircle,
  Send,
  Users,
  CheckCircle2,
  RefreshCw,
  Ban,
  Play,
  Pause,
  Square,
  Search,
  Trash2,
  Clock,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCNPJ } from '@/lib/format';
import { WhatsappReadyPanel } from '@/components/painel/WhatsappReadyPanel';
import { ConsultaInline } from '@/components/painel/ConsultaInline';
import {
  PACE_LIST,
  QUANTITY_OPTIONS,
  MIN_INTERVAL_SECONDS,
  approvedTemplates,
  otherTemplates,
  resolveIntervalSeconds,
  estimateDurationSeconds,
  formatDuration,
  messagesPerHour,
  type PacePresetId,
} from '@/lib/whatsapp/campaign-logic';
import {
  getWaCampaignDashboard,
  exportWaCampaignCsv,
  selectWaTemplate,
  createWaCampaign,
  controlWaCampaign,
  getWaCampaignDetail,
  searchWaCompanies,
  sendWaCampaignTest,
  tickWaCampaign,
  refillWaCampaign,
  reconcileWaDeliveries,
  repairWaCampaign,
  getWaBlockedList,
} from '@/lib/whatsapp/campaigns.functions';
import {
  getWaSenders,
  selectWaSender,
  syncWaConnectionAndTemplates,
} from '@/lib/whatsapp/senders.functions';

import { CONFIRMED_REJECTIONS } from '@/lib/whatsapp/known-facts';

export const Route = createFileRoute('/_authenticated/painel/whatsapp-massa')({
  head: () => ({
    meta: [
      { title: 'Campanhas de WhatsApp | Central MEI' },
      {
        name: 'description',
        content: 'Painel operacional do WhatsApp: saúde da conta, consumo em 24 h, modelos aprovados, fila e campanhas.',
      },
    ],
  }),
  component: WhatsappCampanhasPage,
  // Nunca deixar a tela em branco: se algo falhar (ex.: servidor reiniciando),
  // mostramos um aviso com botão de tentar de novo.
  errorComponent: ({ error }: { error: Error }) => (
    <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Não foi possível abrir o painel do WhatsApp</h1>
      <p className="text-sm text-slate-500">{error?.message ?? 'Erro inesperado.'}</p>
      <Button onClick={() => window.location.reload()}>Tentar de novo</Button>
    </div>
  ),
  notFoundComponent: () => <div className="py-16 text-center text-sm text-slate-500">Página não encontrada.</div>,
  pendingComponent: () => (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
    </div>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Aguardando aprovação',
  REJECTED: 'Reprovado',
  PAUSED: 'Pausado pela Meta',
  DISABLED: 'Desativado',
};

const CAMPAIGN_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  running: 'Em andamento',
  paused: 'Pausada',
  finished: 'Encerrada',
  finished_partial: 'Encerrada com pendências',
  archived: 'Arquivada',
  cancelled: 'Cancelada',
};

const ITEM_LABEL: Record<string, string> = {
  pending: 'Na fila',
  sending: 'Enviando',
  sent: 'Aceita pela API',
  failed: 'Falhou',
  blocked: 'Bloqueada',
  confirmation_pending: 'Confirmação pendente',
  cancelled: 'Cancelada sem tentativa',
};

const API_STATUS_LABEL: Record<string, string> = {
  accepted: 'Aceita pela API',
  pending: 'Aguardando tentativa',
  rejected: 'Recusada na chamada',
};

const DELIVERY_LABEL: Record<string, string> = {
  accepted: 'Aceita (sem evento)',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Rejeitada',
};


function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

function WhatsappCampanhasPage() {
  const loadDash = useServerFn(getWaCampaignDashboard);
  const doExport = useServerFn(exportWaCampaignCsv);
  const doSync = useServerFn(syncWaConnectionAndTemplates);
  const loadSenders = useServerFn(getWaSenders);
  const doSelectSender = useServerFn(selectWaSender);
  const doSelect = useServerFn(selectWaTemplate);
  const doCreate = useServerFn(createWaCampaign);
  const doControl = useServerFn(controlWaCampaign);
  const loadDetail = useServerFn(getWaCampaignDetail);
  const doSearch = useServerFn(searchWaCompanies);
  const doTest = useServerFn(sendWaCampaignTest);
  const doTick = useServerFn(tickWaCampaign);
  const doRefill = useServerFn(refillWaCampaign);
  const doReconcile = useServerFn(reconcileWaDeliveries);
  const doRepair = useServerFn(repairWaCampaign);
  const loadBlocked = useServerFn(getWaBlockedList);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dash, setDash] = useState<any>(null);
  const [senders, setSenders] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');


  // Campanha nova
  const [campName, setCampName] = useState('');
  const [qty, setQty] = useState<number>(50);
  const [customQty, setCustomQty] = useState('');
  const [pace, setPace] = useState<PacePresetId>('recommended');
  const [customSeconds, setCustomSeconds] = useState(30);
  const [dailyCap, setDailyCap] = useState(250);
  const [continuous, setContinuous] = useState(false);

  // Detalhe
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [itemFilter, setItemFilter] = useState<
    'all' | 'pending' | 'sending' | 'sent' | 'failed' | 'blocked' | 'confirmation_pending' | 'cancelled'
  >('all');
  const [page, setPage] = useState(1);

  // Bloqueios permanentes
  const [blocked, setBlocked] = useState<any>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);

  // Teste
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [chosen, setChosen] = useState<any>(null);
  const [testPhone, setTestPhone] = useState('');

  const templates = (dash?.templates ?? []) as any[];
  const approved = useMemo(() => approvedTemplates(templates), [templates]);
  const others = useMemo(() => otherTemplates(templates), [templates]);
  const campaigns = (dash?.campaigns ?? []) as any[];
  const hasApproved = approved.length > 0;

  const interval = resolveIntervalSeconds(pace, customSeconds);
  const finalQty = Math.max(1, Number(customQty || qty) || 1);
  const eta = estimateDurationSeconds(finalQty, interval);

  const refresh = async () => {
    try {
      const [res, snd]: any[] = await Promise.all([loadDash({}), loadSenders({})]);
      setDash(res);
      setSenders(snd);
      const current = res?.settings?.template_name ?? '';
      setSelectedTemplate((prev) => prev || current);
      setLoadError(null);
    } catch (e: any) {
      // Servidor reiniciando ou rede instável: mantemos a última leitura na tela.
      setLoadError(e?.message ?? 'Falha ao carregar os dados');
    } finally {
      setLoading(false);
    }
  };

  const refreshDetail = async (id: string, p = page, f = itemFilter) => {
    const res: any = await loadDetail({ data: { id, status: f, page: p } });
    setDetail(res);
  };

  useEffect(() => {
    const autoSync = async () => {
      // Sincronização automática (o servidor limita a repetição).
      try {
        await doSync({ data: { auto: true } });
      } catch {
        /* sem conexão: o painel segue mostrando o último estado */
      }
      await refresh();
    };

    void autoSync();
    // Autoatualização moderada: painel a cada 30 s (sem chamar a API do WhatsApp).
    const t1 = window.setInterval(() => void refresh(), 30_000);
    // Conexão e modelos: reconfirmação a cada 5 min.
    const t2 = window.setInterval(() => void autoSync(), 5 * 60_000);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  useEffect(() => {
    if (!activeId) return;
    void refreshDetail(activeId, page, itemFilter);
    const t = window.setInterval(() => void refreshDetail(activeId, page, itemFilter), 15000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, page, itemFilter]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro inesperado');
    } finally {
      setBusy(null);
      void refresh();
      if (activeId) void refreshDetail(activeId, page, itemFilter);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const m = dash?.metrics ?? {};
  const log = (dash?.log ?? []) as any[];
  const failures = log.filter((l) => l.status === 'failed' || l.status === 'blocked');
  const lastSync = templates.reduce<string | null>(
    (acc, t) => (t.synced_at && (!acc || t.synced_at > acc) ? t.synced_at : acc),
    null,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MessageCircle className="h-6 w-6 text-emerald-600" />
            WhatsApp em Massa
          </h1>
          <p className="text-sm text-slate-500">
            Acompanhe o consumo das últimas 24 horas e cada mensagem enviada.
          </p>
        </div>
        <Badge variant={hasApproved ? 'default' : 'secondary'}>
          {hasApproved ? `${approved.length} modelo(s) aprovado(s)` : 'Nenhum modelo aprovado'}
        </Badge>
      </header>

      {loadError && (
        <Alert>
          <AlertDescription>
            Não foi possível atualizar os números agora ({loadError}). Os dados na tela podem estar desatualizados —
            tentaremos de novo automaticamente.
          </AlertDescription>
        </Alert>
      )}

      {!dash?.hasApiKey && (
        <Alert>
          <AlertDescription>
            A conexão com o WhatsApp ainda não está configurada no servidor. Fale com o suporte antes de enviar.
          </AlertDescription>
        </Alert>
      )}

      {/* 1. CONSUMO E DESEMPENHO 24 h */}

      <Card>
        <CardHeader>
          <CardTitle>Consumo e desempenho nas últimas 24 horas</CardTitle>
          <CardDescription>
            Números calculados pelo próprio banco. “Aceita pela API” não significa entregue nem lida — a entrega só
            aparece quando a Meta enviar eventos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Tentativas em 24 h', value: m.attempts24h ?? 0, icon: Send },
              { label: 'Aceitas pela API', value: m.sent24h ?? 0, icon: CheckCircle2 },
              { label: 'Enviadas (Meta)', value: m.metaSent24h ?? 0, icon: Send },
              { label: 'Entregues', value: m.delivered24h ?? 0, icon: CheckCircle2 },
              { label: 'Lidas', value: m.read24h ?? 0, icon: CheckCircle2 },
              { label: 'Rejeitadas', value: m.rejected24h ?? 0, icon: AlertTriangle },
              { label: 'Aguardando tentativa', value: m.pendingQueue ?? 0, icon: Clock },
              { label: 'Pessoas diferentes em 24 h', value: m.uniqueRecipients24h ?? 0, icon: Users },
              { label: 'Taxa de sucesso', value: m.successRate === null || m.successRate === undefined ? '—' : `${m.successRate}%`, icon: CheckCircle2 },
              { label: 'Ritmo real (última hora)', value: m.realPacePerHour ?? 0, icon: Clock },
              { label: 'Campanhas ativas / pausadas', value: `${m.activeCampaigns ?? 0} / ${m.pausedCampaigns ?? 0}`, icon: Play },
              { label: 'Números bloqueados', value: m.blocked ?? 0, icon: Ban },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                <s.icon className="h-5 w-5 text-slate-400" />
                <div className="min-w-0">
                  <div className="text-xl font-bold text-slate-900">{s.value}</div>
                  <div className="truncate text-xs text-slate-500">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-1">
              <div>
                <strong>“Aceita pela API” não é “Entregue”.</strong> A entrega só é confirmada quando a Meta envia o
                evento pelo webhook. Configure o Pass-through webhook na Chakra apontando para{' '}
                <code className="rounded bg-slate-100 px-1">/api/public/whatsapp/webhook</code>.
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <a className="underline" href="https://app.chakrahq.com" target="_blank" rel="noreferrer">
                  Abrir Chakra — API Logs
                </a>
                <a className="underline" href="https://app.chakrahq.com" target="_blank" rel="noreferrer">
                  Abrir Chakra — Chats
                </a>
              </div>
            </AlertDescription>
          </Alert>

          {(m.stuckQueue ?? 0) > 0 && (
            <Alert>
              <AlertDescription>
                {m.stuckQueue} envio(s) ficaram sem resposta da API e foram marcados como falha técnica. O reenvio é
                somente manual.
              </AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-slate-500">
            Mostramos apenas o consumo observado nas últimas 24 horas — nenhum limite é estimado por aqui.
          </p>



          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Último envio aceito</div>
              <div className="text-slate-800">{fmtDate(m.lastSentAt)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Última falha</div>
              <div className="text-slate-800">{fmtDate(m.lastFailureAt)}</div>
              {m.lastFailureMessage && <div className="text-xs text-red-600">{m.lastFailureMessage}</div>}
            </div>
          </div>

          {(dash?.byTemplate ?? []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2">Modelo</th>
                    <th>Aceitas</th>
                    <th>Falhas</th>
                    <th>Bloqueadas</th>
                  </tr>
                </thead>
                <tbody>
                  {(dash.byTemplate as any[]).map((t) => (
                    <tr key={t.template} className="border-b last:border-0">
                      <td className="py-2 font-medium text-slate-800">{t.template}</td>
                      <td>{t.sent}</td>
                      <td>{t.failed}</td>
                      <td>{t.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(dash?.byCampaign ?? []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="py-2">Campanha</th>
                    <th>Situação</th>
                    <th title="POSTs realmente feitos ao provedor, incluindo os que falharam depois.">Tentativas</th>
                    <th title="Respostas HTTP 2xx da API — continuam contando mesmo se a Meta rejeitar depois.">
                      Aceitas pela API
                    </th>
                    <th title="A Meta confirmou o envio: sent + delivered + read.">Enviadas (Meta)</th>
                    <th title="Chegaram ao aparelho: delivered + read.">Entregues</th>
                    <th title="Mensagens lidas pelo destinatário (read).">Lidas</th>
                    <th title="Falha final da Meta ou recusa da API — o número entra na lista de bloqueio.">
                      Rejeitadas
                    </th>
                    <th title="A chamada pode ter saído, mas não houve confirmação. Nunca é reenviada automaticamente.">
                      Confirmação pendente
                    </th>
                    <th title="Reservadas para a campanha e ainda sem nenhuma tentativa.">Na fila</th>
                  </tr>
                </thead>
                <tbody>
                  {(dash.byCampaign as any[]).map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 font-medium text-slate-800">{c.name}</td>
                      <td>{CAMPAIGN_LABEL[c.status] ?? c.status}</td>
                      <td title="POSTs realmente feitos ao provedor.">{c.attempts}</td>
                      <td title="Respostas HTTP 2xx da API, mesmo se rejeitadas depois.">{c.accepted}</td>
                      <td title="sent + delivered + read confirmados pela Meta.">{c.metaSent}</td>
                      <td title="delivered + read.">{c.delivered}</td>
                      <td title="read.">{c.read}</td>
                      <td title="Falha final da Meta ou recusa da API.">{c.rejected}</td>
                      <td title="Aceita sem confirmação — nunca reenviada automaticamente.">{c.confirmationPending}</td>
                      <td title="Sem nenhuma tentativa ainda.">{c.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                Números por campanha são cumulativos (campanha inteira), não uma janela de 24 horas.
                <b> Tentativas</b> = POSTs realmente feitos. <b>Aceitas pela API</b> = respostas HTTP 2xx, mesmo que a
                Meta rejeite depois. <b>Enviadas (Meta)</b> = sent + delivered + read. <b>Entregues</b> = delivered +
                read. <b>Lidas</b> = read. <b>Rejeitadas</b> = falha final da Meta.
                <b> Confirmação pendente</b> = a chamada pode ter saído, mas não houve confirmação — nunca é reenviada
                automaticamente. Testes avulsos enviados para um número digitado não entram nestes números.
              </p>

            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase text-slate-500">Últimos envios</div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void refresh()}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar agora
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === 'reconcile'}
                  onClick={() =>
                    run('reconcile', async () => {
                      const r: any = await doReconcile({ data: { facts: CONFIRMED_REJECTIONS } });
                      toast.success(`${r.updated} registro(s) reconciliado(s)`);
                    })
                  }
                >
                  Reconciliar rejeições confirmadas
                </Button>
              </div>
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">Empresa</th>
                    <th>Telefone</th>
                    <th>Modelo</th>
                    <th>API</th>
                    <th>Meta</th>
                    <th>Código / motivo</th>
                    <th>wamid</th>
                    <th>Aceita</th>
                    <th>Entregue</th>
                    <th>Lida</th>
                  </tr>
                </thead>
                <tbody>
                  {log.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-4 text-slate-400">
                        Nenhum envio registrado ainda.
                      </td>
                    </tr>
                  )}
                  {log.map((l) => (
                    <tr key={l.id} className="border-t align-top">
                      <td className="max-w-[180px] truncate px-3 py-2">{l.company}</td>
                      <td className="whitespace-nowrap">{l.phone}</td>
                      <td>{l.template}</td>
                      <td>{API_STATUS_LABEL[l.apiStatus] ?? ITEM_LABEL[l.status] ?? l.status}</td>
                      <td>{l.deliveryStatus ? DELIVERY_LABEL[l.deliveryStatus] ?? l.deliveryStatus : 'Aguardando evento'}</td>
                      <td className="max-w-[220px] truncate text-red-600">
                        {l.errorCode ? `${l.errorCode} — ` : ''}
                        {l.errorReason ?? l.error ?? '—'}
                      </td>
                      <td className="max-w-[160px] truncate font-mono text-xs text-slate-500">{l.wamid ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs">{fmtDate(l.acceptedAt)}</td>
                      <td className="whitespace-nowrap text-xs">{fmtDate(l.deliveredAt)}</td>
                      <td className="whitespace-nowrap text-xs">{fmtDate(l.readAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* 3. NÚMERO REMETENTE */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Número remetente</CardTitle>
            <CardDescription>
              O número que aparece para quem recebe. Ele é lido direto da sua conta oficial — nada é digitado à mão.
              {senders?.lastSyncAt ? ` Última sincronização: ${fmtDate(senders.lastSyncAt)}.` : ' Nunca sincronizado.'}
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            disabled={busy === 'sync'}
            onClick={() =>
              run('sync', async () => {
                const r: any = await doSync({ data: { auto: false } });
                if (r?.connection?.ok) {
                  toast.success(
                    `${r.connection.senders?.length ?? 0} número(s) e ${r.templates?.synced ?? 0} modelo(s) sincronizados`,
                  );
                } else {
                  toast.error(r?.connection?.error ?? 'Não foi possível sincronizar');
                }
              })
            }
          >
            {busy === 'sync' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar conexão e modelos
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {senders?.selected ? (
            <div className="rounded-md border p-3">
              <div className="font-medium">{senders.selected.display_phone_number ?? senders.selected.phone_number_id}</div>
              <div className="text-sm text-muted-foreground">
                {senders.selected.verified_name ?? 'Sem nome verificado'} · {senders.selected.status ?? '—'}
              </div>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                Nenhum número conectado no momento. Sincronize a conexão para carregar os números disponíveis.
              </AlertDescription>
            </Alert>
          )}

          {senders?.needsManualChoice && (
            <Alert>
              <AlertDescription>
                Há mais de um número conectado. Escolha qual deve enviar as campanhas.
              </AlertDescription>
            </Alert>
          )}

          {(senders?.senders ?? []).length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="sender">Número usado nos envios</Label>
              <select
                id="sender"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={senders?.selected?.phone_number_id ?? ''}
                onChange={(e) =>
                  run('sender', async () => {
                    const r: any = await doSelectSender({ data: { phoneNumberId: e.target.value } });
                    if (r.ok) toast.success('Número remetente atualizado');
                    else toast.error(r.error ?? 'Não foi possível usar este número');
                    await refresh();
                  })
                }
              >
                <option value="">Selecione…</option>
                {(senders?.senders ?? [])
                  .filter((s: any) => s.is_active)
                  .map((s: any) => (
                    <option key={s.phone_number_id} value={s.phone_number_id}>
                      {s.display_phone_number ?? s.phone_number_id} — {s.verified_name ?? 'sem nome'}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {senders?.sendBlockedReason && (
            <Alert variant="destructive">
              <AlertDescription>{senders.sendBlockedReason}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 4. MODELOS */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Modelos e sincronização</CardTitle>
            <CardDescription>
              A lista vem direto da conta do número selecionado. Só modelos aprovados podem ser usados no envio.
              {lastSync ? ` Última sincronização: ${fmtDate(lastSync)}.` : ' Nunca sincronizado.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!hasApproved && (
            <Alert>
              <AlertDescription>
                Nenhum modelo está aprovado no momento, então iniciar e enviar continuam bloqueados. A aprovação depende
                da Meta — sincronize os modelos depois que ela liberar.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tpl">Modelo usado nos envios</Label>
            <select
              id="tpl"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedTemplate}
              disabled={!hasApproved}
              onChange={(e) => {
                const name = e.target.value;
                setSelectedTemplate(name);
                void run('select', async () => {
                  const r: any = await doSelect({ data: { name } });
                  if (r.ok) toast.success('Modelo escolhido salvo');
                  else toast.error(r.error);
                });
              }}
            >
              <option value="">Selecione um modelo aprovado…</option>
              {approved.map((t: any) => (
                <option key={t.name} value={t.name}>
                  {t.name} · {t.language}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-xs text-slate-500">
                Cada empresa recebe o próprio nome, o próprio CNPJ e o próprio link no botão.
              </p>
            )}
          </div>

          {others.length > 0 && (
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Modelos indisponíveis para envio</div>
              <div className="flex flex-wrap gap-2">
                {others.map((t: any) => (
                  <Badge key={t.name} variant="secondary">
                    {t.name}: {STATUS_LABEL[String(t.status).toUpperCase()] ?? t.status}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. TESTE */}
      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle>Envio de teste</CardTitle>
          <CardDescription>
            Escolha uma empresa já importada e um número de destino. A mensagem usa os dados da empresa, mas chega
            somente no número que você digitar — o telefone salvo não é alterado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q">Buscar empresa (nome ou CNPJ)</Label>
              <div className="flex gap-2">
                <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Padaria ou 11222333" />
                <Button
                  variant="secondary"
                  disabled={busy === 'search'}
                  onClick={() =>
                    run('search', async () => {
                      const r: any = await doSearch({ data: { q } });
                      setOptions(r ?? []);
                      if (!r?.length) toast.info('Nenhuma empresa com celular válido e link ativo');
                    })
                  }
                >
                  {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {options.length > 0 && (
                <div className="max-h-44 overflow-auto rounded-md border">
                  {options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${chosen?.id === o.id ? 'bg-emerald-50' : ''}`}
                      onClick={() => setChosen(o)}
                    >
                      <div className="font-medium text-slate-800">{o.name}</div>
                      <div className="text-xs text-slate-500">{formatCNPJ(o.cnpj)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tphone">Número de destino do teste (obrigatório)</Label>
              <Input
                id="tphone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
              <p className="text-xs text-slate-500">O teste não entra na fila e não conta como campanha.</p>
            </div>
          </div>

          {chosen && (
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="text-xs font-semibold uppercase text-slate-500">Prévia do teste</div>
              <p className="text-slate-700">Empresa: <b>{chosen.name}</b></p>
              <p className="text-slate-700">CNPJ: <b>{formatCNPJ(chosen.cnpj)}</b></p>
              <p className="text-slate-700">Link: <b>/c/{chosen.token}</b></p>
              <p className="text-slate-700">Modelo: <b>{selectedTemplate || '—'}</b></p>
            </div>
          )}

          <Button
            disabled={busy === 'test' || !chosen || !testPhone.trim() || !selectedTemplate || false}
            onClick={() => {
              if (
                !window.confirm(
                  `Enviar teste do modelo "${selectedTemplate}" com os dados de ${chosen.name} somente para ${testPhone}?`,
                )
              )
                return;
              void run('test', async () => {
                const r: any = await doTest({
                  data: { companyId: chosen.id, phone: testPhone.trim(), templateName: selectedTemplate },
                });
                if (r.ok) toast.success(`Teste enviado para ${r.phone}`);
                else toast.error(r.error);
              });
            }}
          >
            {busy === 'test' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar teste
          </Button>
        </CardContent>
      </Card>

      {/* 4a. CONSULTA AUTOMÁTICA DO DIA */}
      <ConsultaInline />

      {/* 4b. FILA DE PRONTIDÃO + IMPORTAÇÃO */}
      <WhatsappReadyPanel onChanged={() => void refresh()} />

      {/* 5. NOVA CAMPANHA */}

      <Card>
        <CardHeader>
          <CardTitle>Nova campanha</CardTitle>
          <CardDescription>
            Monta a fila com as empresas mais antigas que tenham celular válido, link ativo e nunca tenham recebido esta
            campanha. Hoje há {m.audience ?? 0} empresa(s) com celular válido cadastrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cname">Nome da campanha</Label>
            <Input id="cname" value={campName} onChange={(e) => setCampName(e.target.value)} placeholder="Aviso CNPJ — agosto" />
          </div>

          <div className="space-y-1.5">
            <Label>Quantidade de empresas</Label>
            <div className="flex flex-wrap gap-2">
              {QUANTITY_OPTIONS.map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={!customQty && qty === n ? 'default' : 'outline'}
                  onClick={() => {
                    setQty(n);
                    setCustomQty('');
                  }}
                >
                  {n}
                </Button>
              ))}
              <Input
                className="w-28"
                placeholder="Outro"
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Ritmo de envio</Label>
            <div className="grid gap-2 sm:grid-cols-4">
              {PACE_LIST.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPace(p.id)}
                  className={`rounded-lg border p-3 text-left text-sm ${pace === p.id ? 'border-emerald-500 bg-emerald-50' : 'bg-white'}`}
                >
                  <div className="font-semibold text-slate-800">{p.label}</div>
                  <div className="text-xs text-slate-500">{p.description}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPace('custom')}
                className={`rounded-lg border p-3 text-left text-sm ${pace === 'custom' ? 'border-emerald-500 bg-emerald-50' : 'bg-white'}`}
              >
                <div className="font-semibold text-slate-800">Personalizado</div>
                <div className="text-xs text-slate-500">Mínimo de {MIN_INTERVAL_SECONDS} s entre mensagens</div>
              </button>
            </div>
            {pace === 'custom' && (
              <Input
                type="number"
                className="w-40"
                value={customSeconds}
                min={MIN_INTERVAL_SECONDS}
                onChange={(e) => setCustomSeconds(Number(e.target.value))}
              />
            )}
            <p className="text-xs text-slate-500">
              1 mensagem a cada {interval} s ({messagesPerHour(interval)} por hora) · previsão de duração para{' '}
              {finalQty} empresas: <b>{formatDuration(eta)}</b>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap">Máximo de pessoas diferentes em 24 h</Label>
            <Input id="cap" type="number" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
            <p className="text-xs text-slate-500">Este teto é separado da velocidade e nunca é ultrapassado.</p>
          </div>

          <div className="flex items-center gap-3 pt-6">
            <Switch id="cont" checked={continuous} onCheckedChange={setContinuous} />
            <Label htmlFor="cont" className="text-sm">
              Modo contínuo — importar o próximo lote só quando a fila atual terminar
            </Label>
          </div>

          <div className="md:col-span-2">
            <Button
              disabled={busy === 'create' || !hasApproved || !selectedTemplate || !campName.trim() || false}
              onClick={() => {
                if (
                  !window.confirm(
                    `Criar a campanha "${campName.trim()}" com até ${finalQty} empresa(s), 1 mensagem a cada ${interval} s ` +
                      `(${messagesPerHour(interval)}/h), teto de ${dailyCap} pessoas em 24 h e previsão de ${formatDuration(eta)}?`,
                  )
                )
                  return;
                void run('create', async () => {
                  const r: any = await doCreate({
                    data: {
                      name: campName.trim(),
                      templateName: selectedTemplate,
                      quantity: finalQty,
                      pacePreset: pace,
                      customSeconds: pace === 'custom' ? customSeconds : undefined,
                      dailyCap,
                      continuousMode: continuous,
                    },
                  });
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setActiveId(r.id);
                  setCampName('');
                  const resumo =
                    `Reutilizadas da fila: ${r.reusedFromQueue} · Importadas para completar: ${r.imported} · ` +
                    `Reservadas: ${r.reserved} de ${r.requested} · Ignoradas: ${r.skipped} · Faltando: ${r.missing}.`;
                  if (r.autoStarted) {
                    toast.success(`Campanha criada e iniciada automaticamente. ${resumo}`);
                  } else {
                    toast.warning(
                      `Campanha criada como rascunho — nenhum envio começou. ${resumo}` +
                        (r.startError ? ` Motivo: ${r.startError}` : ''),
                    );
                  }
                });

              }}
            >
              {busy === 'create' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar campanha
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 6. CAMPANHAS / FILA */}
      <Card>
        <CardHeader>
          <CardTitle>Campanhas e fila</CardTitle>
          <CardDescription>Elas continuam funcionando no servidor mesmo com esta página fechada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {campaigns.length === 0 && <p className="py-4 text-sm text-slate-400">Nenhuma campanha criada ainda.</p>}
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => { setActiveId(c.id); setPage(1); }}>
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    Modelo {c.template_name} · 1 a cada {c.interval_seconds} s · alvo {c.target_count}
                    {c.continuous_mode ? ' · contínua' : ''}
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={c.status === 'running' ? 'default' : c.status === 'paused' ? 'secondary' : 'outline'}>
                    {CAMPAIGN_LABEL[c.status] ?? c.status}
                  </Badge>
                  {c.status !== 'running' && c.status !== 'finished' && (
                    <Button
                      size="sm"
                      disabled={busy === `st${c.id}` || !hasApproved || false}
                      onClick={() => {
                        if (!window.confirm(`Iniciar os envios da campanha "${c.name}" agora?`)) return;
                        void run(`st${c.id}`, async () => {
                          const r: any = await doControl({ data: { id: c.id, action: 'resume' } });
                          if (!r.ok) toast.error(r.error);
                          else {
                            toast.success('Campanha em andamento');
                            void doTick({ data: { id: c.id } });
                          }
                        });
                      }}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" />
                      {c.status === 'paused' ? 'Continuar' : 'Iniciar'}
                    </Button>
                  )}
                  {c.status === 'running' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === `pa${c.id}`}
                      onClick={() =>
                        run(`pa${c.id}`, async () => {
                          await doControl({ data: { id: c.id, action: 'pause' } });
                          toast.success('Campanha pausada');
                        })
                      }
                    >
                      <Pause className="mr-1 h-3.5 w-3.5" />Pausar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `csv${c.id}`}
                    onClick={() =>
                      run(`csv${c.id}`, async () => {
                        const r: any = await doExport({ data: { id: c.id } });
                        if (!r.ok) {
                          toast.error(r.error);
                          return;
                        }
                        const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = r.filename;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                    }
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />CSV
                  </Button>
                  {c.status !== 'finished' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-500 hover:text-red-600"
                      disabled={busy === `fi${c.id}`}
                      onClick={() => {
                        if (!window.confirm('Encerrar esta campanha? Os envios já concluídos são mantidos no histórico.')) return;
                        void run(`fi${c.id}`, async () => {
                          await doControl({ data: { id: c.id, action: 'finish' } });
                          toast.success('Campanha encerrada');
                        });
                      }}
                    >
                      <Square className="mr-1 h-3.5 w-3.5" />Encerrar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={busy === `del${c.id}`}
                    title="Sem nenhuma tentativa, a campanha é apagada e as reservas voltam para a fila. Com histórico, ela é arquivada para preservar a auditoria."
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Excluir a campanha "${c.name}"?\n\n` +
                            'Sem nenhuma tentativa: ela é apagada e as empresas reservadas voltam para a fila de prontidão.\n' +
                            'Com qualquer tentativa, wamid ou evento: ela é arquivada (sai desta lista) e todo o histórico e os bloqueios são preservados.',
                        )
                      )
                        return;
                      void run(`del${c.id}`, async () => {
                        const r: any = await doControl({ data: { id: c.id, action: 'delete' } });
                        if (!r.ok) {
                          toast.error(r.error);
                          return;
                        }
                        setActiveId((cur) => (cur === c.id ? null : cur));
                        toast.success(
                          r.archivedInstead
                            ? `Campanha arquivada: há histórico de tentativas, então tudo foi preservado. ${r.released ?? 0} reserva(s) liberada(s).`
                            : `Campanha excluída. ${r.released ?? 0} reserva(s) devolvida(s) à fila de prontidão.`,
                        );
                      });
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Excluir campanha
                  </Button>
                </div>
              </div>

              {c.paused_reason && <p className="mt-2 text-xs text-amber-700">{c.paused_reason}</p>}
            </div>
          ))}

          {detail?.campaign && (
            <div className="space-y-4 rounded-lg border bg-slate-50 p-3">
              <div className="font-semibold text-slate-800">{detail.campaign.name}</div>
              <div className="flex flex-wrap gap-2 text-sm">
                {[
                  ['Na fila', detail.counts?.pending ?? 0],
                  ['Enviando', detail.counts?.sending ?? 0],
                  ['Aceitas pela API', detail.counts?.sent ?? 0],
                  ['Falhas', detail.counts?.failed ?? 0],
                  ['Bloqueadas', detail.counts?.blocked ?? 0],
                  ['Confirmação pendente', detail.counts?.confirmation_pending ?? 0],
                  ['Canceladas sem tentativa', detail.counts?.cancelled ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border bg-white px-3 py-1.5">
                    <span className="text-slate-500">{label}: </span>
                    <b className="text-slate-800">{value as number}</b>
                  </div>
                ))}
                <div className="rounded-md border bg-white px-3 py-1.5">
                  <span className="text-slate-500">Previsão de término: </span>
                  <b className="text-slate-800">
                    {formatDuration(
                      estimateDurationSeconds(detail.counts?.pending ?? 0, detail.campaign.interval_seconds ?? 30),
                    )}
                  </b>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    'all',
                    'pending',
                    'sending',
                    'sent',
                    'failed',
                    'blocked',
                    'confirmation_pending',
                    'cancelled',
                  ] as const
                ).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={itemFilter === f ? 'default' : 'outline'}
                    onClick={() => {
                      setItemFilter(f);
                      setPage(1);
                    }}
                  >
                    {f === 'all' ? 'Todas' : ITEM_LABEL[f]}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === 'refill'}
                  onClick={() =>
                    run('refill', async () => {
                      const r: any = await doRefill({
                        data: { id: detail.campaign.id, quantity: detail.campaign.target_count ?? 50 },
                      });
                      toast.success(`${r.inserted} empresa(s) adicionada(s) à fila`);
                    })
                  }
                >
                  Completar fila
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-500 hover:text-red-600"
                  disabled={busy === 'clrp'}
                  onClick={() => {
                    if (!window.confirm('Remover as mensagens que ainda não saíram? O histórico de envios é mantido.')) return;
                    void run('clrp', async () => {
                      await doControl({ data: { id: detail.campaign.id, action: 'clear_pending' } });
                      toast.success('Pendentes removidas');
                    });
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Remover não tentadas
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === 'repair'}
                  onClick={() =>
                    run('repair', async () => {
                      const r: any = await doRepair({ data: { id: detail.campaign.id, apply: true } });
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success(
                        `Reparo aplicado: ${r.report.correlated} evento(s) correlacionado(s), ` +
                          `${r.report.restored} rejeitada(s) recuperada(s), ` +
                          `${r.report.confirmation_pending} em confirmação pendente, ` +
                          `${r.report.orphan_reservations} reserva(s) órfã(s) liberada(s).`,
                      );
                    })
                  }
                >
                  Reparar dados
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-500 hover:text-red-600"
                  disabled={busy === 'arch'}
                  onClick={() => {
                    if (!window.confirm('Arquivar esta campanha? O histórico de tentativas e bloqueios é preservado.')) return;
                    void run('arch', async () => {
                      const r: any = await doControl({ data: { id: detail.campaign.id, action: 'delete' } });
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      setActiveId(null);
                      toast.success(r.message ?? 'Campanha removida');
                    });
                  }}
                >
                  Excluir campanha
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                "Remover não tentadas" só apaga o que nunca foi entregue à API e devolve essas empresas para a fila de
                prontidão. Nada que já teve tentativa é apagado. "Excluir campanha" arquiva quando existe histórico.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-slate-500">
                      <th className="py-2">Empresa</th>
                      <th>CNPJ</th>
                      <th>Situação</th>
                      <th>Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((detail.items ?? []) as any[]).map((i) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="max-w-[220px] truncate py-2">{i.company_name ?? '—'}</td>
                        <td>{i.cnpj ? formatCNPJ(i.cnpj) : '—'}</td>
                        <td>{ITEM_LABEL[i.status] ?? i.status}</td>
                        <td className="max-w-[240px] truncate text-red-600">{i.error_message ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-xs text-slate-500">Página {page}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * (detail.pageSize ?? 25) >= (detail.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 7. FALHAS E BLOQUEIOS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Falhas e bloqueios
          </CardTitle>
          <CardDescription>
            Números com falha permanente entram na lista de bloqueio e nunca mais recebem mensagens. Total bloqueado
            hoje: {m.blocked ?? 0}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failures.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma falha nas últimas 24 horas.</p>
          ) : (
            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">Quando</th>
                    <th>Empresa</th>
                    <th>Telefone</th>
                    <th>Situação</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.at)}</td>
                      <td className="max-w-[180px] truncate">{l.company}</td>
                      <td>{l.phone}</td>
                      <td>{ITEM_LABEL[l.status] ?? l.status}</td>
                      <td className="max-w-[260px] truncate text-red-600">{l.error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase text-slate-500">Lista de bloqueios permanentes</div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === 'blk'}
                onClick={() =>
                  run('blk', async () => {
                    const r: any = await loadBlocked({ data: { page: 1 } });
                    setBlocked(r);
                    setBlockedOpen(true);
                  })
                }
              >
                {blockedOpen ? 'Atualizar lista' : 'Ver bloqueados'}
              </Button>
            </div>
            {blockedOpen && blocked && (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  {blocked.total} telefone(s) e {blocked.blockedCnpjs} CNPJ(s) bloqueados. Bloqueios e histórico de
                  falhas nunca são apagados pela limpeza de campanhas.
                </p>
                <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs uppercase text-slate-500">
                        <th className="px-3 py-2">Quando</th>
                        <th>Telefone</th>
                        <th>CNPJ</th>
                        <th>Origem</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((blocked.items ?? []) as any[]).map((b) => (
                        <tr key={b.id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(b.at)}</td>
                          <td>{b.phone}</td>
                          <td>{b.cnpj ?? '—'}</td>
                          <td>{b.source}</td>
                          <td className="max-w-[280px] truncate text-red-600">{b.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </CardContent>

      </Card>
    </div>
  );
}
