import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  DEFAULT_DESIGN,
  renderHtml,
  substitute,
  formatCnpj,
} from '@/lib/email-campaign/template';
import {
  Loader2,
  Play,
  Pause,
  Square,
  RefreshCw,
  Send,
  TestTube2,
  Eye,
  RotateCcw,
  Trash2,
  Zap,
  Activity,
} from 'lucide-react';
// FloatingStatsPanel agora é montado globalmente em _authenticated.painel.tsx
import { getEmailStats, type EmailStatsResult } from '@/lib/email-campaign/stats.functions';
import { useStore } from '@/lib/automation/store';
import { DateRangeFilter, computeDateRange, type DatePreset } from '@/components/painel/DateRangeFilter';

import { toast } from 'sonner';
import {
  envioStore,
  loadRecipients,
  resetStatuses,
  clearQueue,
  clearLogs,
  startSending,
  togglePause,
  stopSending,
  sendSingle,
  sendTestOnce,
  buildVarsForPreview,
  setSubject,
  setDelaySec,
  setBatchLimit,
  setLimitMode,
  setDailyLimit,
  setHourlyLimit,
  setHourlyRestMin,
  setStopAtDaily,
  setTestMode,
  setTestRecipient,
  setFromName,
  setFromAddress,
  setReplyTo,
  setShowFloating,
  type QueueItem,
  mergedDesign,
  loadSavedSubject,
  syncFromMessageModel,
} from '@/lib/automation/envio-engine';


import { consultaStore } from '@/lib/automation/consulta-engine';



export const Route = createFileRoute('/_authenticated/painel/envio-massa')({
  component: EnvioMassa,
});

