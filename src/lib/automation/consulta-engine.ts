/**
 * Engine global da aba Consulta Automática.
 *
 * Roda os loops de "Modo automático (consulta grátis)" e "Importação automática"
 * em escopo de MÓDULO — os intervalos não morrem quando o usuário muda de aba
 * dentro do painel. O React consome via `useStore(consultaStore, ...)`.
 */

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { createStore } from './store';
import { envioStore, isEngineRunning as isEnvioRunning } from './envio-engine';
import {
  countByDate,
  importBatch,
  listByDate,
} from '@/lib/casa-dos-dados/simple-flow.functions';


export type FoundRow = {
  cnpj: string;
  nome: string;
  fantasia: string | null;
  uf: string | null;
  municipio: string | null;
  firstSeenAt: string;
};

export type ImportedRow = {
  cnpj: string;
  nome: string;
  publicUrl: string;
  checkoutUrl: string;
  isNewCompany: boolean;
  isNewLink: boolean;
};

export type Filters = {
  only_mei: boolean;
  only_active: boolean;
  only_matriz: boolean;
  require_email: boolean;
};

export type CountResult = {
  date: string;
  total: number | null;
  ok: boolean;
  status: number;
};

export type AutoStats = {
  checks: number;
  lastTotal: number | null;
  prevTotal: number | null;
  delta: number;
  peak: number | null;
  lastCheckAt: string | null;
  startedAt: string | null;
};

type State = {
  // Config persistida
  autoCount: boolean;
  autoIntervalSec: number;
  autoImport: boolean;
  autoImportDelaySec: number;
  autoImportTarget: number; // 0 = infinito, senão para quando autoImportTotal >= alvo
  bufferTarget: number; // quantas empresas manter prontas na fila
  dateMode: 'today' | 'specific';
  selectedDate: string; // ISO yyyy-mm-dd
  filters: Filters;
  quantidade: number;

  // Estado corrente
  foundList: FoundRow[];
  foundListKey: string; // "date|filtersJSON" da última lista carregada
  importedRows: ImportedRow[];
  failedRows: Array<{ cnpj: string; error: string }>;
  importedSet: string[]; // persistido
  autoStats: AutoStats;
  autoImportRuns: number;
  autoImportTotal: number;
  countResult: CountResult | null;
  saldo: string | null;
  isCounting: boolean;
  isImporting: boolean;
  flashes: Array<{ id: number; count: number }>;
  listDialogOpen: boolean;
};

function todayBRString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const initial: State = {
  autoCount: false,
  autoIntervalSec: 30,
  autoImport: false,
  autoImportDelaySec: 60,
  autoImportTarget: 0,
  bufferTarget: 100,
  dateMode: 'today',
  selectedDate: todayBRString(),
  filters: { only_mei: true, only_active: true, only_matriz: true, require_email: true },
  quantidade: 5,
  foundList: [],
  foundListKey: '',
  importedRows: [],
  failedRows: [],
  importedSet: [],
  autoStats: {
    checks: 0,
    lastTotal: null,
    prevTotal: null,
    delta: 0,
    peak: null,
    lastCheckAt: null,
    startedAt: null,
  },
  autoImportRuns: 0,
  autoImportTotal: 0,
  countResult: null,
  saldo: null,
  isCounting: false,
  isImporting: false,
  flashes: [],
  listDialogOpen: false,
};

export const consultaStore = createStore<State>(initial, {
  storageKey: 'automation:consulta:v1',
  persistKeys: [
    'autoCount',
    'autoIntervalSec',
    'autoImport',
    'autoImportDelaySec',
    'autoImportTarget',
    'bufferTarget',
    'dateMode',
    'selectedDate',
    'filters',
    'quantidade',
    'foundList',
    'foundListKey',
    'importedRows',
    'failedRows',
    'importedSet',
    'countResult',
  ],
});

// Preferência do usuário: manter sempre os quatro filtros ativados por padrão.
// Sobrescreve qualquer valor persistido em localStorage no boot do módulo.
if (typeof window !== 'undefined') {
  consultaStore.set({
    filters: {
      only_mei: true,
      only_active: true,
      only_matriz: true,
      require_email: true,
    },
  });
}

