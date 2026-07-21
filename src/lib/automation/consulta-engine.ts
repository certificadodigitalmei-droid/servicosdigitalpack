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
  dateMode: 'today',
  selectedDate: todayBRString(),
  filters: { only_mei: true, only_active: true, only_matriz: true, require_email: false },
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
export async function runListOnce(opts: { silent?: boolean } = {}) {
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
  const maxPages = 500;
  const now = new Date().toISOString();
  let page = 1;
  let lastStatus: CountResult = { date, total: null, ok: true, status: 200 };
  let totalAdded = 0;

  try {
    while (page <= maxPages) {
      const r: any = await listByDate({
        data: { date, filters, limit: pageSize, page },
      });
      lastStatus = { date: r.date, total: r.total, ok: r.ok, status: r.status };
      const items = r.items ?? [];
      if (items.length > 0) {
        let addedThisPage = 0;
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

export async function runImportOnce(opts: { silent?: boolean } = {}) {
  const s = consultaStore.get();
  const date = effectiveDate();
  consultaStore.set({ isImporting: true });
  try {
    const r: any = await importBatch({
      data: {
        date,
        filters: s.filters,
        limit: s.quantidade,
        page: 1,
        skipExisting: true,
      },
    });
    if (!r.ok) {
      if (!opts.silent) toast.error(r.error ?? `API respondeu ${r.status}`);
      return { imported: 0, failed: 0, skipped: 0 };
    }
    const newImported: ImportedRow[] = r.imported ?? [];
    const newFailed: Array<{ cnpj: string; error: string }> = r.failed ?? [];
    const running = consultaStore.get().autoImport;
    consultaStore.set((cur) => ({
      importedRows: running
        ? [...newImported, ...cur.importedRows].slice(0, 200)
        : newImported,
      failedRows: running
        ? [...newFailed, ...cur.failedRows].slice(0, 200)
        : newFailed,
    }));
    addImported(newImported.map((it) => it.cnpj).filter(Boolean));

    const nImp = newImported.length;
    const nFail = newFailed.length;
    if (!opts.silent) {
      if (nImp > 0) {
        toast.success(`${nImp} empresa(s) importada(s). ${nImp} crédito(s) consumido(s).`);
      } else if (nFail > 0) {
        toast.error(`Nenhuma importada. ${nFail} falha(s).`);
      } else if ((r.skipped ?? 0) > 0 && !running) {
        toast.info(`Nenhum CNPJ novo — todos já foram importados.`);
      } else if (!running) {
        toast.info('Nenhuma empresa retornada pela API.');
      }
    }
    return { imported: nImp, failed: nFail, skipped: r.skipped ?? 0 };
  } catch (e: any) {
    if (!opts.silent) toast.error(e?.message ?? 'Erro ao importar');
    return { imported: 0, failed: 0, skipped: 0 };
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
  // Abre o popup para dar feedback visual quando ligar.
  consultaStore.set({ listDialogOpen: true });
  void runListOnce({ silent: true });
  listIntervalId = window.setInterval(
    () => {
      if (!consultaStore.get().isCounting) void runListOnce({ silent: true });
    },
    Math.max(5, s.autoIntervalSec) * 1000,
  );
}

function restartImportLoop() {
  if (importIntervalId != null) {
    clearInterval(importIntervalId);
    importIntervalId = null;
  }
  const s = consultaStore.get();
  if (!s.autoImport) return;
  const tick = async () => {
    if (consultaStore.get().isImporting) return;
    const r = await runImportOnce({ silent: true });
    if (r.imported > 0) {
      consultaStore.set((cur) => ({
        autoImportTotal: cur.autoImportTotal + r.imported,
      }));
      pushFlash(r.imported);
    }
    consultaStore.set((cur) => ({ autoImportRuns: cur.autoImportRuns + 1 }));
  };
  void tick();
  importIntervalId = window.setInterval(
    tick,
    Math.max(5, s.autoImportDelaySec) * 1000,
  );
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