function EnvioMassa() {
  // Reads da engine global (persistem entre abas / o loop continua).
  const queue = useStore(envioStore, (s) => s.queue);
  const subject = useStore(envioStore, (s) => s.subject);
  const delaySec = useStore(envioStore, (s) => s.delaySec);
  const batchLimit = useStore(envioStore, (s) => s.batchLimit);
  const testMode = useStore(envioStore, (s) => s.testMode);
  const testRecipient = useStore(envioStore, (s) => s.testRecipient);
  const fromName = useStore(envioStore, (s) => s.fromName);
  const fromAddress = useStore(envioStore, (s) => s.fromAddress);
  const replyTo = useStore(envioStore, (s) => s.replyTo);
  const running = useStore(envioStore, (s) => s.running);
  const paused = useStore(envioStore, (s) => s.paused);
  const loading = useStore(envioStore, (s) => s.loading);
  const logs = useStore(envioStore, (s) => s.logs);
  const showFloating = useStore(envioStore, (s) => s.showFloating);
  const dailyLimit = useStore(envioStore, (s) => s.dailyLimit);
  const hourlyLimit = useStore(envioStore, (s) => s.hourlyLimit);
  const hourlyRestMin = useStore(envioStore, (s) => s.hourlyRestMin);
  const limitMode = useStore(envioStore, (s) => s.limitMode);
  const sentToday = useStore(envioStore, (s) => s.sentToday);
  const stopAtDaily = useStore(envioStore, (s) => s.stopAtDaily);

  const sentThisHour = useStore(envioStore, (s) => s.sentThisHour);
  const importDelaySec = useStore(consultaStore, (s) => s.autoImportDelaySec);
  const sentEmails = useStore(envioStore, (s) => s.sentEmails);

  // Filtro de período (para contadores de histórico de enviados nesta aba)
  const [preset, setPreset] = useState<DatePreset>('today');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const range = useMemo(() => computeDateRange(preset, fromDate, toDate), [preset, fromDate, toDate]);
  const sentInPeriod = useMemo(() => {
    const fromMs = range.from?.getTime();
    const toMs = range.to?.getTime();
    return sentEmails.filter((e) => {
      const t = new Date(e.sentAt).getTime();
      if (fromMs !== undefined && t < fromMs) return false;
      if (toMs !== undefined && t > toMs) return false;
      return true;
    }).length;
  }, [sentEmails, range.from, range.to]);

  const [emailStatsRaw, setEmailStatsRaw] = useState<EmailStatsResult | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Sempre mostra os números reais do log oficial do Lovable Emails.
  // (Removemos a "baseline" que subtraía valores — confundia o operador,
  // pois deixava o "Enviados na última hora" em 0 mesmo com envios reais.)
  const emailStats = emailStatsRaw;

  // Limpa qualquer baseline antiga persistida em versões anteriores.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem('envio:statsBaseline'); } catch {}
    }
  }, []);

  const refreshStats = async () => {
    setLoadingStats(true);
    try {
      const res = await getEmailStats();
      setEmailStatsRaw(res as EmailStatsResult);
    } catch (e: any) {
      toast.error('Falha ao consultar limites: ' + e.message);
    } finally {
      setLoadingStats(false);
    }
  };




  const [previewIdx, setPreviewIdx] = useState(0);
  const [designTick, setDesignTick] = useState(0);

  // Carregar fila automaticamente (persistido)
  const [autoLoadQueue, setAutoLoadQueue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem('envio:autoLoadQueue');
    return v == null ? true : v === '1';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('envio:autoLoadQueue', autoLoadQueue ? '1' : '0');
    }
  }, [autoLoadQueue]);

  // Sincroniza assunto/remetente do Modelo de Mensagem automaticamente.
  // Não carrega destinatários automaticamente — só quando o toggle
  // "Auto-carregar fila" estiver ligado, ou via botão manual.
  useEffect(() => {
    syncFromMessageModel();
    void refreshStats();
    // Limpeza única: remove pendências antigas herdadas do modo em lote.
    try {
      const done = window.localStorage.getItem('envio:pendingClearedV2');
      if (!done) {
        envioStore.set((s) => ({ queue: s.queue.filter((q) => q.status !== 'pending') }));
        window.localStorage.setItem('envio:pendingClearedV2', '1');
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-carregar fila em intervalo curto (1 empresa por vez) quando o toggle está ligado.
  useEffect(() => {
    if (!autoLoadQueue) return;
    const tick = () => {
      if (loading || running) return;
      // Só sincroniza a próxima quando não houver nenhum pendente na fila.
      const pending = envioStore.get().queue.filter((q) => q.status === 'pending').length;
      if (pending > 0) return;
      void loadRecipients({ limit: 1 });
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [autoLoadQueue, loading, running]);

  // Recarrega design/assunto quando o Modelo de Mensagem é salvo (mesma ou outra aba)
  // ou quando esta aba recebe foco novamente.
  useEffect(() => {
    const bump = () => {
      syncFromMessageModel();
      setDesignTick((t) => t + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith('campanha:')) bump();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, []);


  const stats = useMemo(() => {
    const total = queue.length;
    const sent = queue.filter((q) => q.status === 'sent').length;
    const errors = queue.filter((q) => q.status === 'error').length;
    const suppressed = queue.filter((q) => q.status === 'suppressed').length;
    const pending = queue.filter((q) => q.status === 'pending').length;
    return { total, sent, errors, suppressed, pending };
  }, [queue]);

  const previewItem = queue[previewIdx];
  const effectiveSubject = loadSavedSubject() || subject;
  const previewHtml = useMemo(() => {
    if (!previewItem) return '';
    const vars = buildVarsForPreview(previewItem);
    const design = { ...DEFAULT_DESIGN, ...mergedDesign() };
    return renderHtml(design, vars);
  }, [previewItem, fromName, fromAddress, subject, designTick]);


  const progress =
    stats.total > 0
      ? Math.round(((stats.sent + stats.errors + stats.suppressed) / stats.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Envio em Massa</h1>
        <p className="text-sm text-slate-500">
          Dispara e-mails via Lovable Emails (domínio profissional) com controle de delay, pausa e modo teste.
        </p>
        {running && (
          <p className="mt-1 text-xs font-semibold text-emerald-700">
            ● Envio ativo — continua rodando mesmo se você trocar de aba do painel.
          </p>
        )}
      </div>

      <DateRangeFilter
        preset={preset}
        onPresetChange={setPreset}
        from={fromDate}
        to={toDate}
        onFromChange={setFromDate}
        onToChange={setToDate}
      />

      {/* Limites do Lovable Emails + Enviados confirmados */}
      <Card className="border-blue-100 bg-gradient-to-br from-blue-50/60 to-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-600" />
              Lovable Emails — status e limites
            </CardTitle>
            <p className="mt-1 text-xs text-slate-600">
              Envios saem pelo domínio profissional configurado no Lovable. Os números abaixo vêm do log oficial
              de entregas (última hora e últimas 24h). Os limites são aplicados no servidor: quando você bate a cota,
              o Lovable responde <code className="rounded bg-slate-100 px-1">HTTP 429</code> e a fila pausa e retoma
              automaticamente — você não precisa fazer nada.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="outline" onClick={refreshStats} disabled={loadingStats}>
              {loadingStats ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Atualizar
            </Button>
          </div>


        </CardHeader>
        <CardContent className="space-y-4">
          {/* Painel destaque: você pode enviar agora? */}
          {emailStats?.ok && (
            <div className="grid gap-3 sm:grid-cols-3">
              <BigStat
                label="Enviados na última hora"
                value={emailStats.lastHour.sent}
                sub={
                  emailStats.lastHour.rateLimited > 0
                    ? `⚠ ${emailStats.lastHour.rateLimited} rate-limit(s) recebido(s)`
                    : 'Sem rate-limit — pode enviar normalmente'
                }
                accent={emailStats.lastHour.rateLimited > 0 ? 'amber' : 'emerald'}
              />
              <BigStat
                label="Enviados nas últimas 24h"
                value={emailStats.last24h.sent}
                sub={`${emailStats.last24h.bounced} bounces · ${emailStats.last24h.complaint} reclamações`}
                accent="blue"
              />
              <BigStat
                label="Enviados hoje (contador local)"
                value={sentToday}
                sub={
                  dailyLimit === 0
                    ? 'Sem limite diário configurado'
                    : `Meta: ${dailyLimit} / dia · restam ${Math.max(0, dailyLimit - sentToday)}`
                }
                accent={dailyLimit > 0 && sentToday >= dailyLimit ? 'red' : 'slate'}
              />
            </div>
          )}

          {!emailStats ? (
            <div className="py-6 text-center text-sm text-slate-500">
              {loadingStats ? 'Consultando limites...' : 'Sem dados. Clique em "Atualizar".'}
            </div>
          ) : !emailStats.ok ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Não foi possível consultar os limites: {emailStats.message}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <LimitBlock title="Detalhes — última hora" bucket={emailStats.lastHour} accent="blue" />
              <LimitBlock title="Detalhes — últimas 24h" bucket={emailStats.last24h} accent="emerald" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Enviados no período" value={sentInPeriod} color="text-indigo-700" />
            <MiniStat label="Enviados confirmados (histórico total)" value={sentEmails.length} color="text-emerald-700" />
            <MiniStat
              label="Meta diária (parar ao atingir)"
              value={stopAtDaily > 0 ? `${sentToday} / ${stopAtDaily}` : `${sentToday} / ∞`}
              color={stopAtDaily > 0 && sentToday >= stopAtDaily ? 'text-red-700' : 'text-blue-700'}
            />
            <MiniStat label="Fila atual" value={queue.length} color="text-slate-700" />
          </div>

          {/* Como funciona / regras */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <div className="mb-2 text-sm font-semibold text-slate-800">Como funciona o envio no Lovable Emails</div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              <li>✅ <strong>Quota separada</strong>: e-mails de app (envio em massa) e de auth têm cotas independentes — um pico não bloqueia o outro.</li>
              <li>✅ <strong>Escala com o plano</strong>: quanto maior o plano do workspace, maior a cota horária e diária.</li>
              <li>✅ <strong>Retry automático</strong>: ao receber 429, a fila espera o tempo indicado pelo servidor e retoma sozinha.</li>
              <li>✅ <strong>Supressão automática</strong>: destinatários que deram bounce, reclamação ou descadastro são bloqueados no servidor — o envio retorna como "Suprimido" (não conta contra você).</li>
              <li>⚠ <strong>Sem tracking de aberturas</strong>: o Lovable Emails registra envio, rejeição, bounce, reclamação e descadastro. "Entregue" e "Aberto" não são rastreados.</li>
              <li>⚠ <strong>Anexos não suportados</strong>: envie links (Storage/URL) no corpo do e-mail em vez de arquivos anexos.</li>
              <li>💡 <strong>Sua proteção extra</strong>: use os perfis (Suave / Moderado / Turbo) e o campo "Parar tudo ao atingir X" para não estourar meta diária.</li>
              <li>💡 <strong>Modo horário + descanso</strong>: em Moderado (100/h), configure "descanso ao atingir o limite" para intervalar lotes automaticamente.</li>
            </ul>
          </div>

          <p className="text-[11px] text-slate-500">
            Após cada envio confirmado, o destinatário sai da fila e vai para a aba{' '}
            <strong>E-mails Enviados</strong> automaticamente.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
            <p className="text-xs text-slate-500">
              Preenchido automaticamente pelo{' '}
              <Link to="/painel/modelo-mensagem" className="text-blue-600 hover:underline font-medium">
                Modelo de Mensagem
              </Link>
              .
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Assunto</Label>
              <Input value={subject} readOnly className="bg-slate-50 text-slate-600" />
            </div>
            <div>
              <Label>Nome do remetente</Label>
              <Input value={fromName} readOnly className="bg-slate-50 text-slate-600" />
            </div>
            <div>
              <Label>E-mail remetente</Label>
              <Input value={fromAddress} readOnly className="bg-slate-50 text-slate-600" />
            </div>
            <div>
              <Label>Responder para (opcional)</Label>
              <Input
                placeholder="atendimento@seu-dominio.online"
                value={replyTo}
                readOnly
                className="bg-slate-50 text-slate-600"
              />
            </div>

            {/* Ritmo & Limites */}
            <div className="rounded-lg border-2 border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" />
                <div className="text-sm font-bold text-blue-900">Ritmo & Limites de envio</div>
              </div>

              {/* Toggle modo de limite */}
              <div className="flex gap-1 rounded-lg bg-white p-1 border border-blue-200">
                <button
                  type="button"
                  onClick={() => setLimitMode('daily')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    limitMode === 'daily'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Limite por dia
                </button>
                <button
                  type="button"
                  onClick={() => setLimitMode('hourly')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    limitMode === 'hourly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Limite por hora
                </button>
              </div>

              {/* Perfis recomendados */}
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-700">
                  Perfis recomendados{' '}
                  <span className="font-normal text-slate-500">
                    — clique 1 vez: aplicamos delay, fila e limite automaticamente
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(limitMode === 'daily'
                    ? [
                        { key: 'warmup1', title: 'Warm-up inicial', sub: 'Dias 1-3', v: 40, delay: 90, batch: 40, hint: '~40/dia · 1 a cada 90s' },
                        { key: 'warmup2', title: 'Warm-up médio', sub: 'Dias 4-7', v: 150, delay: 60, batch: 150, hint: '~150/dia · 1 a cada 60s' },
                        { key: 'warmup3', title: 'Warm-up avançado', sub: 'Dias 8-14', v: 400, delay: 45, batch: 200, hint: '~400/dia · 1 a cada 45s' },
                        { key: 'cruise', title: 'Ritmo saudável', sub: 'Após 15 dias', v: 800, delay: 30, batch: 300, hint: '~800/dia · 1 a cada 30s' },
                        { key: 'aggr', title: 'Volume alto', sub: 'Domínio quente', v: 1500, delay: 20, batch: 500, hint: '~1500/dia · 1 a cada 20s' },
                        { key: 'turbo', title: 'Turbo', sub: 'Domínio muito aquecido', v: 3000, delay: 10, batch: 1000, hint: '~3k/dia · 1 a cada 10s' },
                      ]
                    : [
                        { key: 'h_soft', title: 'Bem devagar', sub: 'Inicial / IP frio', v: 20, batch: 40 },
                        { key: 'h_low', title: 'Conservador', sub: 'Warm-up', v: 50, batch: 80 },
                        { key: 'h_med', title: 'Moderado', sub: 'Uso normal', v: 100, batch: 150 },
                        { key: 'h_high', title: 'Ativo', sub: 'Bom rep.', v: 150, batch: 250 },
                        { key: 'h_max', title: 'Máximo saudável', sub: 'Após aquecimento', v: 200, batch: 350 },
                        { key: 'h_turbo', title: 'Turbo', sub: 'Domínio maduro', v: 300, batch: 500 },
                        { key: 'h_400', title: 'Alto volume', sub: 'Domínio bem aquecido', v: 400, batch: 600 },
                        { key: 'h_500', title: 'Volume máximo', sub: 'Reputação sólida', v: 500, batch: 800 },
                      ].map((p) => {
                        const delay = Math.max(1, Math.round(3600 / p.v));
                        const hint =
                          delay >= 60
                            ? `${p.v}/h · 1 a cada ${Math.round(delay / 60)}min`
                            : `${p.v}/h · 1 a cada ${delay}s`;
                        return { ...p, delay, hint };
                      })
                  ).map((p) => {
                    const active =
                      delaySec === p.delay &&
                      batchLimit === p.batch &&
                      (limitMode === 'daily' ? dailyLimit === p.v : hourlyLimit === p.v);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setDelaySec(p.delay);
                          setBatchLimit(p.batch);
                          if (limitMode === 'daily') setDailyLimit(p.v);
                          else setHourlyLimit(p.v);
                          toast.success(`Perfil "${p.title}" aplicado`);
                        }}
                        className={`text-left rounded-md border p-2.5 transition-all ${
                          active
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400'
                            : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm'
                        }`}
                      >
                        <div className="text-[12.5px] font-bold text-slate-900">{p.title}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{p.sub}</div>
                        <div className="mt-1 text-[11px] text-slate-700">{p.hint}</div>
                      </button>
                    );
                  })}
              </div>

              {/* Descanso após atingir limite por hora */}
              {limitMode === 'hourly' && (
                <div className="rounded-md border-2 border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
                  <Label className="text-sm font-semibold text-indigo-900">
                    Descanso ao atingir o limite por hora (minutos)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={1440}
                    placeholder="Ex: 30"
                    value={hourlyRestMin}
                    onChange={(e) => setHourlyRestMin(parseInt(e.target.value || '0', 10))}
                  />
                  <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                    Quando bater <strong>{hourlyLimit || '—'} envios</strong> na hora, o sistema fica{' '}
                    <strong>{hourlyRestMin > 0 ? `${hourlyRestMin} min` : 'até a virada natural da hora'}</strong>{' '}
                    parado e depois envia o próximo lote. Use <strong>0</strong> para aguardar a próxima hora automaticamente.
                  </p>
                </div>
              )}

              </div>

              {/* Parar tudo ao atingir meta diária */}
              <div className="rounded-md border-2 border-red-200 bg-red-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-red-900 flex items-center gap-1.5">
                    <Square className="h-3.5 w-3.5" /> Parar tudo ao atingir (meta diária)
                  </Label>
                  <Badge
                    className={
                      stopAtDaily > 0 && sentToday >= stopAtDaily
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }
                  >
                    {sentToday} / {stopAtDaily > 0 ? stopAtDaily : '∞'}
                  </Badge>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  placeholder="Ex: 500"
                  value={stopAtDaily}
                  onChange={(e) => setStopAtDaily(parseInt(e.target.value || '0', 10))}
                />
                <p className="text-[11px] text-red-900/80 leading-relaxed">
                  Ao atingir este número de envios no dia, o sistema <strong>para tudo automaticamente</strong>:
                  envio em massa, consulta e importação automática. Use <strong>0</strong> para desativar.
                  Reseta à meia-noite.
                </p>
              </div>




              <div className="rounded border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-900 leading-relaxed">
                <strong>Regra de ouro:</strong> não passe de <strong>~100 envios/hora</strong>, envie
                entre <strong>09h-11h</strong> e <strong>14h-17h</strong> em dias úteis. Se bounces &gt; 5%
                ou reclamações &gt; 0,1%, reduza volume imediatamente.
              </div>
            </div>


            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <TestTube2 className="h-4 w-4" /> Modo teste
                </div>
                <p className="text-xs text-slate-500">Redireciona todos os envios para 1 e-mail.</p>
              </div>
              <Switch checked={testMode} onCheckedChange={setTestMode} />
            </div>
            {testMode && (
              <div className="space-y-2">
                <Label>E-mail de teste</Label>
                <Input
                  placeholder="seu-email@dominio.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={sendTestOnce}
                  disabled={running || !testRecipient}
                >
                  <TestTube2 className="h-4 w-4" /> Enviar 1 e-mail de teste agora
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => void loadRecipients()} disabled={loading || running}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Carregar fila
              </Button>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
                <Switch checked={autoLoadQueue} onCheckedChange={setAutoLoadQueue} />
                <span className="text-xs text-slate-700">
                  Auto-carregar fila {autoLoadQueue ? <b className="text-emerald-600">ligado</b> : <b className="text-slate-500">desligado</b>}
                </span>
              </div>
              <Button
                variant="outline"
                className="text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirm('Esvaziar a fila? As empresas importadas serão recarregadas automaticamente.')) {
                    clearQueue();
                  }
                }}
                disabled={running || queue.length === 0}
              >
                <Trash2 className="h-4 w-4" /> Limpar fila
              </Button>
              <span className="self-center text-xs text-slate-500">
                A fila sincroniza automaticamente com <b>Empresas Importadas</b>.
              </span>
            </div>



          </CardContent>
        </Card>

        {/* Progress & Controls */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Progresso</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <Stat label="Total" value={stats.total} />
              <Stat label="Pendentes" value={stats.pending} color="text-slate-700" />
              <Stat label="Enviados" value={stats.sent} color="text-emerald-600" />
              <Stat label="Suprimidos" value={stats.suppressed} color="text-amber-600" />
              <Stat label="Erros" value={stats.errors} color="text-red-600" />
            </div>
            <Progress value={progress} />
            <div className="flex flex-wrap gap-2">
              {!running ? (
                <Button
                  onClick={startSending}
                  disabled={queue.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Play className="h-4 w-4" /> {testMode ? 'Iniciar teste' : 'Iniciar envio real'}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={stopSending}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Square className="h-4 w-4" /> {testMode ? 'Parar teste' : 'Parar envio real'}
                  </Button>
                  <Button variant="outline" onClick={togglePause}>
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {paused ? 'Retomar' : 'Pausar'}
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={resetStatuses} disabled={running || queue.length === 0}>
                <RotateCcw className="h-4 w-4" /> Resetar envios
              </Button>
              <Button variant="outline" onClick={clearLogs} disabled={logs.length === 0}>
                <RotateCcw className="h-4 w-4" /> Limpar log
              </Button>
              {/* "Limpar tudo" removido — histórico de enviados é permanente aqui.
                  Para apagar registros pontuais, use a aba E-mails Enviados (por período). */}

              <Button
                variant="outline"
                onClick={() => setShowFloating(!showFloating)}
                className={showFloating ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800' : ''}
              >
                <Activity className="h-4 w-4" /> {showFloating ? 'Ocultar painel' : 'Painel flutuante'}
              </Button>
              {testMode && <Badge className="bg-amber-100 text-amber-800">MODO TESTE ATIVO</Badge>}
            </div>
            <div>
              <Label className="text-xs">Log</Label>
              <div className="mt-1 h-40 overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-100">
                {logs.length === 0 ? (
                  <div className="text-slate-500">Sem eventos ainda.</div>
                ) : (
                  logs.map((l, i) => <div key={i}>{l}</div>)
                )}
              </div>
            </div>

            {/* Fila logo abaixo do log, sem espaço em branco */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> Fila ({queue.length})
                </Label>
              </div>
              <div className="max-h-[360px] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-left text-xs text-slate-500">
                      <th className="py-2 pl-2">#</th>
                      <th>E-mail</th>
                      <th>Empresa</th>
                      <th>Status</th>
                      <th className="text-right pr-2">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.length === 0 ? (
                      <tr><td colSpan={5} className="p-3 text-center text-xs text-slate-500">Sem destinatários na fila.</td></tr>
                    ) : queue.map((q, i) => (
                      <tr key={q.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 pl-2 text-slate-500">{i + 1}</td>
                        <td className="truncate">{q.email}</td>
                        <td className="max-w-[180px] truncate">{q.company_name}</td>
                        <td><StatusBadge status={q.status} message={q.message} /></td>
                        <td className="text-right pr-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={running || q.status === 'sending'}
                            onClick={() => sendSingle(q)}
                            title="Enviar apenas este"
                          >
                            <Zap className="h-3.5 w-3.5" /> Enviar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Prévia em linha própria, largura total */}
      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Prévia
            </CardTitle>
            {queue.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <Button size="sm" variant="outline" onClick={() => setPreviewIdx(Math.max(0, previewIdx - 1))}>◀</Button>
                <span>{previewIdx + 1} / {queue.length}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewIdx(Math.min(queue.length - 1, previewIdx + 1))}
                >
                  ▶
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {previewItem ? (
              <>
                <div className="mb-2 text-xs text-slate-600">
                  Para: <strong>{previewItem.email}</strong> · CNPJ {formatCnpj(previewItem.cnpj)}
                </div>
                <div className="mb-2 text-xs text-slate-600">
                  Assunto: <strong>{substitute(effectiveSubject, buildVarsForPreview(previewItem))}</strong>
                </div>
                <iframe title="preview" srcDoc={previewHtml} className="h-[600px] w-full rounded-md border" />
              </>
            ) : (
              <p className="text-sm text-slate-500">Sem destinatários.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Painel flutuante montado globalmente em _authenticated.painel.tsx */}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <div className={`text-2xl font-bold ${color ?? 'text-slate-900'}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status, message }: { status: QueueItem['status']; message?: string }) {
  const map: Record<QueueItem['status'], { label: string; cls: string }> = {
    pending: { label: 'Pendente', cls: 'bg-slate-100 text-slate-700' },
    sending: { label: 'Enviando…', cls: 'bg-blue-100 text-blue-700' },
    sent: { label: 'Enviado', cls: 'bg-emerald-100 text-emerald-700' },
    suppressed: { label: 'Suprimido', cls: 'bg-amber-100 text-amber-800' },
    error: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
    skipped: { label: 'Ignorado', cls: 'bg-slate-100 text-slate-500' },
  };
  const m = map[status];
  return (
    <span title={message} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function LimitBlock({
  title,
  bucket,
  accent,
}: {
  title: string;
  bucket: EmailStatsResult['lastHour'];
  accent: 'blue' | 'emerald';
}) {
  const cls =
    accent === 'blue'
      ? 'border-blue-200 bg-blue-50/50'
      : 'border-emerald-200 bg-emerald-50/50';
  return (
    <div className={`rounded-lg border ${cls} p-3`}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <SubStat label="Enviados" value={bucket.sent} color="text-emerald-700" />
        <SubStat label="Rejeitados" value={bucket.rejected} color="text-red-600" />
        <SubStat label="Bounces" value={bucket.bounced} color="text-red-600" />
        <SubStat label="Reclamações" value={bucket.complaint} color="text-amber-600" />
        <SubStat label="Descadastros" value={bucket.unsubscribed} color="text-amber-600" />
        <SubStat label="Rate-limit" value={bucket.rateLimited} color="text-orange-700" />
      </div>
      <div className="mt-2 border-t pt-2 text-[11px] text-slate-500">
        Total de eventos: <strong>{bucket.total}</strong>
      </div>
    </div>
  );
}

function SubStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}


function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent: 'emerald' | 'blue' | 'amber' | 'red' | 'slate';
}) {
  const map = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-white text-slate-800',
  } as const;
  return (
    <div className={`rounded-lg border p-4 ${map[accent]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-3xl font-bold leading-none">{value}</div>
      {sub && <div className="mt-2 text-[11px] opacity-80">{sub}</div>}
    </div>
  );
}
