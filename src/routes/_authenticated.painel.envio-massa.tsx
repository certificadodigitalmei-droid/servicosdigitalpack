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
import { useStore } from '@/lib/automation/store';
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
  buildVarsForPreview,
  setSubject,
  setDelaySec,
  setBatchLimit,
  setTestMode,
  setTestRecipient,
  setFromName,
  setFromAddress,
  setReplyTo,
  setShowFloating,
  type QueueItem,
} from '@/lib/automation/envio-engine';

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

  const [previewIdx, setPreviewIdx] = useState(0);

  // Carrega destinatários uma vez se a fila estiver vazia.
  useEffect(() => {
    if (queue.length === 0) void loadRecipients();
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
    return renderHtml(DEFAULT_DESIGN, vars);
  }, [previewItem, fromName, fromAddress]);

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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Delay (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={delaySec}
                  onChange={(e) => setDelaySec(parseInt(e.target.value || '1', 10))}
                />
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
              <div>
                <Label>E-mail de teste</Label>
                <Input
                  placeholder="seu-email@dominio.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                />
              </div>
            )}
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

      {showFloating && (
        <FloatingStatsPanel
          stats={stats}
          running={running}
          paused={paused}
          lastEvent={logs[0]}
          onClose={() => setShowFloating(false)}
        />
      )}
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
