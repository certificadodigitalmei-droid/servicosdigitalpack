// Motor ÚNICO do fluxo (roda no navegador enquanto o painel estiver aberto).
//
// Ordem travada: Consulta -> Importação -> Links -> Fila -> Envio.
// Um lote por hora: o tamanho do lote é igual ao limite de envio por hora,
// então é impossível importar mais do que se envia.

import { createStore } from '@/lib/automation/store';
import { runPipelineTick, type PipelineTickResult } from '@/lib/pipeline/tick.functions';

export type PipelineEngineState = {
  running: boolean;
  batchSize: number;
  spacingSec: number;
  stage: string;
  lastTickAt: string | null;
  ticks: number;
  sentTotal: number;
  importedTotal: number;
  linksTotal: number;
  lastError: string | null;
  logs: string[];
  snapshot: PipelineTickResult['pipeline'] | null;
  sentInWindow: number;
  remainingInWindow: number;
};

export const pipelineStore = createStore<PipelineEngineState>(
  {
    running: false,
    batchSize: 100,
    spacingSec: 36,
    stage: 'parado',
    lastTickAt: null,
    ticks: 0,
    sentTotal: 0,
    importedTotal: 0,
    linksTotal: 0,
    lastError: null,
    logs: [],
    snapshot: null,
    sentInWindow: 0,
    remainingInWindow: 0,
  },
  { storageKey: 'pipeline:engine', persistKeys: ['batchSize'] },
);

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`;
  pipelineStore.set((s) => ({ logs: [line, ...s.logs].slice(0, 200) }));
}

let timerId: number | null = null;
let inFlight = false;

const TICK_MS = 5000;

async function tick() {
  if (inFlight || !pipelineStore.get().running) return;
  inFlight = true;
  try {
    const r = await runPipelineTick({ data: { batchSize: pipelineStore.get().batchSize } });

    if (!r.ok) {
      pipelineStore.set({ lastError: r.error ?? 'erro desconhecido', stage: 'erro no ciclo' });
      log(`Erro: ${r.error ?? 'desconhecido'}`);
      return;
    }

    if (r.skipped === 'locked') {
      pipelineStore.set({ stage: 'aguardando ciclo anterior' });
      return;
    }

    pipelineStore.set((s) => ({
      lastError: null,
      stage: r.stage,
      spacingSec: r.spacingSec,
      lastTickAt: new Date().toISOString(),
      ticks: s.ticks + 1,
      sentTotal: s.sentTotal + r.sent,
      importedTotal: s.importedTotal + r.imported,
      linksTotal: s.linksTotal + r.linksCreated,
      snapshot: r.pipeline,
      sentInWindow: r.sentInWindow,
      remainingInWindow: r.remainingInWindow,
    }));

    if (r.linksCreated > 0) log(`${r.linksCreated} link(s) gerado(s)`);
    if (r.enqueued > 0) log(`${r.enqueued} e-mail(s) na fila`);
    if (r.suppressed > 0) log(`${r.suppressed} empresa(s) sem e-mail — suprimidas`);
    if (r.sent > 0) log(`E-mail enviado (${r.sentInWindow}/${r.batchSize} nesta hora)`);
    if (r.failed > 0) log(`${r.failed} falha(s) no envio`);
    if (r.imported > 0) log(`Novo lote: ${r.imported} empresa(s) importada(s)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pipelineStore.set({ lastError: msg, stage: 'erro no ciclo' });
    log(`Erro: ${msg}`);
  } finally {
    inFlight = false;
  }
}

export function startPipelineEngine() {
  if (typeof window === 'undefined') return;
  if (pipelineStore.get().running) return;
  pipelineStore.set({ running: true, stage: 'iniciando…', lastError: null });
  log('Motor iniciado');
  void tick();
  if (timerId != null) clearInterval(timerId);
  timerId = window.setInterval(() => void tick(), TICK_MS);
}

export function stopPipelineEngine() {
  if (timerId != null) {
    clearInterval(timerId);
    timerId = null;
  }
  if (!pipelineStore.get().running) return;
  pipelineStore.set({ running: false, stage: 'parado' });
  log('Motor parado');
}

export function setPipelineBatchSize(n: number) {
  const batchSize = Math.max(1, Math.min(1000, Math.floor(n || 100)));
  pipelineStore.set({ batchSize, spacingSec: Math.max(1, Math.round(3600 / batchSize)) });
}

export function clearPipelineLogs() {
  pipelineStore.set({ logs: [] });
}
