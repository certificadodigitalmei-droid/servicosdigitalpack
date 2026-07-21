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

  const stats = {
    total: queue.length,
    sent: queue.filter((q) => q.status === 'sent').length,
    errors: queue.filter((q) => q.status === 'error').length,
    suppressed: queue.filter((q) => q.status === 'suppressed').length,
    pending: queue.filter((q) => q.status === 'pending' || q.status === 'sending').length,
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
          onClose={() => setShowFloating(false)}
        />
      )}
    </>
  );
}
