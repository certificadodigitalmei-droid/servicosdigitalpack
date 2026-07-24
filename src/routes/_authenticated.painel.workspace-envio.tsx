import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Play,
  Pause,
  Square,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  Mail,
  RotateCcw,
} from 'lucide-react';
import { useStore } from '@/lib/automation/store';
import {
  wsBurstStore,
  startBurstEngine,
  pauseBurstEngine,
  stopBurstEngine,
  setDelayRange,
  setTestMode,
  setTestRecipient,
  resetDailyCounter,
  clearLogs,
  sendBurstTestEmail,
  DAILY_HARD_CAP,
  BURST_SIZE,
} from '@/lib/automation/workspace-burst-engine';

export const Route = createFileRoute('/_authenticated/painel/workspace-envio')({
  component: WorkspaceEnvioPage,
  head: () => ({
    meta: [
      { title: 'Envio Google Workspace | Central MEI' },
      { name: 'description', content: 'Envio em rajadas via Gmail API do Google Workspace.' },
    ],
  }),
});

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function Countdown({ untilIso }: { untilIso: string | null }) {
  const [, setTick] = useState(0);
  useMemo(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!untilIso) return <span>—</span>;
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return <span>iniciando…</span>;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return <span>{min}m {sec.toString().padStart(2, '0')}s</span>;
}

function WorkspaceEnvioPage() {
  const state = useStore(wsBurstStore, (s) => s);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  const capReached = state.sentToday >= DAILY_HARD_CAP;
  const remaining = Math.max(0, DAILY_HARD_CAP - state.sentToday);

  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast.error('Informe um e-mail para o teste.');
      return;
    }
    setTesting(true);
    const r = await sendBurstTestEmail(testEmail.trim());
    setTesting(false);
    if (r.ok) toast.success('E-mail de teste enviado.');
    else toast.error(r.message);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Envio Google Workspace</h1>
        <p className="text-sm text-slate-500">
          Envia em <strong>rajadas de {BURST_SIZE}</strong> pela Gmail API do Google Workspace, com descanso configurável entre cada
          rajada. Limite oficial diário: <strong>{DAILY_HARD_CAP.toLocaleString('pt-BR')} e-mails</strong>.
        </p>
      </div>

      {/* ---------- Status / Métricas ---------- */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enviados hoje</CardDescription>
            <CardTitle className="text-3xl">{state.sentToday.toLocaleString('pt-BR')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500">
            Restam <strong>{remaining.toLocaleString('pt-BR')}</strong> de {DAILY_HARD_CAP.toLocaleString('pt-BR')} hoje.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rajadas concluídas</CardDescription>
            <CardTitle className="text-3xl">{state.cycles}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500">
            Último lote: {state.lastBatchSent} ok / {state.lastBatchFailed} falha(s)
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Última rajada</CardDescription>
            <CardTitle className="text-lg">{fmtDateTime(state.lastBatchAt)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500">
            {state.restingUntil ? (
              <>Próxima em <strong><Countdown untilIso={state.restingUntil} /></strong></>
            ) : (
              'Sem descanso agendado.'
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-lg flex items-center gap-2">
              {state.running ? (
                state.paused ? (
                  <Badge variant="secondary" className="gap-1"><Pause className="h-3 w-3" /> Pausado</Badge>
                ) : (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><Play className="h-3 w-3" /> Rodando</Badge>
                )
              ) : (
                <Badge variant="outline" className="gap-1"><Square className="h-3 w-3" /> Parado</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-slate-500">
            Rajada = {BURST_SIZE} e-mails paralelos, depois descanso.
          </CardContent>
        </Card>
      </div>

      {capReached && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          Teto diário de {DAILY_HARD_CAP.toLocaleString('pt-BR')} envios atingido. O contador zera automaticamente à meia-noite (America/Sao_Paulo).
          <Button variant="link" size="sm" className="ml-auto text-amber-900" onClick={resetDailyCounter}>
            <RotateCcw className="h-3 w-3 mr-1" /> Zerar manualmente
          </Button>
        </div>
      )}

      {/* ---------- Config ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração das rajadas</CardTitle>
          <CardDescription>
            Descanso aleatório entre lotes (entre <strong>1 e 5 min</strong>) para variar o padrão de envio.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Descanso mínimo (min)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={state.delayMinMin}
              onChange={(e) => setDelayRange(Number(e.target.value) || 1, state.delayMinMax)}
            />
          </div>
          <div className="space-y-2">
            <Label>Descanso máximo (min)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={state.delayMinMax}
              onChange={(e) => setDelayRange(state.delayMinMin, Number(e.target.value) || 5)}
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Modo de teste</div>
              <div className="text-xs text-slate-500">Se ativo, todos os envios da rajada são redirecionados para o e-mail abaixo. Nada é gravado no histórico.</div>
            </div>
            <Switch checked={state.testMode} onCheckedChange={setTestMode} />
          </div>
          {state.testMode && (
            <div className="md:col-span-2 space-y-2">
              <Label>E-mail para receber os testes</Label>
              <Input
                type="email"
                placeholder="voce@dominio.com"
                value={state.testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Controles ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Controles</CardTitle>
          <CardDescription>Inicia, pausa ou encerra o loop de rajadas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={startBurstEngine} disabled={state.running || capReached} className="gap-2">
            <Play className="h-4 w-4" /> Iniciar
          </Button>
          <Button onClick={pauseBurstEngine} disabled={!state.running} variant="secondary" className="gap-2">
            <Pause className="h-4 w-4" /> {state.paused ? 'Retomar' : 'Pausar'}
          </Button>
          <Button onClick={stopBurstEngine} disabled={!state.running} variant="destructive" className="gap-2">
            <Square className="h-4 w-4" /> Parar
          </Button>
          <Separator orientation="vertical" className="mx-2 hidden md:block h-8" />
          <Button variant="outline" onClick={resetDailyCounter} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Zerar contador diário
          </Button>
        </CardContent>
      </Card>

      {/* ---------- Módulo de teste ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Teste rápido de envio</CardTitle>
          <CardDescription>
            Envia agora <strong>um único e-mail</strong> usando o Modelo de Mensagem atual (Configurações → Modelo de Mensagem). Não conta no teto diário.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label>E-mail de destino</Label>
            <Input
              type="email"
              placeholder="teste@dominio.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <Button onClick={handleTest} disabled={testing} className="gap-2">
            {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar teste
          </Button>
        </CardContent>
      </Card>

      {/* ---------- Último lote ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" /> Último lote</CardTitle>
          <CardDescription>
            {state.lastBatch.length} destinatário(s) na última rajada
            {state.lastBatchAt ? ` — ${fmtDateTime(state.lastBatchAt)}` : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.lastBatch.length === 0 ? (
            <div className="text-sm text-slate-500">Nenhuma rajada executada ainda.</div>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">E-mail</th>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {state.lastBatch.map((r) => (
                    <tr key={`${r.id}-${r.email}`} className="border-t">
                      <td className="p-2">
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> OK</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-4 w-4" /> Falha</span>
                        )}
                      </td>
                      <td className="p-2 font-mono text-xs">{r.email}</td>
                      <td className="p-2 text-xs">{r.company_name}</td>
                      <td className="p-2 text-xs text-slate-600">{r.message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Logs ---------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Últimas ações da engine.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={clearLogs}>Limpar logs</Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-100">
            {state.logs.length === 0 ? (
              <div className="text-slate-400">Sem logs ainda.</div>
            ) : (
              state.logs.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap">{l}</div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
