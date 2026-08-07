// Motor ÚNICO do fluxo (roda no navegador enquanto o painel estiver aberto).
//
// Ordem travada: Consulta -> Importação -> Links -> Fila -> Envio.
// Um lote por hora: o tamanho do lote é igual ao limite de envio por hora,
// então é impossível importar mais do que se envia.

import { createStore } from '@/lib/automation/store';
import { runPipelineTick, type PipelineTickResult } from '@/lib/pipeline/tick.functions';

export type PauseReason = 'rate_limit' | 'cycle_error' | 'send_failures';

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
  /** Pausa automática (ISO) — o motor continua ligado e retoma sozinho. */
  pausedUntil: string | null;
  pauseReason: PauseReason | null;
  consecutiveErrors: number;
  consecutiveFailures: number;
  rateLimitHits: number;
  rateLimitWindowStart: string | null;
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
    pausedUntil: null,
    pauseReason: null,
    consecutiveErrors: 0,
    consecutiveFailures: 0,
    rateLimitHits: 0,
    rateLimitWindowStart: null,
  },
  { storageKey: 'pipeline:engine', persistKeys: ['batchSize'] },
);

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`;
  pipelineStore.set((s) => ({ logs: [line, ...s.logs].slice(0, 200) }));
}

export const PAUSE_LABEL: Record<PauseReason, string> = {
  rate_limit: 'limite de e-mail atingido',
  cycle_error: 'erro no ciclo',
  send_failures: 'falhas seguidas no envio',
};

function minutesLeft(untilIso: string) {
  return Math.max(1, Math.ceil((new Date(untilIso).getTime() - Date.now()) / 60000));
}

/** Agenda uma pausa automática; o motor permanece ligado. */
function pauseFor(ms: number, reason: PauseReason) {
  const until = new Date(Date.now() + ms).toISOString();
  pipelineStore.set({ pausedUntil: until, pauseReason: reason, stage: `pausado — ${PAUSE_LABEL[reason]}` });
  log(`Pausado (${PAUSE_LABEL[reason]}) — retomando em ${minutesLeft(until)} min`);
}

/** Volta ao ritmo normal após um ciclo saudável. */
function clearPause(logIt: boolean) {
  const s = pipelineStore.get();
  if (s.pausedUntil || s.pauseReason) {
    if (logIt) log('Retomado automaticamente — envio normalizado');
  }
  pipelineStore.set({
    pausedUntil: null,
    pauseReason: null,
    consecutiveErrors: 0,
    consecutiveFailures: 0,
  });
}

let timerId: number | null = null;
let inFlight = false;

const TICK_MS = 5000;

async function tick() {
  if (inFlight || !pipelineStore.get().running) return;

  // Pausa automática em andamento: nada é enviado até o tempo acabar.
  const cur = pipelineStore.get();
  if (cur.pausedUntil) {
    const remainMs = new Date(cur.pausedUntil).getTime() - Date.now();
    if (remainMs > 0) {
      const reason = cur.pauseReason ? PAUSE_LABEL[cur.pauseReason] : 'aguardando';
      pipelineStore.set({
        stage: `pausado — ${reason} · retoma em ${Math.ceil(remainMs / 60000)} min`,
      });
      return;
    }
    pipelineStore.set({ pausedUntil: null, stage: 'retomando…' });
    log('Tempo de espera concluído — retomando envios');
  }

  inFlight = true;
  try {
    const r = await runPipelineTick({ data: { batchSize: pipelineStore.get().batchSize } });

    if (!r.ok) {
      const n = pipelineStore.get().consecutiveErrors + 1;
      pipelineStore.set({ lastError: r.error ?? 'erro desconhecido', consecutiveErrors: n });
      log(`Erro: ${r.error ?? 'desconhecido'}`);
      pauseFor(Math.min(30 * 60_000, 60_000 * Math.pow(2, n - 1)), 'cycle_error');
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

    // --- limite de envio (429): espera o tempo do provedor, escalando -------
    if (r.rateLimited) {
      const st = pipelineStore.get();
      const windowStart = st.rateLimitWindowStart ? new Date(st.rateLimitWindowStart).getTime() : 0;
      const freshWindow = !windowStart || Date.now() - windowStart > 3_600_000;
      const hits = freshWindow ? 1 : st.rateLimitHits + 1;
      const ladder = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
      const escalated = ladder[Math.min(hits - 1, ladder.length - 1)];
      const waitMs = Math.max((r.retryAfterSec || 60) * 1000, escalated);
      pipelineStore.set({
        rateLimitHits: hits,
        rateLimitWindowStart: freshWindow ? new Date().toISOString() : st.rateLimitWindowStart,
      });
      pauseFor(waitMs, 'rate_limit');
      return;
    }

    // --- falhas seguidas de envio (credencial, provedor recusando) ----------
    if (r.failed > 0 && r.sent === 0) {
      const n = pipelineStore.get().consecutiveFailures + 1;
      pipelineStore.set({ consecutiveFailures: n });
      if (n >= 3) {
        pipelineStore.set({ consecutiveFailures: 0 });
        pauseFor(15 * 60_000, 'send_failures');
        return;
      }
    } else if (r.sent > 0) {
      clearPause(pipelineStore.get().pauseReason !== null);
      pipelineStore.set({ rateLimitHits: 0 });
    } else {
      pipelineStore.set({ consecutiveErrors: 0 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const n = pipelineStore.get().consecutiveErrors + 1;
    pipelineStore.set({ lastError: msg, consecutiveErrors: n });
    log(`Erro: ${msg}`);
    pauseFor(Math.min(30 * 60_000, 60_000 * Math.pow(2, n - 1)), 'cycle_error');
  } finally {
    inFlight = false;
  }
}

export function startPipelineEngine() {
  if (typeof window === 'undefined') return;
  if (pipelineStore.get().running) return;
  pipelineStore.set({
    running: true,
    stage: 'iniciando…',
    lastError: null,
    pausedUntil: null,
    pauseReason: null,
    consecutiveErrors: 0,
    consecutiveFailures: 0,
  });
  log('Motor iniciado (pausa e retomada automáticas ativas)');
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
  pipelineStore.set({ running: false, stage: 'parado', pausedUntil: null, pauseReason: null });
  log('Motor parado');
}

export function setPipelineBatchSize(n: number) {
  const batchSize = Math.max(1, Math.min(1000, Math.floor(n || 100)));
  pipelineStore.set({ batchSize, spacingSec: Math.max(1, Math.round(3600 / batchSize)) });
}

export function clearPipelineLogs() {
  pipelineStore.set({ logs: [] });
}
