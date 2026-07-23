import { DraggableCnpjPanel } from './DraggableCnpjPanel';
import { FloatingStatsPanel } from './FloatingStatsPanel';
import { useStore } from '@/lib/automation/store';
import { envioStore, setShowFloating } from '@/lib/automation/envio-engine';

/**
 * Painéis flutuantes globais — montados no layout do painel, permanecem
 * visíveis enquanto o usuário navega entre as abas.
 */
export function GlobalFloatingPanels() {
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
