import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { DraggableCnpjPanel } from './DraggableCnpjPanel';
import { FloatingStatsPanel } from './FloatingStatsPanel';
import { useStore } from '@/lib/automation/store';
import { pipelineStore, resumePipelineEngine } from '@/lib/pipeline/pipeline-engine';
import { envioStore, setShowFloating } from '@/lib/automation/envio-engine';

/**
 * Painéis flutuantes globais — montados no layout do painel, permanecem
 * visíveis enquanto o usuário navega entre as abas.
 */
export function GlobalFloatingPanels() {
  // A aba de WhatsApp não exibe nenhum indicador do fluxo de e-mail.
  const isWhatsappTab = useRouterState({
    select: (s) => s.location.pathname.startsWith('/painel/whatsapp-massa'),
  });
  const showFloating = useStore(envioStore, (s) => s.showFloating);
  const queue = useStore(envioStore, (s) => s.queue);
  const running = useStore(envioStore, (s) => s.running);
  const paused = useStore(envioStore, (s) => s.paused);
  const logs = useStore(envioStore, (s) => s.logs);
  const sentToday = useStore(envioStore, (s) => s.sentToday);
  const sentThisHour = useStore(envioStore, (s) => s.sentThisHour);
  const dailyLimit = useStore(envioStore, (s) => s.dailyLimit);
  const hourlyLimit = useStore(envioStore, (s) => s.hourlyLimit);
  const limitMode = useStore(envioStore, (s) => s.limitMode);
  const delaySec = useStore(envioStore, (s) => s.delaySec);
  const hourlyRestMin = useStore(envioStore, (s) => s.hourlyRestMin);
  const stopAtDaily = useStore(envioStore, (s) => s.stopAtDaily);
  const lastSuccessAt = useStore(envioStore, (s) => s.lastSuccessAt);
  const lastErrorMsg = useStore(envioStore, (s) => s.lastErrorMsg);

  const pending = queue.filter((q) => q.status === 'pending').length;
  const sending = queue.filter((q) => q.status === 'sending').length;
  const suppressed = queue.filter((q) => q.status === 'suppressed').length;
  const errors = queue.filter((q) => q.status === 'error').length;

  // total = tudo que precisa passar hoje (fila atual + já enviados hoje)
  const stats = {
    total: queue.length + sentToday,
    pending,
    sending,
    sent: sentToday,
    sentHour: sentThisHour,
    suppressed,
    errors,
    dailyLimit,
    hourlyLimit,
    hourlyRestMin,
    stopAtDaily,
    limitMode,
    delaySec,
  };

  return (
    <>
      <PipelineEngineHost />
      <DraggableCnpjPanel />
      {showFloating && (
        <FloatingStatsPanel
          stats={stats}
          running={running}
          paused={paused}
          lastEvent={logs[0]}
          lastSuccessAt={lastSuccessAt}
          lastErrorMsg={lastErrorMsg}
          onClose={() => setShowFloating(false)}
        />
      )}
    </>
  );
}

/**
 * Mantém o motor do fluxo rodando em qualquer aba do painel e mostra um selo
 * discreto de "motor ativo" com a etapa atual.
 */
function PipelineEngineHost() {
  const running = useStore(pipelineStore, (s) => s.running);
  const stage = useStore(pipelineStore, (s) => s.stage);
  const pausedUntil = useStore(pipelineStore, (s) => s.pausedUntil);

  useEffect(() => {
    resumePipelineEngine();
  }, []);

  if (!running) return null;

  const paused = !!pausedUntil && new Date(pausedUntil).getTime() > Date.now();

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40">
      <span
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
          paused ? 'bg-amber-100 text-amber-900' : 'bg-emerald-600 text-white'
        }`}
      >
        <span
          className={`h-2 w-2 animate-pulse rounded-full ${paused ? 'bg-amber-500' : 'bg-white'}`}
        />
        Motor {paused ? 'em espera' : 'ativo'} — {stage}
      </span>
    </div>
  );
}