/* --------------------------------- helpers -------------------------------- */

function effectiveDate(): string {
  const s = consultaStore.get();
  return s.dateMode === 'today' ? todayBRString() : s.selectedDate || todayBRString();
}

let flashSeq = 0;
export function pushFlash(count: number) {
  const id = ++flashSeq;
  consultaStore.set((s) => ({ flashes: [...s.flashes, { id, count }] }));
  setTimeout(() => {
    consultaStore.set((s) => ({ flashes: s.flashes.filter((f) => f.id !== id) }));
  }, 3200);
}

export function addImported(cnpjs: string[]) {
  if (!cnpjs.length) return;
  consultaStore.set((s) => {
    const next = new Set(s.importedSet);
    for (const c of cnpjs) next.add(c);
    return { importedSet: [...next] };
  });
}

/* --------------------------------- actions -------------------------------- */

export async function runCountOnce(opts: { silent?: boolean } = {}) {
  const { filters } = consultaStore.get();
  const date = effectiveDate();
  consultaStore.set({ isCounting: true });
  try {
    const r: any = await countByDate({ data: { date, filters } });
    consultaStore.set((s) => {
      const now = new Date().toISOString();
      const prev = s.autoStats;
      const nextStats: AutoStats = {
        checks: prev.checks + 1,
        prevTotal: prev.lastTotal,
        lastTotal: r.total,
        delta: r.total != null && prev.lastTotal != null ? r.total - prev.lastTotal : 0,
        peak:
          r.total != null
            ? prev.peak != null
              ? Math.max(prev.peak, r.total)
              : r.total
            : prev.peak,
        lastCheckAt: now,
        startedAt: prev.startedAt ?? now,
      };
      return {
        countResult: { date: r.date, total: r.total, ok: r.ok, status: r.status },
        autoStats: nextStats,
      };
    });
    if (!opts.silent && !r.ok) toast.error(`API respondeu ${r.status}`);
  } catch (e: any) {
    if (!opts.silent) toast.error(e?.message ?? 'Erro');
  } finally {
    consultaStore.set({ isCounting: false });
  }
}

/**
 * Chamado pelo Modo Automático: pagina TODA a lista da data/filtros,
 * mescla no `foundList` sem duplicar e emite flash quando acha novos.
 */
