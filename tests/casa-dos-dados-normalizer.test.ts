// New-behavior tests for the July-2026 rewrite:
//   - normalizeCasaDosDadosCompany handles nested payloads
//   - writeCursor never regresses
//   - runCoreLoop: soft limit, test-manual cap, duplicate accounting on incomplete
// Run: bunx tsx tests/casa-dos-dados-normalizer.test.ts

import {
  normalizeCasaDosDadosCompany,
  validateCompanyItem,
  writeCursor,
} from '../src/lib/casa-dos-dados/worker-logic';
import { runCoreLoop, type WorkerDeps } from '../src/lib/casa-dos-dados/worker.server';
import type { CasaSearchResult } from '../src/lib/casa-dos-dados/client.server';

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function makePage(items: Array<Record<string, unknown>>, total = items.length): CasaSearchResult {
  return {
    status: 200, ok: true, total, items,
    responseKeys: ['total', 'cnpjs'],
    rawPreview: {}, request: { url: 'mock', method: 'POST', body: null },
  };
}

// ---- Normalizer -----------------------------------------------------------

function testNormalizerNested() {
  const raw = {
    cnpj_completo: '11.222.333/0001-44',
    nome_empresarial: 'ACME LTDA',
    situacao_cadastral: { codigo: '02', descricao: 'ATIVA' },
    data_abertura: '01/03/2020',
    matriz_filial: 1,
    municipio: { codigo: '3550308', descricao: 'SAO PAULO' },
    uf: { sigla: 'SP' },
    estabelecimento: {
      email: 'ceo@acme.com',
      ddd_telefone_1: '11 99999-0000',
      tipo_logradouro: 'RUA',
      logradouro: 'DAS FLORES',
      numero: '100',
      bairro: 'CENTRO',
    },
  };
  const n = normalizeCasaDosDadosCompany(raw);
  assert(n.cnpj === '11222333000144', `cnpj=${n.cnpj}`);
  assert(n.razao_social === 'ACME LTDA', `razao=${n.razao_social}`);
  assert(n.situacao_cadastral === 'ATIVA', `situacao=${n.situacao_cadastral}`);
  assert(n.data_abertura === '2020-03-01', `abertura=${n.data_abertura}`);
  assert(n.matriz_filial === 'MATRIZ', `matriz=${n.matriz_filial}`);
  assert(n.municipio === 'SAO PAULO', `municipio=${n.municipio}`);
  assert(n.uf === 'SP', `uf=${n.uf}`);
  assert(n.email === 'ceo@acme.com', `email=${n.email}`);
  assert(n.telefone === '5511999990000', `tel=${n.telefone}`);
  assert(!!n.endereco && n.endereco.includes('DAS FLORES'), `endereco=${n.endereco}`);
  const v = validateCompanyItem(raw);
  assert(v.complete === true, `nested payload must validate as complete, missing=${v.missingFields.join(',')}`);
  console.log('OK  normalizer: nested {codigo,descricao} + estabelecimento.*');
}

// ---- Cursor no-regress ----------------------------------------------------

function testCursorNoRegress() {
  const date = '2026-07-21';
  const step1 = writeCursor({}, date, { page: 2, itemOffset: 10, lastCnpj: 'a' });
  const step2 = writeCursor(step1, date, { page: 1, itemOffset: 0, lastCnpj: null });
  assert(step2[date].page === 2 && step2[date].item_offset === 10, `cursor regressed: ${JSON.stringify(step2[date])}`);
  const step3 = writeCursor(step2, date, { page: 2, itemOffset: 11, lastCnpj: 'b' });
  assert(step3[date].item_offset === 11, 'forward advance must be applied');
  console.log('OK  cursor: never regresses page/offset');
}

// ---- Core loop wiring for behavioral tests --------------------------------

