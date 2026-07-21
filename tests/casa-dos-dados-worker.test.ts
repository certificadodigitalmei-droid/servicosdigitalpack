// Standalone unit tests for runCoreLoop — no supabase, no HTTP.
// Run: `bunx tsx tests/casa-dos-dados-worker.test.ts` (or node --loader).

import { runCoreLoop, type WorkerDeps } from '../src/lib/casa-dos-dados/worker.server';
import type { CasaSearchResult } from '../src/lib/casa-dos-dados/client.server';

function makePage(cnpjs: string[], total: number): CasaSearchResult {
  return {
    status: 200,
    ok: true,
    total,
    items: cnpjs.map((c) => ({ cnpj: c, razao_social: `Empresa ${c}` })),
    responseKeys: ['total', 'cnpjs'],
    rawPreview: {},
    request: { url: 'mock', method: 'POST', body: null },
  };
}

function makeDeps(opts: {
  pages: string[][];
  total: number;
  existingCnpjs?: Set<string>;
  cnpjsWithActiveLink?: Set<string>;
}): { deps: WorkerDeps; calls: Record<string, number> } {
  const existing = new Set(opts.existingCnpjs ?? []);
  const withLink = new Set(opts.cnpjsWithActiveLink ?? []);
  const enqueued = new Set<string>();
  const calls = { fetchPage: 0, enqueue: 0, upsert: 0, insertLink: 0, findLinkByCnpj: 0 };

  const deps: WorkerDeps = {
    fetchPage: async ({ page }) => {
      calls.fetchPage += 1;
      const p = opts.pages[page - 1] ?? [];
      return makePage(p, opts.total);
    },
    tryEnqueue: async ({ cnpj }) => {
      calls.enqueue += 1;
      if (enqueued.has(cnpj) || existing.has(cnpj)) return { ok: false, reason: 'duplicate' } as const;
      enqueued.add(cnpj);
      return { ok: true, queueId: `q-${cnpj}` } as const;
    },
    findActiveLinkByCnpj: async (cnpj) => {
      calls.findLinkByCnpj += 1;
      if (withLink.has(cnpj)) {
        return { id: `lk-${cnpj}`, publicToken: 't', publicUrl: null, checkoutUrl: null };
      }
      return null;
    },
    upsertCompany: async (payload) => {
      calls.upsert += 1;
      return { companyId: `co-${payload.cnpj}`, wasNew: true };
    },
    findActiveLinkByCompany: async () => null,
    insertLink: async ({ cnpj }) => {
      calls.insertLink += 1;
      return { id: `lk-${cnpj}`, publicToken: 'tok', publicUrl: 'u', checkoutUrl: 'c' };
    },
    updateQueueRow: async () => {},
  };
  return { deps, calls };
}

const automation = {
  id: 'a1',
  owner_user_id: 'u1',
  mode: 'openings_today',
  quantity_per_run: 1,
  interval_minutes: 60,
  filters: {},
  auto_import_enabled: true,
  auto_generate_links_enabled: true,
};

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function testFirstDuplicateSecondNew() {
  const { deps, calls } = makeDeps({
    pages: [['11111111000111', '22222222000122']],
    total: 2,
    existingCnpjs: new Set(['11111111000111']),
    cnpjsWithActiveLink: new Set(['11111111000111']),
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r1', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}, expected 1`);
  assert(outcome.duplicated === 1, `duplicated=${outcome.duplicated}, expected 1`);
  assert(outcome.linksReused === 1, `linksReused=${outcome.linksReused}, expected 1 (dup had active link)`);
  assert(outcome.linksCreated === 1, `linksCreated=${outcome.linksCreated}, expected 1 (new company)`);
  assert(outcome.itemsAnalyzed === 2, `itemsAnalyzed=${outcome.itemsAnalyzed}`);
  assert(outcome.pagesFetched === 1, `pagesFetched=${outcome.pagesFetched}`);
  assert(outcome.cursorEnd?.page === 1 && outcome.cursorEnd?.itemOffset === 2, `cursorEnd=${JSON.stringify(outcome.cursorEnd)}`);
  console.log('OK  test1 first-dup-second-new — imported=1, duplicated=1, linksReused=1, linksCreated=1');
  return calls;
}

async function testFullPageDuplicateThenNextPage() {
  const { deps, calls } = makeDeps({
    pages: [
      ['11111111000111', '22222222000122', '33333333000133'],
      ['44444444000144', '55555555000155'],
    ],
    total: 5,
    existingCnpjs: new Set(['11111111000111', '22222222000122', '33333333000133']),
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r2', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}, expected 1`);
  assert(outcome.duplicated === 3, `duplicated=${outcome.duplicated}, expected 3`);
  assert(outcome.pagesFetched === 2, `pagesFetched=${outcome.pagesFetched}, expected 2`);
  assert(outcome.cursorEnd?.page === 2 && outcome.cursorEnd?.itemOffset === 1, `cursor=${JSON.stringify(outcome.cursorEnd)}`);
  console.log('OK  test2 whole-page-dup then next page — imported=1, duplicated=3, pages=2, cursor=p2/o1');
  return calls;
}

async function testQuantityTenSkipsDuplicates() {
  const dupList = Array.from({ length: 8 }, (_, i) => String(10000000000000 + i));
  const newList = Array.from({ length: 12 }, (_, i) => String(20000000000000 + i));
  const { deps } = makeDeps({
    pages: [dupList.concat(newList.slice(0, 2)), newList.slice(2)],
    total: dupList.length + newList.length,
    existingCnpjs: new Set(dupList),
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 10, queryDate: '2026-07-20', runId: 'r3', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 10, `imported=${outcome.imported}, expected 10`);
  assert(outcome.duplicated === 8, `duplicated=${outcome.duplicated}, expected 8`);
  console.log('OK  test3 requested=10 skips duplicates — imported=10, duplicated=8');
}

async function testResumeFromCursor() {
  const { deps, calls } = makeDeps({
    pages: [['11111111000111', '22222222000122', '33333333000133']],
    total: 3,
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r4', startPage: 1, startOffset: 2, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.itemsAnalyzed === 1, `itemsAnalyzed=${outcome.itemsAnalyzed}, expected 1 (resumed at offset 2)`);
  console.log('OK  test4 resume from cursor — analyzed only 1 item at offset 2');
  return calls;
}

async function testMaxPagesGuard() {
  const dup = (n: number) => Array.from({ length: 3 }, (_, i) => String(n * 1000000000 + i));
  const { deps } = makeDeps({
    pages: [dup(1), dup(2), dup(3), dup(4), dup(5), dup(6)],
    total: 18,
    existingCnpjs: new Set([...dup(1), ...dup(2), ...dup(3), ...dup(4), ...dup(5), ...dup(6)]),
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r5', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 0, `imported=${outcome.imported}, expected 0`);
  assert(outcome.pagesFetched === 3, `pagesFetched=${outcome.pagesFetched}, expected 3 (max)`);
  console.log('OK  test5 max_pages guard stops after 3 pages of duplicates');
}

(async () => {
  await testFirstDuplicateSecondNew();
  await testFullPageDuplicateThenNextPage();
  await testQuantityTenSkipsDuplicates();
  await testResumeFromCursor();
  await testMaxPagesGuard();
  console.log('\nAll tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