export async function runListOnce(opts: { silent?: boolean; maxPages?: number } = {}) {
  const s = consultaStore.get();
  const date = effectiveDate();
  const filters = s.filters;
  const key = `${date}|${JSON.stringify(filters)}`;

  // Se mudou a chave (data/filtros), zera lista.
  if (key !== s.foundListKey) {
    consultaStore.set({ foundList: [], foundListKey: key });
  }

  consultaStore.set({ isCounting: true });
  const pageSize = 20;
  // SEMPRE relê a partir da página 1 (a API devolve as aberturas mais
  // recentes primeiro). Assim, quando chegam novas remessas no dia, elas
  // entram automaticamente na lista — sem precisar reiniciar o modo
  // automático. Páginas já conhecidas são deduplicadas por CNPJ.
  const HARD_BACKSTOP_PAGES = Math.max(1, opts.maxPages ?? 500);

  const now = new Date().toISOString();
  let page = 1;

  let lastStatus: CountResult = { date, total: null, ok: true, status: 200 };
  let totalAdded = 0;
  let knownStreak = 0;
  const knownBefore = consultaStore.get().foundList.length;

  try {
    while (page <= HARD_BACKSTOP_PAGES) {
      const r: any = await listByDate({
        data: { date, filters, limit: pageSize, page },
      });

      lastStatus = { date: r.date, total: r.total, ok: r.ok, status: r.status };
      const items = r.items ?? [];
      let addedThisPage = 0;
      if (items.length > 0) {
        consultaStore.set((cur) => {
          const seen = new Map(cur.foundList.map((it) => [it.cnpj, it]));
          for (const it of items) {
            if (!seen.has(it.cnpj)) {
              seen.set(it.cnpj, { ...it, firstSeenAt: now });
              addedThisPage += 1;
            }
          }
          if (addedThisPage === 0) return {};
          const list = Array.from(seen.values()).sort((a, b) =>
            b.firstSeenAt.localeCompare(a.firstSeenAt),
          );
          return { foundList: list };
        });
        totalAdded += addedThisPage;
      }
      if (!r.ok) break;
      if (items.length < pageSize) break;
      if (r.total != null && page * pageSize >= r.total) break;

      // Atalho de atualização: se a lista já estava carregada e as duas
      // últimas páginas só trouxeram CNPJs conhecidos, os novos (topo) já
      // foram capturados — não precisa varrer o histórico inteiro de novo.
      if (knownBefore > 0) {
        knownStreak = addedThisPage === 0 ? knownStreak + 1 : 0;
        if (knownStreak >= 2) break;
      }
      page += 1;
    }



    // Atualiza countResult / autoStats
    consultaStore.set((cur) => {
      const prev = cur.autoStats;
      const nextStats: AutoStats = {
        checks: prev.checks + 1,
        prevTotal: prev.lastTotal,
        lastTotal: lastStatus.total,
        delta:
          lastStatus.total != null && prev.lastTotal != null
            ? lastStatus.total - prev.lastTotal
            : 0,
        peak:
          lastStatus.total != null
            ? prev.peak != null
              ? Math.max(prev.peak, lastStatus.total)
              : lastStatus.total
            : prev.peak,
        lastCheckAt: now,
        startedAt: prev.startedAt ?? now,
      };
      return { countResult: lastStatus, autoStats: nextStats };
    });

    if (totalAdded > 0) {
      pushFlash(totalAdded);
      if (!opts.silent) toast.success(`+${totalAdded} novo(s) CNPJ(s) na lista.`);
    }
    if (!opts.silent && !lastStatus.ok) toast.error(`API respondeu ${lastStatus.status}`);

    // Sincroniza importedSet consultando DB
    await syncImportedFromDb();
  } catch (e: any) {
    if (!opts.silent) toast.error(e?.message ?? 'Erro');
  } finally {
    consultaStore.set({ isCounting: false });
  }
}

async function syncImportedFromDb() {
  const list = consultaStore.get().foundList;
  if (!list.length) return;
  const cnpjs = list.map((f) => f.cnpj).filter(Boolean);
  const CHUNK = 200;
  const found: string[] = [];
  for (let i = 0; i < cnpjs.length; i += CHUNK) {
    const slice = cnpjs.slice(i, i + CHUNK);
    const { data } = await supabase.from('companies').select('cnpj').in('cnpj', slice);
    for (const row of data ?? []) if (row?.cnpj) found.push(row.cnpj);
  }
  if (found.length) addImported(found);
}

