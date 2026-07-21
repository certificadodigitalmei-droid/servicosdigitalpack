import { createFileRoute } from '@tanstack/react-router';
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
import { FloatingStatsPanel } from '@/components/painel/FloatingStatsPanel';
import { getEmailStats, type EmailStatsResult } from '@/lib/email-campaign/stats.functions';
import { useStore } from '@/lib/automation/store';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  envioStore,
  loadRecipients,
  resetStatuses,
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
  setDailyLimit,
  resetDailyCounter,
  setTestMode,
  setTestRecipient,
  setFromName,
  setFromAddress,
  setReplyTo,
  setShowFloating,
  setHeroImageUrl,
  type QueueItem,
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
  const heroImageUrl = useStore(envioStore, (s) => s.heroImageUrl);
  const dailyLimit = useStore(envioStore, (s) => s.dailyLimit);
  const sentToday = useStore(envioStore, (s) => s.sentToday);
  const importDelaySec = useStore(consultaStore, (s) => s.autoImportDelaySec);
  const sentEmails = useStore(envioStore, (s) => s.sentEmails);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [emailStats, setEmailStats] = useState<EmailStatsResult | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const refreshStats = async () => {
    setLoadingStats(true);
    try {
      const res = await getEmailStats();
      setEmailStats(res as EmailStatsResult);
    } catch (e: any) {
      toast.error('Falha ao consultar limites: ' + e.message);
    } finally {
      setLoadingStats(false);
    }
  };

  const [previewIdx, setPreviewIdx] = useState(0);

  // Carrega destinatários uma vez se a fila estiver vazia.
  useEffect(() => {
    if (queue.length === 0) void loadRecipients();
    void refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const previewHtml = useMemo(() => {
    if (!previewItem) return '';
    const vars = buildVarsForPreview(previewItem);
    return renderHtml({ ...DEFAULT_DESIGN, heroImageUrl: heroImageUrl || undefined }, vars);
  }, [previewItem, fromName, fromAddress, heroImageUrl]);


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

      {/* Limites do Lovable Emails + Enviados confirmados */}
      <Card className="border-blue-100 bg-gradient-to-br from-blue-50/60 to-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-600" />
              Limites do Lovable Emails
            </CardTitle>
            <p className="mt-1 text-xs text-slate-600">
              Os limites reais são enforçados pelo Lovable no servidor. Estes números vêm do log oficial de entregas.
              Ao atingir o limite, os envios recebem <code className="rounded bg-slate-100 px-1">HTTP 429</code> e a fila
              aguarda automaticamente antes de continuar.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={refreshStats} disabled={loadingStats}>
            {loadingStats ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
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
              <LimitBlock title="Última hora (janela de rate limit)" bucket={emailStats.lastHour} accent="blue" />
              <LimitBlock title="Últimas 24 horas" bucket={emailStats.last24h} accent="emerald" />
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <MiniStat label="Enviados confirmados (histórico local)" value={sentEmails.length} color="text-emerald-700" />
            <MiniStat label="Enviados hoje (contador)" value={sentToday} color="text-slate-900" />
            <MiniStat label="Limite diário configurado" value={dailyLimit === 0 ? '∞' : dailyLimit} color="text-blue-700" />
            <MiniStat label="Fila atual" value={queue.length} color="text-slate-700" />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Após cada envio confirmado, o destinatário sai da fila e vai para a aba{' '}
            <strong>E-mails Enviados</strong> automaticamente.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Configuração</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Assunto</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Nome do remetente</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </div>
            <div>
              <Label>E-mail remetente</Label>
              <Input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
            </div>
            <div>
              <Label>Responder para (opcional)</Label>
              <Input
                placeholder="atendimento@seu-dominio.online"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
              />
            </div>
            {/* Presets de envio recomendado */}
            <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 space-y-3">
              <div>
                <div className="text-sm font-semibold text-blue-900">Perfis recomendados de envio</div>
                <p className="text-[11px] text-blue-900/70">
                  Clique para aplicar delay, limite diário e limite da fila de uma vez. Baseado em boas práticas anti-spam.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  { key: 'warmup1', title: 'Warm-up inicial', sub: 'Dias 1-3', daily: 40, delay: 90, batch: 40, hint: '~40/dia · 1 a cada 90s' },
                  { key: 'warmup2', title: 'Warm-up médio', sub: 'Dias 4-7', daily: 150, delay: 60, batch: 150, hint: '~150/dia · 1 a cada 60s' },
                  { key: 'warmup3', title: 'Warm-up avançado', sub: 'Dias 8-14', daily: 400, delay: 45, batch: 200, hint: '~400/dia · 1 a cada 45s' },
                  { key: 'cruise', title: 'Ritmo saudável', sub: 'Após 15 dias', daily: 800, delay: 30, batch: 300, hint: '~800/dia · 1 a cada 30s' },
                ] as const).map((p) => {
                  const active = delaySec === p.delay && dailyLimit === p.daily && batchLimit === p.batch;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setDelaySec(p.delay);
                        setDailyLimit(p.daily);
                        setBatchLimit(p.batch);
                        toast.success(`Perfil "${p.title}" aplicado`);
                      }}
                      className={`text-left rounded-md border p-2.5 transition-colors ${
                        active
                          ? 'border-blue-500 bg-white ring-2 ring-blue-400'
                          : 'border-blue-200 bg-white hover:border-blue-400'
                      }`}
                    >
                      <div className="text-[12.5px] font-bold text-slate-900">{p.title}</div>
                      <div className="text-[10.5px] uppercase tracking-wider text-slate-500">{p.sub}</div>
                      <div className="mt-1 text-[11px] text-slate-700">{p.hint}</div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded border border-blue-200 bg-white p-2 text-[11px] text-slate-700 leading-relaxed">
                <strong className="text-blue-900">Regra de ouro:</strong> não passe de <strong>~100 envios/hora</strong> e faça pausas
                (ex.: envie por 2-3h, descanse 1h). Envios ideais entre <strong>09h-11h</strong> e <strong>14h-17h</strong>, dias úteis.
                Se bounces &gt; 5% ou reclamações &gt; 0,1%, reduza volume imediatamente.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">

              <div>
                <Label>Delay entre envios (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={delaySec}
                  onChange={(e) => setDelaySec(parseInt(e.target.value || '1', 10))}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Delay da importação automática: <strong>{importDelaySec}s</strong>.{' '}
                  <button
                    type="button"
                    className="text-blue-600 underline"
                    onClick={() => setDelaySec(importDelaySec)}
                  >
                    Igualar
                  </button>
                </p>
              </div>
              <div>
                <Label>Limite da fila</Label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={batchLimit}
                  onChange={(e) => setBatchLimit(parseInt(e.target.value || '1', 10))}
                />
              </div>
            </div>

            {/* Limite diário */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Limite de envios por dia</Label>
                <Badge className={sentToday >= dailyLimit && dailyLimit > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}>
                  {sentToday} / {dailyLimit > 0 ? dailyLimit : '∞'} hoje
                </Badge>
              </div>
              <Input
                type="number"
                min={0}
                max={10000}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseInt(e.target.value || '0', 10))}
              />
              <p className="text-[11px] text-slate-500">
                Ex.: 50 ou 100. Use <strong>0</strong> para desativar o limite. O contador reseta automaticamente à meia-noite.
              </p>
              <Button size="sm" variant="outline" onClick={resetDailyCounter}>
                <RotateCcw className="h-3.5 w-3.5" /> Zerar contador de hoje
              </Button>
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

            {/* Imagem de topo do e-mail */}
            <div className="space-y-2 rounded-md border p-3">
              <Label>Imagem no topo do e-mail (opcional)</Label>
              <p className="text-xs text-slate-500">
                Aparece como banner grande logo abaixo do cabeçalho. Recomendado: 1200×400px.
              </p>
              <Input
                placeholder="Cole uma URL de imagem (https://...)"
                value={heroImageUrl}
                onChange={(e) => setHeroImageUrl(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadingImg}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) {
                      toast.error('Imagem muito grande (máx. 5MB).');
                      return;
                    }
                    setUploadingImg(true);
                    try {
                      const ext = f.name.split('.').pop() || 'png';
                      const path = `email-hero/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                      const { error: upErr } = await supabase.storage
                        .from('site-assets')
                        .upload(path, f, { contentType: f.type, upsert: false });
                      if (upErr) throw upErr;
                      const { data: signed, error: sErr } = await supabase.storage
                        .from('site-assets')
                        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 anos
                      if (sErr) throw sErr;
                      setHeroImageUrl(signed.signedUrl);
                      toast.success('Imagem carregada.');
                    } catch (err: any) {
                      toast.error('Falha no upload: ' + err.message);
                    } finally {
                      setUploadingImg(false);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                {uploadingImg && <Loader2 className="h-4 w-4 animate-spin" />}
                {heroImageUrl && (
                  <Button size="sm" variant="ghost" onClick={() => setHeroImageUrl('')}>
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                )}
              </div>
              {heroImageUrl && (
                <img
                  src={heroImageUrl}
                  alt="preview banner"
                  className="mt-2 max-h-32 w-full rounded border object-cover"
                />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={loadRecipients} disabled={loading || running}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recarregar fila
              </Button>
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
                <Button onClick={startSending} disabled={queue.length === 0}>
                  <Play className="h-4 w-4" /> {testMode ? 'Iniciar teste' : 'Iniciar envio real'}
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={togglePause}>
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {paused ? 'Retomar' : 'Pausar'}
                  </Button>
                  <Button variant="destructive" onClick={stopSending}>
                    <Square className="h-4 w-4" /> Parar
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={resetStatuses} disabled={running || queue.length === 0}>
                <RotateCcw className="h-4 w-4" /> Resetar envios
              </Button>
              <Button variant="outline" onClick={clearLogs} disabled={logs.length === 0}>
                <RotateCcw className="h-4 w-4" /> Limpar log
              </Button>
              <Button variant={showFloating ? 'default' : 'outline'} onClick={() => setShowFloating(!showFloating)}>
                <Activity className="h-4 w-4" /> {showFloating ? 'Ocultar painel' : 'Painel flutuante'}
              </Button>
              {testMode && <Badge className="bg-amber-100 text-amber-800">MODO TESTE ATIVO</Badge>}
            </div>
            <div>
              <Label className="text-xs">Log</Label>
              <div className="mt-1 h-48 overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-100">
                {logs.length === 0 ? (
                  <div className="text-slate-500">Sem eventos ainda.</div>
                ) : (
                  logs.map((l, i) => <div key={i}>{l}</div>)
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview + Queue */}
      <div className="grid gap-6 lg:grid-cols-2">
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
                  Assunto: <strong>{substitute(subject, buildVarsForPreview(previewItem))}</strong>
                </div>
                <iframe title="preview" srcDoc={previewHtml} className="h-[600px] w-full rounded-md border" />
              </>
            ) : (
              <p className="text-sm text-slate-500">Sem destinatários.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Fila
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-2">#</th>
                    <th>E-mail</th>
                    <th>Empresa</th>
                    <th>Status</th>
                    <th className="text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q, i) => (
                    <tr key={q.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 text-slate-500">{i + 1}</td>
                      <td className="truncate">{q.email}</td>
                      <td className="max-w-[180px] truncate">{q.company_name}</td>
                      <td><StatusBadge status={q.status} message={q.message} /></td>
                      <td className="text-right">
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