type State = { enqueued: Set<string> };
function makeDeps(pages: CasaSearchResult[], existing: Set<string> = new Set()) {
  const state: State = { enqueued: new Set(existing) };
  let fetchPageCalls = 0;
  const deps: WorkerDeps = {
    fetchPage: async ({ page }) => { fetchPageCalls += 1; return pages[page - 1] ?? makePage([], pages[0]?.total ?? 0); },
    tryEnqueue: async ({ cnpj }) => {
      if (state.enqueued.has(cnpj)) return { ok: false, reason: 'duplicate' } as const;
      state.enqueued.add(cnpj);
      return { ok: true, queueId: `q-${cnpj}` } as const;
    },
    findActiveLinkByCnpj: async () => null,
    upsertCompany: async () => ({ companyId: 'co', wasNew: true }),
    findActiveLinkByCompany: async () => null,
    insertLink: async () => ({ id: 'lk', publicToken: 't', publicUrl: 'u', checkoutUrl: 'c' }),
    updateQueueRow: async () => {},
  };
  return { deps, state, calls: () => ({ fetchPage: fetchPageCalls }) };
}

const automation = { id: 'a', owner_user_id: 'u', mode: 'openings_today', quantity_per_run: 1, interval_minutes: 60, filters: {} };

// 50 incompletes → must stop early, status partial (via partialReason set), no timeout.
async function testAllIncompleteStopsPartial() {
  const items: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 50; i += 1) items.push({ cnpj: String(70000000000000n + BigInt(i)), razao_social: 'X', ddd_telefone_1: '11 99887-6655' });
  const { deps } = makeDeps([makePage(items, 50)]);
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-21', runId: 'r', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x', maxRunMs: 30_000, softLimitMs: 20_000, maxItemsAnalyzed: 50 },
    deps,
  );
  assert(outcome.imported === 0, `imported=${outcome.imported}`);
  assert(outcome.pendingEnrichment === 50, `pendingEnrichment=${outcome.pendingEnrichment}`);
  assert(outcome.itemsAnalyzed === 50, `itemsAnalyzed=${outcome.itemsAnalyzed}`);
  console.log('OK  50 incompletes → parada por itens analisados, sem timeout');
}

// test_manual: 10-item hard cap even when everything is duplicate on the fly.
async function testTestManualCap() {
  const cnpjs: string[] = [];
  for (let i = 0; i < 30; i += 1) cnpjs.push(String(80000000000000n + BigInt(i)));
  const items = cnpjs.map((c) => ({ cnpj: c, razao_social: 'X', ddd_telefone_1: '11 99887-6655' }));
  const { deps } = makeDeps([makePage(items, 30)], new Set(cnpjs));
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-21', runId: 'r', startPage: 1, startOffset: 0, maxPages: 5, pageSize: 50, publicBaseUrl: 'https://x', isTestRun: true, maxTestManualItems: 10 },
    deps,
  );
  assert(outcome.itemsAnalyzed <= 10, `itemsAnalyzed must be ≤ 10, got ${outcome.itemsAnalyzed}`);
  assert(!!outcome.limitReason, 'must set a limitReason');
  console.log('OK  test_manual: máximo 10 itens, encerra com motivo, sem loop');
}

// Incomplete-branch duplicate must count as duplicated (not silent).
async function testIncompleteDuplicateCounts() {
  const cnpj = '90000000000001';
  const item = { cnpj, razao_social: 'X', ddd_telefone_1: '11 99887-6655' }; // incomplete
  const { deps } = makeDeps([makePage([item], 1)], new Set([cnpj])); // already in queue
  const { outcome } = await runCoreLoop(
    { automation, requested: 1, queryDate: '2026-07-21', runId: 'r', startPage: 1, startOffset: 0, maxPages: 1, pageSize: 50, publicBaseUrl: 'https://x' },
    deps,
  );
  assert(outcome.duplicated === 1, `duplicated must be 1, got ${outcome.duplicated}`);
  console.log('OK  incomplete + colisão na fila → contabiliza duplicated');
}

(async () => {
  testNormalizerNested();
  testCursorNoRegress();
  await testAllIncompleteStopsPartial();
  await testTestManualCap();
  await testIncompleteDuplicateCounts();
  console.log('\nAll new tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