export async function runImportOnce(opts: { silent?: boolean; overrideLimit?: number } = {}) {
  const s = consultaStore.get();
  const date = effectiveDate();
  // Meta desta execução: pode ser um número grande (ex.: 100). A API oficial
  // aceita no máximo 15 por chamada, então loopamos internamente em lotes de 15
  // até bater a meta ou a API parar de retornar novos CNPJs.
  const HARD_MAX_PER_CALL = 15;
  const target = Math.max(1, opts.overrideLimit ?? s.quantidade ?? 1);
  consultaStore.set({ isImporting: true });
  let totalImported: ImportedRow[] = [];
  let totalFailed: Array<{ cnpj: string; error: string }> = [];
  let totalSkipped = 0;
  try {
    let remaining = target;
    let emptyStreak = 0;
    while (remaining > 0) {
      const batchSize = Math.min(HARD_MAX_PER_CALL, remaining);
      const r: any = await importBatch({
        data: {
          date,
          filters: s.filters,
          limit: batchSize,
          page: 1,
          skipExisting: true,
        },
      });
      if (!r.ok) {
        if (!opts.silent) toast.error(r.error ?? `API respondeu ${r.status}`);
        break;
      }
      const imp: ImportedRow[] = r.imported ?? [];
      const fld: Array<{ cnpj: string; error: string }> = r.failed ?? [];
      totalImported.push(...imp);
      totalFailed.push(...fld);
      totalSkipped += r.skipped ?? 0;
      if (imp.length === 0) {
        emptyStreak++;
        if (emptyStreak >= 2) break; // API não tem mais novos
      } else {
        emptyStreak = 0;
      }
      remaining -= imp.length || batchSize;
      // Curto respiro entre lotes para não afogar a API.
      if (remaining > 0) await new Promise((res) => setTimeout(res, 400));
    }

    const running = consultaStore.get().autoImport;
    consultaStore.set((cur) => ({
      importedRows: running
        ? [...totalImported, ...cur.importedRows].slice(0, 500)
        : totalImported,
      failedRows: running
        ? [...totalFailed, ...cur.failedRows].slice(0, 500)
        : totalFailed,
    }));
    addImported(totalImported.map((it) => it.cnpj).filter(Boolean));

    const nImp = totalImported.length;
    const nFail = totalFailed.length;
    if (!opts.silent) {
      if (nImp > 0) {
        toast.success(`${nImp} empresa(s) importada(s). ${nImp} crédito(s) consumido(s).`);
      } else if (nFail > 0) {
        toast.error(`Nenhuma importada. ${nFail} falha(s).`);
      } else if (totalSkipped > 0) {
        toast.info(`Nenhum CNPJ novo — todos já foram importados.`);
      } else {
        toast.info('Nenhuma empresa retornada pela API.');
      }
    }
    return { imported: nImp, failed: nFail, skipped: totalSkipped };
  } catch (e: any) {
    if (!opts.silent) toast.error(e?.message ?? 'Erro ao importar');
    return { imported: totalImported.length, failed: totalFailed.length, skipped: totalSkipped };
  } finally {
    consultaStore.set({ isImporting: false });
  }
}

/* ---------------------------------- loops --------------------------------- */

let listIntervalId: number | null = null;
let importIntervalId: number | null = null;

function restartListLoop() {
  if (listIntervalId != null) {
    clearInterval(listIntervalId);
    listIntervalId = null;
  }
  const s = consultaStore.get();
  if (!s.autoCount) return;

  const tick = async () => {
    const cur = consultaStore.get();
    if (cur.isCounting) return;
    // 1) Conta rápido (1 request)
    await runCountOnce({ silent: true });
    // 2) Relê SEMPRE a partir da página 1 — a lista acompanha automaticamente
    // as novas remessas do dia, sem precisar clicar em "listar" nem
    // ligar/desligar o modo automático. A varredura para cedo quando as
    // páginas do topo já são conhecidas, então o custo é baixo.
    await runListOnce({ silent: true });
  };

  void tick();
  listIntervalId = window.setInterval(tick, Math.max(5, s.autoIntervalSec) * 1000);
}


let envioJaRodou = false;

function restartImportLoop() {

  if (importIntervalId != null) {
    clearInterval(importIntervalId);
    importIntervalId = null;
  }
  const s = consultaStore.get();
  if (!s.autoImport) return;

  // Regra "buffer": mantém sempre `bufferTarget` empresas prontas na fila
  // do Envio em Massa. A cada tick verifica quantas ainda estão pendentes —
  // quando o envio consome uma e o total cai abaixo do alvo, importa a
  // diferença (uma nova por tick, sempre a mais recente).
  const tick = async () => {
    if (consultaStore.get().isImporting) return;

    const cur0 = consultaStore.get();
    const target = cur0.autoImportTarget || 0;
    if (target > 0 && cur0.autoImportTotal >= target) {
      setAutoImport(false);
      toast.success(`Meta de ${target} importações atingida. Automático desligado.`);
      return;
    }

    // Gate: envio em massa precisa estar rodando em modo REAL. Quando ele não
    // está ativo, apenas espera; nunca desliga sozinho a configuração do fluxo.
    // Assim uma troca momentânea de estado não obriga o operador a clicar de
    // novo e não quebra a sequência consultar → importar → enviar.
    const env = envioStore.get();
    const envioAtivo = isEnvioRunning() && env.running && !env.testMode;
    if (!envioAtivo) {
      return;
    }
    envioJaRodou = true;
    if (env.paused) return;



    // Conta empresas prontas para envio na fila do mestre.
    const pendingLocal = env.queue.filter(
      (q) => q.status === 'pending' || q.status === 'sending',
    ).length;

    const bufferTarget = Math.max(1, cur0.bufferTarget || 100);
    const missing = bufferTarget - pendingLocal;
    if (missing <= 0) return; // fila cheia — nada a importar

    // Importa até 15 por tick (limite da API oficial da Casa dos Dados),
    // e no máximo o que falta para atingir o alvo.
    const batch = Math.min(15, missing);
    const r = await runImportOnce({ silent: true, overrideLimit: batch });
    if (r.imported > 0) {
      consultaStore.set((c) => ({ autoImportTotal: c.autoImportTotal + r.imported }));
      pushFlash(r.imported);
      try {
        const mod = await import('./envio-engine');
        await mod.loadRecipients({ limit: r.imported });
      } catch { /* noop */ }
    }
    consultaStore.set((c) => ({ autoImportRuns: c.autoImportRuns + 1 }));
  };
  void tick();
  // Polling curto (3s) — reage rápido assim que a fila baixa.
  importIntervalId = window.setInterval(tick, 3000);
}



