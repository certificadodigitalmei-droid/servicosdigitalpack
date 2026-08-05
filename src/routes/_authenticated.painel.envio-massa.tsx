import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  TestTube2,
  Eye,
  RotateCcw,
  Trash2,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getEmailMetrics } from '@/lib/emails/email-metrics.functions';
import {
  FilaUnicaCard,
  SendHealthCard,
  SendWindowCard,
  SendProfileCard,
} from '@/components/painel/FilaUnica';

import { useStore } from '@/lib/automation/store';

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
  sendTestOnce,
  buildVarsForPreview,
  setTestMode,
  setTestRecipient,
  setShowFloating,
  mergedDesign,
  loadSavedSubject,
  syncFromMessageModel,
  syncSenderFromServer,
  ensureDailyWindow,
} from '@/lib/automation/envio-engine';

export const Route = createFileRoute('/_authenticated/painel/envio-massa')({
  component: EnvioMassa,
});

function EnvioMassa() {
  const queue = useStore(envioStore, (s) => s.queue);
  const subject = useStore(envioStore, (s) => s.subject);
  const running = useStore(envioStore, (s) => s.running);
  const paused = useStore(envioStore, (s) => s.paused);
  const loading = useStore(envioStore, (s) => s.loading);
  const logs = useStore(envioStore, (s) => s.logs);
  const showFloating = useStore(envioStore, (s) => s.showFloating);
  const sentEmails = useStore(envioStore, (s) => s.sentEmails);
  const testMode = useStore(envioStore, (s) => s.testMode);
  const testRecipient = useStore(envioStore, (s) => s.testRecipient);
  const fromName = useStore(envioStore, (s) => s.fromName);
  const fromAddress = useStore(envioStore, (s) => s.fromAddress);

  const [previewIdx, setPreviewIdx] = useState(0);
  const [designTick, setDesignTick] = useState(0);

  // Métricas oficiais do servidor (valem mesmo com o painel fechado).
  const fetchEmailMetrics = useServerFn(getEmailMetrics);
  const metricsQ = useQuery({
    queryKey: ['email_send_queue', 'metrics', 'envio-massa'],
    queryFn: () => fetchEmailMetrics({ data: {} }),
    refetchInterval: 15_000,
  });
  const sm = metricsQ.data;

  // Auto-carregar fila (persistido)
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

  useEffect(() => {
    ensureDailyWindow();
    const id = setInterval(ensureDailyWindow, 30_000);
    syncFromMessageModel();
    void syncSenderFromServer();
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoLoadQueue) return;
    const tick = () => {
      if (loading || running) return;
      const pending = envioStore.get().queue.filter((q) => q.status === 'pending').length;
      if (pending > 0) return;
      void loadRecipients({ limit: 1 });
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [autoLoadQueue, loading, running]);

  useEffect(() => {
    const bump = () => {
      syncFromMessageModel();
      setDesignTick((t) => t + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('campanha:')) bump();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', bump);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', bump);
    };
  }, []);

  const previewItem = queue[previewIdx];
  const effectiveSubject = loadSavedSubject() || subject;
  const previewHtml = useMemo(() => {
    if (!previewItem) return '';
    const vars = buildVarsForPreview(previewItem);
    const design = { ...DEFAULT_DESIGN, ...mergedDesign() };
    return renderHtml(design, vars);
  }, [previewItem, fromName, fromAddress, subject, designTick]);

  const estado = !running ? 'parado' : paused ? 'pausado' : 'enviando';

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      {/* 1 — Estado + botão único */}
      <Card className="border-slate-200">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                estado === 'enviando'
                  ? 'animate-pulse bg-emerald-500'
                  : estado === 'pausado'
                    ? 'bg-amber-500'
                    : 'bg-slate-300'
              }`}
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">Envio em Massa</h1>
              <p className="text-sm text-slate-500">
                {estado === 'enviando'
                  ? 'Enviando agora — continua mesmo se você fechar esta aba.'
                  : estado === 'pausado'
                    ? 'Envio pausado.'
                    : 'Parado. Clique em Iniciar para começar a enviar a fila.'}
              </p>
            </div>
            {testMode && <Badge className="bg-amber-100 text-amber-800">MODO TESTE</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={startSending}>
                <Play className="h-4 w-4" /> Iniciar envio
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={togglePause}>
                  {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {paused ? 'Retomar' : 'Pausar'}
                </Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={stopSending}>
                  <Square className="h-4 w-4" /> Parar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2 — Números essenciais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Num label="Enviados hoje" value={sm?.hoje ?? sentEmails.length} tone="emerald" />
        <Num label="Na última hora" value={sm?.ultimaHora ?? 0} tone="indigo" />
        <Num label="Aguardando na fila" value={sm?.fila ?? 0} tone="blue" />
        <Num label="Falhas / suprimidos" value={(sm?.falhas ?? 0) + (sm?.suprimidos ?? 0)} tone="red" />
      </div>

      {/* 3 — Janela de 1 hora */}
      <SendWindowCard />

      {/* 4 — Velocidade / lotes */}
      <SendProfileCard />

      {/* 5 — Fila única */}
      <FilaUnicaCard />

      {/* 6 — Detalhes (fechado por padrão) */}
      <Section title="Saúde do envio (erros, 429, bounces)">
        <SendHealthCard />
      </Section>

      <Section title="Fila local e limpeza">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void loadRecipients()} disabled={loading || running}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Carregar fila
          </Button>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <Switch checked={autoLoadQueue} onCheckedChange={setAutoLoadQueue} />
            <span className="text-xs text-slate-700">Carregar automaticamente</span>
          </div>
          <Button variant="outline" onClick={resetStatuses} disabled={running || queue.length === 0}>
            <RotateCcw className="h-4 w-4" /> Resetar envios
          </Button>
          <Button
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            onClick={() => {
              if (confirm('Esvaziar a fila local?')) clearQueue();
            }}
            disabled={running || queue.length === 0}
          >
            <Trash2 className="h-4 w-4" /> Limpar fila
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowFloating(!showFloating)}
            className={showFloating ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : ''}
          >
            <Activity className="h-4 w-4" /> {showFloating ? 'Ocultar painel flutuante' : 'Painel flutuante'}
          </Button>
        </div>
      </Section>

      <Section title="Enviar um teste">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TestTube2 className="h-4 w-4" /> Modo teste
              </div>
              <p className="text-xs text-slate-500">Redireciona todos os envios para 1 e-mail seu.</p>
            </div>
            <Switch checked={testMode} onCheckedChange={setTestMode} />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Label className="text-xs">E-mail de teste</Label>
              <Input
                placeholder="seu-email@dominio.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                if (!testRecipient) return toast.error('Informe um e-mail de teste');
                void sendTestOnce();
              }}
              disabled={running || !testRecipient}
            >
              <TestTube2 className="h-4 w-4" /> Enviar 1 teste
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Mensagem e prévia">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Assunto e remetente vêm do{' '}
            <Link to="/painel/modelos-email" className="font-medium text-blue-600 hover:underline">
              Modelo de Mensagem
            </Link>
            .
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Assunto</Label>
              <Input value={subject} readOnly className="bg-slate-50 text-slate-600" />
            </div>
            <div>
              <Label className="text-xs">Remetente</Label>
              <Input value={`${fromName} <${fromAddress}>`} readOnly className="bg-slate-50 text-slate-600" />
            </div>
          </div>

          {previewItem ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {previewItem.email} · CNPJ {formatCnpj(previewItem.cnpj)} ·{' '}
                  <strong>{substitute(effectiveSubject, buildVarsForPreview(previewItem))}</strong>
                </span>
                <span className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreviewIdx(Math.max(0, previewIdx - 1))}>
                    ◀
                  </Button>
                  {previewIdx + 1} / {queue.length}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewIdx(Math.min(queue.length - 1, previewIdx + 1))}
                  >
                    ▶
                  </Button>
                </span>
              </div>
              <iframe title="preview" srcDoc={previewHtml} className="h-[520px] w-full rounded-md border" />
            </>
          ) : (
            <p className="text-sm text-slate-500">Sem destinatários na fila para pré-visualizar.</p>
          )}
        </div>
      </Section>

      <Section title="Log de eventos">
        <div className="space-y-2">
          <div className="h-48 overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-100">
            {logs.length === 0 ? (
              <div className="text-slate-500">Sem eventos ainda.</div>
            ) : (
              logs.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
          <Button size="sm" variant="outline" onClick={clearLogs} disabled={logs.length === 0}>
            <RotateCcw className="h-3.5 w-3.5" /> Limpar log
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Num({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'emerald' | 'indigo' | 'blue' | 'red';
}) {
  const map = {
    emerald: 'text-emerald-700',
    indigo: 'text-indigo-700',
    blue: 'text-blue-700',
    red: 'text-red-700',
  } as const;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${map[tone]}`}>{value}</div>
    </div>
  );
}

/** Bloco recolhível — mantém a página limpa por padrão. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-slate-200">
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setOpen((v) => !v)}
      >
        <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-800">
          {title}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </CardTitle>
        {!open && <CardDescription className="text-xs">Clique para abrir</CardDescription>}
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
