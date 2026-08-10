// Standalone unit tests for runCoreLoop — no supabase, no HTTP.
// Run: `bunx tsx tests/casa-dos-dados-worker.test.ts` (or node --loader).

import { runCoreLoop, type WorkerDeps } from '../src/lib/casa-dos-dados/worker.server';
import type { CasaSearchResult } from '../src/lib/casa-dos-dados/client.server';

type Item = Record<string, unknown>;

function makeCompleteItem(cnpj: string, overrides: Partial<Item> = {}): Item {
  return {
    cnpj,
    razao_social: `Empresa ${cnpj}`,
    situacao_cadastral: 'ATIVA',
    data_abertura: '2020-01-01',
    matriz_filial: 'MATRIZ',
    municipio: 'SAO PAULO',
    uf: 'SP',
    email: `contato-${cnpj}@example.com`,
    ddd_telefone_1: '11 99887-6655',
    ...overrides,
  };
}

function makePage(items: Item[], total: number): CasaSearchResult {
  return {
    status: 200,
    ok: true,
    total,
    items,
    responseKeys: ['total', 'cnpjs'],
    rawPreview: {},
    request: { url: 'mock', method: 'POST', body: null },
  };
}

function makePageOfCnpjs(cnpjs: string[], total: number): CasaSearchResult {
  return makePage(cnpjs.map((c) => makeCompleteItem(c)), total);
}

type State = {
  companies: Map<string, { id: string; dataQuality: string; isTest: boolean }>;
  links: Map<string, { id: string; isTest: boolean; dataQuality: string }>;
};

