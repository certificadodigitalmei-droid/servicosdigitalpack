import { useEffect, useState } from 'react';
import { Play, Square, Loader2, AlertTriangle, PauseCircle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/lib/automation/store';
import {
  pipelineStore,
  startPipelineEngine,
  stopPipelineEngine,
  setPipelineBatchSize,
  PAUSE_LABEL,
} from '@/lib/pipeline/pipeline-engine';

/**
 * Controle único do fluxo: Consulta -> Importação -> Links -> Envio.
 * Roda enquanto esta aba estiver aberta; o estado real fica no banco.
 */
export function MotorFluxoCard() {
  const running = useStore(pipelineStore, (s) => s.running);
  const batchSize = useStore(pipelineStore, (s) => s.batchSize);
  const spacingSec = useStore(pipelineStore, (s) => s.spacingSec);
  const stage = useStore(pipelineStore, (s) => s.stage);
  const snapshot = useStore(pipelineStore, (s) => s.snapshot);
  const sentInWindow = useStore(pipelineStore, (s) => s.sentInWindow);
  const remaining = useStore(pipelineStore, (s) => s.remainingInWindow);
  const lastError = useStore(pipelineStore, (s) => s.lastError);
  const pausedUntil = useStore(pipelineStore, (s) => s.pausedUntil);
  const pauseReason = useStore(pipelineStore, (s) => s.pauseReason);

  // Contagem regressiva da pausa automática.
  const [, force] = useState(0);
  useEffect(() => {
    if (!pausedUntil) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [pausedUntil]);

  // Para o motor ao sair da página (evita dois motores em abas diferentes).
  useEffect(() => () => stopPipelineEngine(), []);

  const pendente = snapshot?.pendenteTotal ?? 0;
  const progresso = batchSize > 0 ? Math.min(100, Math.round((sentInWindow / batchSize) * 100)) : 0;

  const pauseMsLeft = pausedUntil ? new Date(pausedUntil).getTime() - Date.now() : 0;
  const isPaused = running && pauseMsLeft > 0;
  const countdown = (() => {
    const total = Math.max(0, Math.ceil(pauseMsLeft / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  })();

  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                isPaused
                  ? 'animate-pulse bg-amber-500'
                  : running
                    ? 'animate-pulse bg-emerald-500'
                    : 'bg-slate-300'
              }`}
            />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Motor do fluxo</h2>
              <p className="text-sm text-slate-500">
                {running
                  ? `Rodando — ${stage}`
                  : 'Parado. Ative para consultar, importar, gerar links e enviar em ordem.'}
              </p>
            </div>
            {running &&
              (isPaused ? (
                <Badge className="bg-amber-100 text-amber-800">
                  <PauseCircle className="mr-1 h-3 w-3" /> em espera
                </Badge>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-800">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> ativo
                </Badge>
              ))}
          </div>


          {running ? (
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={stopPipelineEngine}>
              <Square className="h-4 w-4" /> Parar
            </Button>
          ) : (
            <Button
              size="lg"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={startPipelineEngine}
            >
              <Play className="h-4 w-4" /> Iniciar
            </Button>
          )}
        </div>

        {isPaused && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <PauseCircle className="h-4 w-4 shrink-0" />
            <span>
              Pausado automaticamente ({pauseReason ? PAUSE_LABEL[pauseReason] : 'aguardando'}).
              Retomada automática em <strong>{countdown}</strong>.
            </span>
          </div>
        )}

        {/* Saúde do envio */}
        <div
          className={`rounded-lg border p-3 ${
            health.status === 'blocked'
              ? 'border-red-200 bg-red-50'
              : health.status === 'warning'
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HeartPulse
                className={`h-4 w-4 ${
                  health.status === 'blocked'
                    ? 'text-red-600'
                    : health.status === 'warning'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                }`}
              />
              <span className="text-sm font-semibold text-slate-900">
                Saúde do envio: {HEALTH_LABEL[health.status]}
              </span>
            </div>
            <span className="text-xs text-slate-600">
              {health.enviadosUltimaHora}/{batchSize} nesta hora · limite respeitado
            </span>
          </div>
          {health.reason && <p className="mt-1 text-xs text-slate-700">{health.reason}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
            <span>Na fila: <strong>{health.naFila}</strong></span>
            <span>Enviados (1h): <strong>{health.enviadosUltimaHora}</strong></span>
            <span>Aguardando limite: <strong>{health.aguardando429}</strong></span>
            <span>Falhas: <strong>{health.falhas}</strong></span>
          </div>
        </div>


        {/* Lote por hora */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="w-40">
            <Label className="text-xs">Lote por hora</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={batchSize}
              onChange={(e) => setPipelineBatchSize(Number(e.target.value))}
            />
          </div>
          <div className="flex gap-1">
            {[50, 100, 200, 500].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={batchSize === n ? 'default' : 'outline'}
                onClick={() => setPipelineBatchSize(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            Importa {batchSize} → gera {batchSize} links → envia {batchSize} e-mails (1 a cada{' '}
            {spacingSec}s). Só importa o próximo lote quando este terminar.
          </p>
        </div>

        {/* Etapas do lote */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Step label="1 · Importadas" value={snapshot?.importadas ?? 0} hint="na base" />
          <Step label="2 · Links" value={snapshot?.links ?? 0} hint={`${snapshot?.semLink ?? 0} sem link`} />
          <Step label="3 · Na fila" value={snapshot?.fila ?? 0} hint={`${snapshot?.linksSemEnvio ?? 0} a enfileirar`} />
          <Step label="4 · Enviados" value={snapshot?.enviados ?? 0} hint={`${snapshot?.falhas ?? 0} falhas`} />
        </div>

        {/* Progresso da hora */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
            <span>
              Enviados nesta hora: <strong>{sentInWindow}</strong> / {batchSize}
            </span>
            <span>{remaining} restante(s) na hora</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {pendente > 0
              ? `Lote em andamento: ${pendente} item(ns) pendente(s) antes de importar mais.`
              : 'Lote concluído — pronto para importar o próximo.'}
          </p>
        </div>

        {lastError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {lastError}
          </div>
        )}

        {!running && (
          <p className="text-xs text-slate-500">
            O fluxo roda enquanto esta aba estiver aberta. Se fechar, ele pausa; ao voltar e clicar em
            Iniciar, continua exatamente de onde parou.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Step({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}

/** Log ao vivo do motor. */
export function MotorFluxoLog() {
  const logs = useStore(pipelineStore, (s) => s.logs);
  return (
    <div className="h-48 overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-100">
      {logs.length === 0 ? (
        <div className="text-slate-500">Sem eventos ainda.</div>
      ) : (
        logs.map((l, i) => <div key={i}>{l}</div>)
      )}
    </div>
  );
}
