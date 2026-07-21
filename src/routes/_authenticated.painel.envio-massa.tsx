import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { sendCampaignEmail } from '@/lib/email-campaign/send.functions';
import {
  DEFAULT_DESIGN,
  DEFAULT_SUBJECT,
  renderHtml,
  rowToVars,
  substitute,
  formatCnpj,
} from '@/lib/email-campaign/template';
import { Loader2, Play, Pause, Square, RefreshCw, Send, TestTube2, Eye } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/painel/envio-massa')({
  component: EnvioMassa,
});

type QueueItem = {
  id: string;
  email: string;
  cnpj: string;
  company_name: string;
  status: 'pending' | 'sending' | 'sent' | 'suppressed' | 'error' | 'skipped';
  message?: string;
  publicToken?: string | null;
};

const STORAGE_KEY = 'envio-massa-config-v1';

function loadCfg() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function EnvioMassa() {
  const sendFn = useServerFn(sendCampaignEmail);
  const initial = loadCfg();

  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [subject, setSubject] = useState<string>(initial.subject ?? DEFAULT_SUBJECT);
  const [delaySec, setDelaySec] = useState<number>(initial.delaySec ?? 8);
  const [batchLimit, setBatchLimit] = useState<number>(initial.batchLimit ?? 200);
  const [testMode, setTestMode] = useState<boolean>(initial.testMode ?? true);
  const [testRecipient, setTestRecipient] = useState<string>(initial.testRecipient ?? '');
  const [fromName, setFromName] = useState<string>(initial.fromName ?? 'Certificado Digital MEI');
  const [fromAddress, setFromAddress] = useState<string>(
    initial.fromAddress ?? 'certificado.mei.estadual@seu-certificado-mei-digital.online'
  );
  const [replyTo, setReplyTo] = useState<string>(initial.replyTo ?? '');

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const stopRef = useRef(false);

  const [logs, setLogs] = useState<string[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ subject, delaySec, batchLimit, testMode, testRecipient, fromName, fromAddress, replyTo })
    );
  }, [subject, delaySec, batchLimit, testMode, testRecipient, fromName, fromAddress, replyTo]);

  const stats = useMemo(() => {
    const total = queue.length;
    const sent = queue.filter((q) => q.status === 'sent').length;
    const errors = queue.filter((q) => q.status === 'error').length;
    const suppressed = queue.filter((q) => q.status === 'suppressed').length;
    const pending = queue.filter((q) => q.status === 'pending').length;
    return { total, sent, errors, suppressed, pending };
  }, [queue]);

  const pushLog = (msg: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLogs((prev) => [line, ...prev].slice(0, 500));
  };

  async function loadRecipients() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, cnpj, razao_social_original, nome_titular_exibicao, nome_fantasia, email, inicio_atividade, situacao_cadastral_desc, uf, municipio_descricao')
        .not('email', 'is', null)
        .neq('email', '')
        .order('created_at', { ascending: false })
        .limit(batchLimit);
      if (error) throw error;

      const companyIds = (data ?? []).map((c: any) => c.id).filter(Boolean);
      const linksMap: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: links } = await supabase
          .from('company_links')
          .select('company_id, public_token')
          .in('company_id', companyIds);
        for (const l of (links ?? []) as Array<{ company_id: string | null; public_token: string }>) {
          if (l.company_id && l.public_token && !linksMap[l.company_id]) {
            linksMap[l.company_id] = l.public_token;
          }
        }
      }

      const items: QueueItem[] = (data ?? [])
        .filter((c: any) => /.+@.+\..+/.test(c.email))
        .map((c: any) => ({
          id: c.id,
          email: c.email,
          cnpj: c.cnpj,
          company_name: c.nome_fantasia || c.razao_social || '',
          status: 'pending',
          publicToken: linksMap[c.id] || null,
        }));
      setQueue(items);
      pushLog(`Carregados ${items.length} destinatários (limite ${batchLimit}).`);
    } catch (e: any) {
      toast.error('Erro ao carregar destinatários: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecipients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildVarsFor(item: QueueItem, extra?: Record<string, any>) {
    const row: Record<string, any> = {
      NOME_EMPRESARIAL: item.company_name,
      NOME_TITULAR: item.company_name,
      CNPJ: item.cnpj,
      DATA_ABERTURA: extra?.data_abertura || '',
      SITUACAO: extra?.situacao_cadastral || 'CNPJ sem certificado ativo',
      MUNICIPIO: extra?.municipio || '',
      UF: extra?.uf || '',
      EMAIL: item.email,
      LINK_PUBLICO: item.publicToken
        ? `${window.location.origin}/c/${item.publicToken}`
        : `${window.location.origin}/modelo`,
      TOKEN: item.publicToken || '',
    };
    return rowToVars(row, {
      name: fromName,
      company: fromName,
      reference: `MEI-${new Date().getFullYear()}`,
    });
  }

  async function sendOne(item: QueueItem) {
    setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'sending', message: undefined } : q)));
    const vars = buildVarsFor(item);
    const subj = substitute(subject, vars);
    try {
      const res = await sendFn({
        data: {
          recipient: item.email,
          subject: subj,
          vars,
          fromName,
          fromAddress,
          replyTo: replyTo || undefined,
          testMode,
          testRecipient: testMode ? testRecipient || null : null,
          idempotencyKey: `campaign-${item.id}-${new Date().toISOString().slice(0, 10)}`,
        },
      });
      if (res.sent) {
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'sent' } : q)));
        pushLog(`✓ Enviado para ${res.recipient}`);
        return { ok: true };
      }
      if (res.reason === 'recipient_suppressed') {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'suppressed', message: res.message } : q))
        );
        pushLog(`⊘ Suprimido ${item.email}: ${res.message ?? ''}`);
        return { ok: true };
      }
      if (res.reason === 'rate_limited') {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'pending', message: res.message } : q))
        );
        pushLog(`⏸ Rate-limited: aguardando ${res.retryAfterSeconds ?? 60}s`);
        return { ok: false, waitSec: res.retryAfterSeconds ?? 60 };
      }
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'error', message: res.message } : q)));
      pushLog(`✗ Erro ${item.email}: ${res.message}`);
      return { ok: true };
    } catch (e: any) {
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'error', message: e.message } : q)));
      pushLog(`✗ Falha ${item.email}: ${e.message}`);
      return { ok: true };
    }
  }

  async function startSending() {
    if (runningRef.current) return;
    if (testMode && !testRecipient) {
      toast.error('Modo teste ativo: informe um e-mail de teste.');
      return;
    }
    if (queue.length === 0) {
      toast.error('Nenhum destinatário na fila.');
      return;
    }
    runningRef.current = true;
    stopRef.current = false;
    pausedRef.current = false;
    setRunning(true);
    setPaused(false);
    pushLog(`▶ Iniciando envio${testMode ? ' (MODO TESTE)' : ''}. Delay: ${delaySec}s`);

    const list = queue.filter((q) => q.status === 'pending' || q.status === 'error');
    for (const item of list) {
      if (stopRef.current) break;
      while (pausedRef.current && !stopRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (stopRef.current) break;

      const res = await sendOne(item);
      if (!res.ok && res.waitSec) {
        const waitMs = Math.min(res.waitSec, 300) * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        // retry this item
        if (!stopRef.current) await sendOne(item);
      }
      // delay before next
      if (!stopRef.current) {
        await new Promise((r) => setTimeout(r, Math.max(1, delaySec) * 1000));
      }
    }

    runningRef.current = false;
    setRunning(false);
    setPaused(false);
    pushLog('■ Envio finalizado.');
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    pushLog(pausedRef.current ? '⏸ Pausado.' : '▶ Retomando...');
  }

  function stopSending() {
    stopRef.current = true;
    pausedRef.current = false;
    pushLog('■ Parada solicitada.');
  }

  const previewItem = queue[previewIdx];
  const previewHtml = useMemo(() => {
    if (!previewItem) return '';
    const vars = buildVarsFor(previewItem);
    return renderHtml(DEFAULT_DESIGN, vars);
  }, [previewItem, fromName, fromAddress]);

  const progress = stats.total > 0 ? Math.round(((stats.sent + stats.errors + stats.suppressed) / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Envio em Massa</h1>
        <p className="text-sm text-slate-500">
          Dispara e-mails via Lovable Emails (domínio profissional) com controle de delay, pausa e modo teste.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Configuração</CardTitle>
          </CardHeader>
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
                  onChange={(e) => setDelaySec(Math.max(1, parseInt(e.target.value || '1', 10)))}
                />
              </div>
              <div>
                <Label>Limite da fila</Label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={batchLimit}
                  onChange={(e) => setBatchLimit(Math.max(1, parseInt(e.target.value || '1', 10)))}
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
          <CardHeader>
            <CardTitle>Progresso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <Stat label="Total" value={stats.total} />
              <Stat label="Pendentes" value={stats.pending} color="text-slate-700" />
              <Stat label="Enviados" value={stats.sent} color="text-emerald-600" />
              <Stat label="Suprimidos" value={stats.suppressed} color="text-amber-600" />
              <Stat label="Erros" value={stats.errors} color="text-red-600" />
            </div>
            <Progress value={progress} />
            <div className="flex gap-2">
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
                <Button size="sm" variant="outline" onClick={() => setPreviewIdx(Math.max(0, previewIdx - 1))}>
                  ◀
                </Button>
                <span>
                  {previewIdx + 1} / {queue.length}
                </span>
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
                  Assunto: <strong>{substitute(subject, buildVarsFor(previewItem))}</strong>
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
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q, i) => (
                    <tr key={q.id} className="border-b last:border-0">
                      <td className="py-2 text-slate-500">{i + 1}</td>
                      <td className="truncate">{q.email}</td>
                      <td className="max-w-[180px] truncate">{q.company_name}</td>
                      <td>
                        <StatusBadge status={q.status} message={q.message} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
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