function makeDeps(opts: {
  pages: CasaSearchResult[];
  existingCnpjs?: Set<string>;
  cnpjsWithActiveLink?: Set<string>;
}): { deps: WorkerDeps; calls: Record<string, number>; state: State; enqueued: Array<Record<string, unknown>> } {
  const existing = new Set(opts.existingCnpjs ?? []);
  const withLink = new Set(opts.cnpjsWithActiveLink ?? []);
  const enqueuedSet = new Set<string>();
  const enqueued: Array<Record<string, unknown>> = [];
  const state: State = { companies: new Map(), links: new Map() };
  const calls = { fetchPage: 0, enqueue: 0, upsert: 0, insertLink: 0, findLinkByCnpj: 0, updateQueue: 0 };

  const deps: WorkerDeps = {
    fetchPage: async ({ page }) => {
      calls.fetchPage += 1;
      return opts.pages[page - 1] ?? makePage([], opts.pages[0]?.total ?? 0);
    },
    tryEnqueue: async ({ cnpj, isTestRecord, dataQualityStatus, missingFields }) => {
      calls.enqueue += 1;
      const key = cnpj;
      if (enqueuedSet.has(key) || existing.has(key)) return { ok: false, reason: 'duplicate' } as const;
      enqueuedSet.add(key);
      enqueued.push({ cnpj, isTestRecord, dataQualityStatus, missingFields });
      return { ok: true, queueId: `q-${cnpj}` } as const;
    },
    findActiveLinkByCnpj: async (cnpj) => {
      calls.findLinkByCnpj += 1;
      if (withLink.has(cnpj)) return { id: `lk-${cnpj}`, publicToken: 't', publicUrl: null, checkoutUrl: null };
      return null;
    },
    upsertCompany: async (payload) => {
      calls.upsert += 1;
      const cnpj = String(payload.cnpj);
      const existingComp = state.companies.get(cnpj);
      if (existingComp) {
        if (payload.data_quality_status === 'complete') {
          existingComp.dataQuality = 'complete';
          if (existingComp.isTest) existingComp.isTest = false;
        }
        return { companyId: existingComp.id, wasNew: false };
      }
      const id = `co-${cnpj}`;
      state.companies.set(cnpj, {
        id,
        dataQuality: String(payload.data_quality_status ?? 'complete'),
        isTest: !!payload.is_test_record,
      });
      return { companyId: id, wasNew: true };
    },
    findActiveLinkByCompany: async () => null,
    insertLink: async ({ cnpj, isTestRecord, dataQualityStatus }) => {
      calls.insertLink += 1;
      const id = `lk-${cnpj}`;
      state.links.set(id, { id, isTest: isTestRecord, dataQuality: dataQualityStatus });
      return { id, publicToken: 'tok', publicUrl: 'u', checkoutUrl: 'c' };
    },
    updateQueueRow: async () => {
      calls.updateQueue += 1;
    },
  };
  return { deps, calls, state, enqueued };
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
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

// ----- ORIGINAL SUITE (regression) -----

async function testFirstDuplicateSecondNew() {
  const { deps } = makeDeps({
    pages: [makePageOfCnpjs(['11111111000111', '22222222000122'], 2)],
    existingCnpjs: new Set(['11111111000111']),
    cnpjsWithActiveLink: new Set(['11111111000111']),
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r1', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.duplicated === 1, `duplicated=${outcome.duplicated}`);
  assert(outcome.linksReused === 1, `linksReused=${outcome.linksReused}`);
  assert(outcome.linksCreated === 1, `linksCreated=${outcome.linksCreated}`);
  console.log('OK  test1 first-dup-second-new');
}

async function testFullPageDuplicateThenNextPage() {
  const { deps } = makeDeps({
    pages: [
      makePageOfCnpjs(['11111111000111', '22222222000122', '33333333000133'], 5),
      makePageOfCnpjs(['44444444000144', '55555555000155'], 5),
    ],
    existingCnpjs: new Set(['11111111000111', '22222222000122', '33333333000133']),
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r2', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.duplicated === 3, `duplicated=${outcome.duplicated}`);
  assert(outcome.pagesFetched === 2, `pagesFetched=${outcome.pagesFetched}`);
  console.log('OK  test2 whole-page-dup then next page');
}

async function testResumeFromCursor() {
  const { deps } = makeDeps({
    pages: [makePageOfCnpjs(['11111111000111', '22222222000122', '33333333000133'], 3)],
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r4', startPage: 1, startOffset: 2, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.itemsAnalyzed === 1, `itemsAnalyzed=${outcome.itemsAnalyzed}`);
  console.log('OK  test3 resume from cursor');
}

// ----- DATA-QUALITY SUITE -----

async function testCompleteNormal() {
  const { deps, state, enqueued } = makeDeps({
    pages: [makePageOfCnpjs(['99999999000101'], 1)],
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r10', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.incomplete === 0, `incomplete=${outcome.incomplete}`);
  assert(outcome.linksCreated === 1, `linksCreated=${outcome.linksCreated}`);
  assert(outcome.testLinksCreated === 0, 'no test link');
  const comp = state.companies.get('99999999000101')!;
  assert(comp.dataQuality === 'complete' && !comp.isTest, 'company complete non-test');
  assert(enqueued[0]!.dataQualityStatus === 'complete', 'queue complete');
  console.log('OK  test4 complete-normal → imported=1, links=1');
}

async function testIncompleteNormalPendingEnrichment() {
  // 1 incomplete + 1 complete, requested=1. Incomplete must NOT consume quota.
  const incomplete = { cnpj: '11111111000199', razao_social: 'Sem UF', municipio: 'SP' /* no uf, no situacao, etc */ };
  const complete = makeCompleteItem('22222222000101');
  const { deps, state, enqueued } = makeDeps({
    pages: [makePage([incomplete, complete], 2)],
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r11', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.incomplete === 1, `incomplete=${outcome.incomplete}`);
  assert(outcome.pendingEnrichment === 1, `pendingEnrichment=${outcome.pendingEnrichment}`);
  assert(outcome.linksCreated === 1 && outcome.testLinksCreated === 0, 'only normal link');
  assert(!state.companies.has('11111111000199'), 'incomplete not upserted as company');
  const enqIncomplete = enqueued.find((e) => e.cnpj === '11111111000199')!;
  assert(enqIncomplete.dataQualityStatus === 'pending_enrichment', 'enqueued as pending_enrichment');
  assert(Array.isArray(enqIncomplete.missingFields) && (enqIncomplete.missingFields as string[]).length > 0, 'missing fields recorded');
  assert(outcome.missingFieldsSummary && Object.keys(outcome.missingFieldsSummary).length > 0, 'summary populated');
  console.log('OK  test5 incomplete-normal → pending_enrichment, quota not consumed');
}

async function testIncompleteTestMode() {
  const incomplete = { cnpj: '33333333000199', razao_social: 'Falta tudo' };
  const { deps, state } = makeDeps({
    pages: [makePage([incomplete], 1)],
  });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r12', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x', isTestRun: true },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.incomplete === 0, `incomplete (should be 0 in test mode)=${outcome.incomplete}`);
  assert(outcome.testLinksCreated === 1, `testLinksCreated=${outcome.testLinksCreated}`);
  assert(outcome.linksCreated === 0, `normal links must stay 0 in test`);
  const comp = state.companies.get('33333333000199')!;
  assert(comp.isTest === true, 'company flagged as test');
  assert(comp.dataQuality === 'test_partial', `quality=${comp.dataQuality}`);
  console.log('OK  test6 incomplete-test → imported as test_partial, test link created');
}

async function testEmailMissingStillComplete() {
  // Payload without email must still count as complete (email is optional).
  // require_email filter is treated as an API-side hint only.
  const noEmail = makeCompleteItem('44444444000101');
  delete (noEmail as any).email;
  const autoWithEmail = { ...automation, filters: { require_email: true } };
  const { deps, state, calls } = makeDeps({
    pages: [makePage([noEmail], 1)],
  });
  const { outcome } = await runCoreLoop(
    { automation: autoWithEmail, requested: 1, queryDate: '2026-07-20', runId: 'r13', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  assert(outcome.incomplete === 0, `incomplete must be 0 when only email is missing, got ${outcome.incomplete}`);
  assert(outcome.linksCreated === 1, `linksCreated=${outcome.linksCreated}`);
  assert(calls.fetchPage === 1, `fetchPage=${calls.fetchPage} — no per-cnpj GET must happen`);
  const comp = state.companies.get('44444444000101')!;
  assert(comp.dataQuality === 'complete', `quality=${comp.dataQuality}`);
  console.log('OK  test7 email-missing → still complete, no GET /v5/cnpj/{cnpj}');
}

async function testNoDetailLookupHappens() {
  // Complete payload — must NEVER call fetchDetails (deps.fetchDetails absent).
  const items = ['77777777000101', '88888888000101'].map((c) => makeCompleteItem(c));
  const { deps, calls } = makeDeps({ pages: [makePage(items, 2)] });
  assert(deps.fetchDetails === undefined, 'deps.fetchDetails not wired in mock');
  const { outcome } = await runCoreLoop(
    { automation, requested: 2, queryDate: '2026-07-20', runId: 'r15', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.imported === 2, `imported=${outcome.imported}`);
  assert(outcome.detailQueries === 0, `detailQueries must be 0, got ${outcome.detailQueries}`);
  assert(calls.fetchPage === 1, `fetchPage=${calls.fetchPage}`);
  console.log('OK  test9 no detail lookup — response.cnpjs consumed directly');
}

async function testEnrichmentUpgrade() {
  // 1st run: incomplete → pending_enrichment (no company row in mock).
  // 2nd run: same cnpj now complete → company created as complete/non-test.
  const cnpj = '66666666000101';
  const incomplete = { cnpj, razao_social: 'Parcial' };
  const complete = makeCompleteItem(cnpj);

  // Run 1
  const first = makeDeps({ pages: [makePage([incomplete], 1)] });
  await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-20', runId: 'r14a', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    first.deps,
  );
  assert(!first.state.companies.has(cnpj), 'run1: no company created for incomplete');

  // Run 2: fresh state, but simulate: cnpj is NOT in existingCnpjs (fresh queue)
  // The upsert should now create it as complete.
  const second = makeDeps({ pages: [makePage([complete], 1)] });
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-21', runId: 'r14b', startPage: 1, startOffset: 0, maxPages: 3, pageSize: 50, publicBaseUrl: 'https://x' },
    second.deps,
  );
  assert(outcome.imported === 1, `imported=${outcome.imported}`);
  const comp = second.state.companies.get(cnpj)!;
  assert(comp.dataQuality === 'complete' && !comp.isTest, 'enriched → complete + not test');
  console.log('OK  test8 enrichment upgrade → registro completo passa a valer como definitivo');
}

(async () => {
  await testFirstDuplicateSecondNew();
  await testFullPageDuplicateThenNextPage();
  await testResumeFromCursor();
  await testCompleteNormal();
  await testIncompleteNormalPendingEnrichment();
  await testIncompleteTestMode();
  await testEmailMissingStillComplete();
  await testEnrichmentUpgrade();
  await testNoDetailLookupHappens();
  console.log('\nAll tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