/* ---------------------------- setters/toggles ----------------------------- */

export function setAutoCount(v: boolean) {
  const prev = consultaStore.get().autoCount;
  consultaStore.set({ autoCount: v });
  if (!v && prev) {
    consultaStore.set((s) => ({
      autoStats: { ...s.autoStats, checks: 0, startedAt: null },
    }));
  }
  restartListLoop();
}

export function setAutoImport(v: boolean) {
  const prev = consultaStore.get().autoImport;
  consultaStore.set({ autoImport: v });
  if (!v && prev) {
    consultaStore.set({ autoImportRuns: 0, autoImportTotal: 0 });
  }
  restartImportLoop();
}

export function setAutoIntervalSec(n: number) {
  consultaStore.set({ autoIntervalSec: Math.max(5, Math.min(600, n || 30)) });
  if (consultaStore.get().autoCount) restartListLoop();
}

export function setAutoImportDelaySec(n: number) {
  consultaStore.set({ autoImportDelaySec: Math.max(5, n || 5) });
  if (consultaStore.get().autoImport) restartImportLoop();
}

export function setAutoImportTarget(n: number) {
  consultaStore.set({ autoImportTarget: Math.max(0, Math.floor(n || 0)) });
}

export function setBufferTarget(n: number) {
  consultaStore.set({ bufferTarget: Math.max(1, Math.min(1000, Math.floor(n || 100))) });
}


export function setDateMode(m: 'today' | 'specific') {
  consultaStore.set({ dateMode: m });
  if (m === 'today') consultaStore.set({ selectedDate: todayBRString() });
  if (consultaStore.get().autoCount) restartListLoop();
  if (consultaStore.get().autoImport) restartImportLoop();
}

export function setSelectedDate(iso: string) {
  consultaStore.set({ selectedDate: iso });
  if (consultaStore.get().autoCount) restartListLoop();
  if (consultaStore.get().autoImport) restartImportLoop();
}

export function setFilters(patch: Partial<Filters>) {
  consultaStore.set((s) => ({ filters: { ...s.filters, ...patch } }));
  if (consultaStore.get().autoCount) restartListLoop();
  if (consultaStore.get().autoImport) restartImportLoop();
}

export function setQuantidade(n: number) {
  consultaStore.set({ quantidade: n });
}

export function setListDialogOpen(v: boolean) {
  consultaStore.set({ listDialogOpen: v });
}

export function clearFoundList() {
  consultaStore.set({ foundList: [] });
}

export function setSaldo(v: string | null) {
  consultaStore.set({ saldo: v });
}

/* ------------------------- bootstrap (side-effect) ------------------------ */

let booted = false;
export function bootConsultaEngine() {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  // Retoma loops persistidos.
  if (consultaStore.get().autoCount) restartListLoop();
  if (consultaStore.get().autoImport) restartImportLoop();
}
