// Worker that executes a single automation "run".
// Called by the internal server route (via pg_cron) OR from the "run now" server fn.
//
// Data-quality rules (July 2026):
//   - "test_manual" trigger imports incomplete records marked as test.
//   - All other triggers must validate required fields BEFORE upsert.
//     Incomplete records are enqueued as `pending_enrichment` and DO NOT
//     consume the quantity quota nor generate any link.
//
// Pagination model:
//   - "quantity_per_run" means N NEW *valid* companies imported.
//   - Duplicates and incomplete records never consume the quota.
//   - Cursors are persisted per query_date on
//     `automatic_company_queries.pagination_cursors`.

import { searchOpeningsByDate, todayBR, type CasaFilters, type CasaSearchResult } from './client.server';
import {
  classifyItem,
  readCursor,
  writeCursor,
  validateCompanyItem,
  type CursorMap,
} from './worker-logic';

type Automation = {
  id: string;
  owner_user_id: string;
  enabled?: boolean;
  mode: string;
  quantity_per_run: number;
  interval_minutes: number;
  filters: CasaFilters;
  auto_import_enabled?: boolean;
  auto_generate_links_enabled?: boolean;
  pagination_cursors?: CursorMap | null;
  max_pages_per_run?: number | null;
  page_size?: number | null;
};

type SkipReason =
  | 'missing_cnpj'
  | 'invalid_cnpj_length'
  | 'duplicate'
  | 'incomplete'
  | 'detail_lookup_error'
  | 'company_upsert_error'
  | 'link_error'
  | 'queue_error'
  | 'limit_reached'
  | 'other';

export type RunOutcome = {
  runId: string | null;
  status: 'ok' | 'partial' | 'error' | 'noop';
  apiStatus?: number;
  apiTotal?: number | null;
  requested: number;
  imported: number;
  updated: number;
  duplicated: number;
  incomplete: number;
  pendingEnrichment: number;
  linksCreated: number;
  testLinksCreated: number;
  linksReused: number;
  itemsReceived: number;
  itemsAnalyzed: number;
  pagesFetched: number;
  detailQueries: number;
  cursorStart: { page: number; itemOffset: number } | null;
  cursorEnd: { page: number; itemOffset: number; lastCnpj: string | null } | null;
  skipped: Array<{ index: number; page: number; cnpj: string | null; reason: SkipReason; detail?: string; missing?: string[] }>;
  missingFieldsSummary: Record<string, number>;
  responseKeys?: string[];
  error?: string;
  partialReason?: string;
  limitReason?: string;
  autoImportEnabled: boolean;
  autoGenerateLinksEnabled: boolean;
  isTestRun: boolean;
  sample?: {
    cnpj: string | null;
    nome: string | null;
    token: string | null;
    linkPublico: string | null;
    linkCheckout: string | null;
    isTest: boolean;
    dataQualityStatus: string;
    missingFields: string[];
  } | null;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function toDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

// ---------------------------------------------------------------------------
// Dependency-injected core loop (testable without real Supabase / HTTP).
// ---------------------------------------------------------------------------

export type FetchPageFn = (opts: {
  filters: CasaFilters;
  limit: number;
  page: number;
  date: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}) => Promise<CasaSearchResult>;

export type EnqueueArgs = {
  automationId: string;
  runId: string;
  queryDate: string;
  cnpj: string;
  isTestRecord: boolean;
  dataQualityStatus: 'complete' | 'test_partial' | 'pending_enrichment';
  missingFields: string[];
  rawData?: Record<string, unknown> | null;
};

export type EnqueueResult =
  | { ok: true; queueId: string }
  | { ok: false; reason: 'duplicate'; existing?: { id: string; status: string; dataQualityStatus: string } }
  | { ok: false; reason: 'error'; message: string };

export type WorkerDeps = {
  fetchPage: FetchPageFn;
  fetchDetails?: (cnpj: string, opts?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<{ ok: boolean; status: number; item: Record<string, unknown> | null }>;
  tryEnqueue: (args: EnqueueArgs) => Promise<EnqueueResult>;
  findActiveLinkByCnpj: (cnpj: string) => Promise<{ id: string; publicToken: string; publicUrl: string | null; checkoutUrl: string | null } | null>;
  upsertCompany: (payload: Record<string, unknown>) => Promise<{ companyId: string; wasNew: boolean }>;
  findActiveLinkByCompany: (companyId: string) => Promise<{ id: string; publicToken: string; publicUrl: string | null; checkoutUrl: string | null } | null>;
  insertLink: (args: { companyId: string; cnpj: string; nome: string; isTestRecord: boolean; dataQualityStatus: string }) =>
    Promise<{ id: string; publicToken: string; publicUrl: string; checkoutUrl: string }>;
  updateQueueRow: (args: { queueId: string; companyId: string | null; companyLinkId: string | null; wasNewCompany: boolean; wasNewLink: boolean }) => Promise<void>;
};

export type CoreLoopInput = {
  automation: Automation;
  requested: number;
  queryDate: string;
  runId: string;
  startPage: number;
  startOffset: number;
  maxPages: number;
  pageSize: number;
  publicBaseUrl: string;
  isTestRun?: boolean;
  maxRunMs?: number;
  softLimitMs?: number;
  maxItemsAnalyzed?: number;
  maxTestManualItems?: number;
  maxDetailQueries?: number;
  httpTimeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (stage: string, progress?: Record<string, unknown>) => Promise<void> | void;
};

function mergeCompanyData(summary: Record<string, unknown>, detail: Record<string, unknown> | null): Record<string, unknown> {
  if (!detail) return summary;
  return { ...summary, ...detail, cnpj: (detail as any).cnpj ?? (summary as any).cnpj ?? (summary as any).cnpj_completo };
}

function abortErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg || 'Execução interrompida';
}

export async function runCoreLoop(input: CoreLoopInput, deps: WorkerDeps): Promise<{
  outcome: Omit<RunOutcome, 'runId' | 'status' | 'autoImportEnabled' | 'autoGenerateLinksEnabled' | 'isTestRun'>;
  apiSummary: Record<string, unknown>;
}> {
  const { automation, requested, queryDate, runId, startPage, startOffset, maxPages, pageSize, publicBaseUrl } = input;
  const isTestRun = !!input.isTestRun;
  const autoImportEnabled = automation.auto_import_enabled ?? true;
  const autoGenerateLinksEnabled = (automation.auto_generate_links_enabled ?? true) && autoImportEnabled;
  const startedAt = Date.now();
  const maxRunMs = Math.max(5_000, input.maxRunMs ?? 50_000);
  const softLimitMs = Math.max(3_000, Math.min(maxRunMs - 3_000, input.softLimitMs ?? Math.min(35_000, maxRunMs - 10_000)));
  const httpTimeoutMs = Math.max(1_000, input.httpTimeoutMs ?? 12_000);
  const maxItemsAnalyzed = Math.max(1, input.maxItemsAnalyzed ?? Math.min(maxPages * pageSize + 10, 250));
  const maxTestManualItems = Math.max(1, input.maxTestManualItems ?? 10);
  const maxDetailQueries = Math.max(0, input.maxDetailQueries ?? Math.min(maxItemsAnalyzed, 80));

  const outcome = {
    apiStatus: undefined as number | undefined,
    apiTotal: null as number | null,
    requested,
    imported: 0,
    updated: 0,
    duplicated: 0,
    incomplete: 0,
    pendingEnrichment: 0,
    linksCreated: 0,
    testLinksCreated: 0,
    linksReused: 0,
    itemsReceived: 0,
    itemsAnalyzed: 0,
    pagesFetched: 0,
    detailQueries: 0,
    cursorStart: { page: startPage, itemOffset: startOffset } as { page: number; itemOffset: number },
    cursorEnd: null as { page: number; itemOffset: number; lastCnpj: string | null } | null,
    skipped: [] as RunOutcome['skipped'],
    missingFieldsSummary: {} as Record<string, number>,
    responseKeys: undefined as string[] | undefined,
    partialReason: undefined as string | undefined,
    limitReason: undefined as string | undefined,
    sample: null as RunOutcome['sample'],
  };

  const bumpMissing = (fields: string[]) => {
    for (const f of fields) outcome.missingFieldsSummary[f] = (outcome.missingFieldsSummary[f] ?? 0) + 1;
  };

  const apiSummary: Record<string, unknown> = {
    query_date: queryDate,
    page_size: pageSize,
    max_pages: maxPages,
    is_test_run: isTestRun,
    cursor_start: outcome.cursorStart,
    pages: [] as Array<Record<string, unknown>>,
    limits: { max_run_ms: maxRunMs, max_pages: maxPages, max_items_analyzed: maxItemsAnalyzed, max_detail_queries: maxDetailQueries, http_timeout_ms: httpTimeoutMs },
  };

  let page = startPage;
  let offset = startOffset;
  let lastCnpj: string | null = null;
  let sampleSet = false;

  const setLimit = (reason: string, cursorPage = page, cursorOffset = offset) => {
    outcome.limitReason = reason;
    outcome.partialReason = reason;
    outcome.cursorEnd = { page: cursorPage, itemOffset: cursorOffset, lastCnpj };
  };

  const progress = async (stage: string, extra: Record<string, unknown> = {}) => {
    await input.onProgress?.(stage, {
      query_date: queryDate,
      page,
      item_offset: offset,
      pages_fetched: outcome.pagesFetched,
      items_received: outcome.itemsReceived,
      items_analyzed: outcome.itemsAnalyzed,
      imported_count: outcome.imported,
      pending_enrichment_count: outcome.pendingEnrichment,
      detail_queries: outcome.detailQueries,
      ...extra,
    });
  };

  const shouldStop = (cursorPage = page, cursorOffset = offset): boolean => {
    if (input.signal?.aborted) throw new Error('Execução interrompida pelo controlador');
    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxRunMs) {
      setLimit('Tempo máximo da execução atingido', cursorPage, cursorOffset);
      return true;
    }
    if (elapsed >= softLimitMs) {
      setLimit('Tempo seguro da execução atingido — retomará no próximo ciclo', cursorPage, cursorOffset);
      return true;
    }
    if (outcome.itemsAnalyzed >= maxItemsAnalyzed) {
      setLimit('Limite máximo de itens analisados atingido', cursorPage, cursorOffset);
      return true;
    }
    if (isTestRun && outcome.itemsAnalyzed >= maxTestManualItems) {
      setLimit(`Limite de ${maxTestManualItems} itens do modo teste atingido`, cursorPage, cursorOffset);
      return true;
    }
    return false;
  };

  let itemsSeen = 0;

  pageLoop: while (true) {
    if (outcome.pagesFetched >= maxPages) {
      setLimit('Limite máximo de páginas atingido', page, offset);
      break;
    }
    if (outcome.imported >= requested) break;
    if (shouldStop(page, offset)) break;

    await progress('pesquisa_avancada', { page, item_offset: offset });
    const result = await deps.fetchPage({ filters: automation.filters ?? {}, limit: pageSize, page, date: queryDate, signal: input.signal, timeoutMs: httpTimeoutMs });
    await progress('paginacao', { page, http_status: result.status, response_total: result.total, cnpjs_length: result.items.length });
    outcome.pagesFetched += 1;
    outcome.apiStatus = result.status;
    outcome.apiTotal = result.total;
    outcome.responseKeys = result.responseKeys;

    (apiSummary.pages as Array<Record<string, unknown>>).push({
      page,
      http_status: result.status,
      response_total: result.total,
      cnpjs_length: result.items.length,
      offset_start: offset,
    });

    if (!result.ok) {
      throw new Error(`API status ${result.status} on page ${page}`);
    }
    if ((result.total ?? 0) > 0 && result.items.length === 0) {
      throw new Error(`Resposta inconsistente: total=${result.total} mas cnpjs=[] na página ${page}.`);
    }
    if (result.items.length === 0) {
      outcome.cursorEnd = { page, itemOffset: 0, lastCnpj };
      break;
    }

    outcome.itemsReceived += result.items.length;

    for (let i = offset; i < result.items.length; i += 1) {
      itemsSeen += 1;
      if (itemsSeen > maxItemsAnalyzed) {
        setLimit('Limite máximo de itens analisados atingido', page, i);
        break pageLoop;
      }
      if (shouldStop(page, i)) break pageLoop;

      outcome.itemsAnalyzed += 1;
      const item = result.items[i];
      const cls = classifyItem(item);

      if (cls.kind === 'missing_cnpj') {
        outcome.skipped.push({ index: i, page, cnpj: null, reason: 'missing_cnpj' });
        continue;
      }
      if (cls.kind === 'invalid_length') {
        outcome.skipped.push({ index: i, page, cnpj: cls.cnpj, reason: 'invalid_cnpj_length', detail: `len=${cls.len}` });
        continue;
      }
      const cnpj = cls.cnpj;
      lastCnpj = cnpj;

      // Per official spec (July 2026), response.cnpjs already contains all
      // 7 core fields (cnpj, razao_social, situacao_cadastral, data_abertura,
      // matriz_filial, municipio, uf) plus optional email/telefone/etc.
      // We do NOT loop GET /v5/cnpj/{cnpj} per result — it does not add value
      // and does not guarantee email/telefone either. See client.server.ts.
      const enrichedItem = item;

      // Validate data quality directly from search payload.
      await progress('validacao_dos_campos', { page, item_offset: i, cnpj });
      const validation = validateCompanyItem(enrichedItem, automation.filters ?? {});
      const isValid = validation.complete;
      const dataQualityStatus: 'complete' | 'test_partial' | 'pending_enrichment' = isValid
        ? 'complete'
        : isTestRun
          ? 'test_partial'
          : 'pending_enrichment';

      // ---- NORMAL MODE + INCOMPLETE ----
      // Enqueue as pending_enrichment (best effort), skip everything else,
      // DO NOT consume quota. A queue-UNIQUE collision counts as a duplicate,
      // NEVER as silent progress — otherwise the loop would spin forever on
      // dates already fully seen.
      if (!isValid && !isTestRun) {
        outcome.incomplete += 1;
        outcome.pendingEnrichment += 1;
        bumpMissing(validation.missingFields);
        await progress('gravacao_na_fila', { page, item_offset: i, cnpj, data_quality_status: 'pending_enrichment' });
        const enq = await deps.tryEnqueue({
          automationId: automation.id,
          runId,
          queryDate,
          cnpj,
          isTestRecord: false,
          dataQualityStatus: 'pending_enrichment',
          missingFields: validation.missingFields,
          rawData: item,
        });
        if (!enq.ok && enq.reason === 'duplicate') {
          outcome.duplicated += 1;
          outcome.skipped.push({ index: i, page, cnpj, reason: 'incomplete', missing: validation.missingFields, detail: 'duplicate_in_queue' });
        } else if (!enq.ok) {
          outcome.skipped.push({ index: i, page, cnpj, reason: 'queue_error', detail: enq.message });
        } else {
          outcome.skipped.push({ index: i, page, cnpj, reason: 'incomplete', missing: validation.missingFields });
        }
        continue;
      }

      // ---- DEDUPLICATION ----
      await progress('gravacao_na_fila', { page, item_offset: i, cnpj, data_quality_status: dataQualityStatus });
      const enq = await deps.tryEnqueue({
        automationId: automation.id,
        runId,
        queryDate,
        cnpj,
        isTestRecord: isTestRun,
        dataQualityStatus,
        missingFields: validation.missingFields,
        rawData: item,
      });
      if (!enq.ok && enq.reason === 'duplicate') {
        outcome.duplicated += 1;
        outcome.skipped.push({ index: i, page, cnpj, reason: 'duplicate' });
        if (autoGenerateLinksEnabled) {
          const active = await deps.findActiveLinkByCnpj(cnpj);
          if (active) outcome.linksReused += 1;
        }
        continue;
      }
      if (!enq.ok) {
        outcome.skipped.push({ index: i, page, cnpj, reason: 'queue_error', detail: enq.message });
        continue;
      }
      const queueId = enq.queueId;

      if (!autoImportEnabled) {
        outcome.imported += 1;
        if (outcome.imported >= requested) {
          outcome.cursorEnd = { page, itemOffset: i + 1, lastCnpj };
          break pageLoop;
        }
        continue;
      }

      if (!isValid) bumpMissing(validation.missingFields);

      // Use the normalizer output so nested payload shapes are extracted.
      const n = validation.normalized;
      const companyPayload: Record<string, unknown> = {
        cnpj,
        razao_social_original: n.razao_social ?? null,
        nome_fantasia: n.nome_fantasia,
        nome_titular_exibicao:
          pickString(enrichedItem, ['nome_titular', 'nome']) ?? n.razao_social,
        email: n.email,
        uf: n.uf,
        municipio_descricao: n.municipio,
        situacao_cadastral_desc: n.situacao_cadastral,
        inicio_atividade: n.data_abertura,
        is_mei: automation.filters?.only_mei ? true : ((enrichedItem as any).mei === true || (enrichedItem as any).is_mei === true),
        is_matriz: automation.filters?.only_matriz ? true : (n.matriz_filial ? /matriz/i.test(n.matriz_filial) : undefined),
        fonte: 'casa_dos_dados',
        last_seen_at: new Date().toISOString(),
        possui_email: !!n.email,
        is_test_record: isTestRun,
        data_quality_status: dataQualityStatus,
        missing_fields: validation.missingFields,
      };
      for (const k of Object.keys(companyPayload)) if (companyPayload[k] === undefined) delete companyPayload[k];

      let companyId: string;
      let wasNewCompany = false;
      try {
        await progress('upsert_em_companies', { page, item_offset: i, cnpj });
        const up = await deps.upsertCompany(companyPayload);
        companyId = up.companyId;
        wasNewCompany = up.wasNew;
        if (!wasNewCompany) outcome.updated += 1;
      } catch (e: any) {
        outcome.skipped.push({ index: i, page, cnpj, reason: 'company_upsert_error', detail: e?.message ?? String(e) });
        continue;
      }

      let linkId: string | null = null;
      let publicToken: string | null = null;
      let publicUrl: string | null = null;
      let checkoutUrl: string | null = null;
      let wasNewLink = false;

      // Link generation gate:
      //  - normal mode → só se complete
      //  - test mode → permite mesmo com test_partial
      const canGenerateLink = autoGenerateLinksEnabled && (isValid || isTestRun);

      if (canGenerateLink) {
        try {
          await progress('geracao_de_link', { page, item_offset: i, cnpj, company_id: companyId });
          const active = await deps.findActiveLinkByCompany(companyId);
          if (active) {
            linkId = active.id;
            publicToken = active.publicToken;
            publicUrl = active.publicUrl ?? `${publicBaseUrl}/c/${publicToken}`;
            checkoutUrl = active.checkoutUrl ?? `${publicBaseUrl}/checkout/${publicToken}`;
            outcome.linksReused += 1;
          } else {
            const nl = await deps.insertLink({
              companyId,
              cnpj,
              nome: String(companyPayload.nome_titular_exibicao ?? companyPayload.razao_social_original ?? ''),
              isTestRecord: isTestRun,
              dataQualityStatus,
            });
            linkId = nl.id;
            publicToken = nl.publicToken;
            publicUrl = nl.publicUrl;
            checkoutUrl = nl.checkoutUrl;
            wasNewLink = true;
            if (isTestRun) outcome.testLinksCreated += 1;
            else outcome.linksCreated += 1;
          }
        } catch (e: any) {
          outcome.skipped.push({ index: i, page, cnpj, reason: 'link_error', detail: e?.message ?? String(e) });
          continue;
        }
      }

      await progress('atualizacao_da_fila', { page, item_offset: i, cnpj, company_id: companyId, company_link_id: linkId });
      await deps.updateQueueRow({ queueId, companyId, companyLinkId: linkId, wasNewCompany, wasNewLink });

      outcome.imported += 1;
      if (!sampleSet) {
        outcome.sample = {
          cnpj,
          nome: (companyPayload.nome_titular_exibicao as string) ?? (companyPayload.razao_social_original as string) ?? null,
          token: publicToken,
          linkPublico: publicUrl,
          linkCheckout: checkoutUrl,
          isTest: isTestRun,
          dataQualityStatus,
          missingFields: validation.missingFields,
        };
        sampleSet = true;
      }

      if (outcome.imported >= requested) {
        outcome.cursorEnd = { page, itemOffset: i + 1, lastCnpj };
        break pageLoop;
      }
    }

    if (!outcome.cursorEnd) {
      offset = 0;
      page += 1;
      if (typeof outcome.apiTotal === 'number' && outcome.itemsReceived >= outcome.apiTotal) {
        outcome.cursorEnd = { page, itemOffset: 0, lastCnpj };
        break;
      }
    }
  }

  if (!outcome.cursorEnd) {
    outcome.cursorEnd = { page, itemOffset: offset, lastCnpj };
  }

  apiSummary.cursor_end = outcome.cursorEnd;
  apiSummary.skipped = outcome.skipped;
  apiSummary.pages_fetched = outcome.pagesFetched;
  apiSummary.items_received = outcome.itemsReceived;
  apiSummary.items_analyzed = outcome.itemsAnalyzed;
  apiSummary.missing_fields_summary = outcome.missingFieldsSummary;
  apiSummary.last_stage = 'historico_pronto_para_atualizar';

  return { outcome, apiSummary };
}

// ---------------------------------------------------------------------------
// Production entry — wires runCoreLoop to real Supabase + HTTP client.
// ---------------------------------------------------------------------------

export async function runAutomationOnce(
  automation: Automation,
  opts: { trigger: 'cron' | 'manual' | 'test_manual'; overrideQuantity?: number; queryDate?: string },
): Promise<RunOutcome> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const publicBaseUrl = (process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

  const isTestRun = opts.trigger === 'test_manual';
  const requested = Math.max(1, opts.overrideQuantity ?? automation.quantity_per_run ?? 1);
  const queryDate = opts.queryDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.queryDate)
    ? opts.queryDate
    : todayBR();

  const maxPages = Math.max(1, automation.max_pages_per_run ?? 20);
  const pageSize = Math.max(1, Math.min(200, automation.page_size ?? 50));
  const maxRunMs = Math.max(40_000, Math.min(60_000, Number(process.env.CASA_DOS_DADOS_RUN_TIMEOUT_MS ?? 50_000) || 50_000));
  const httpTimeoutMs = Math.max(3_000, Math.min(15_000, Number(process.env.CASA_DOS_DADOS_HTTP_TIMEOUT_MS ?? 12_000) || 12_000));
  const maxItemsAnalyzed = Math.max(1, Math.min(300, Number(process.env.CASA_DOS_DADOS_MAX_ITEMS_PER_RUN ?? Math.min(maxPages * pageSize + 10, 250)) || 250));
  const maxDetailQueries = Math.max(0, Math.min(maxItemsAnalyzed, Number(process.env.CASA_DOS_DADOS_MAX_DETAIL_QUERIES ?? Math.min(maxItemsAnalyzed, 80)) || 80));

  const cursors = (automation.pagination_cursors ?? {}) as CursorMap;
  const { page: startPage, itemOffset: startOffset } = readCursor(cursors, queryDate);

  const autoImportEnabled = automation.auto_import_enabled ?? true;
  const autoGenerateLinksEnabled = (automation.auto_generate_links_enabled ?? true) && autoImportEnabled;
  let runId: string | null = null;
  const outcome: RunOutcome = {
    runId: null,
    status: 'ok',
    requested,
    imported: 0,
    updated: 0,
    duplicated: 0,
    incomplete: 0,
    pendingEnrichment: 0,
    linksCreated: 0,
    testLinksCreated: 0,
    linksReused: 0,
    itemsReceived: 0,
    itemsAnalyzed: 0,
    pagesFetched: 0,
    detailQueries: 0,
    cursorStart: { page: startPage, itemOffset: startOffset },
    cursorEnd: null,
    skipped: [],
    missingFieldsSummary: {},
    autoImportEnabled,
    autoGenerateLinksEnabled,
    isTestRun,
    sample: null,
  };

  let apiSummary: Record<string, unknown> = {};
  let finalStatus: RunOutcome['status'] = 'ok';
  let errorMessage: string | null = null;
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), maxRunMs);
  let lastStage = 'iniciando_execucao';

  const touchHeartbeat = async (stage = lastStage, progress: Record<string, unknown> = {}) => {
    lastStage = stage;
    const nowIso = new Date().toISOString();
    const summaryPatch = {
      ...(apiSummary ?? {}),
      last_stage: stage,
      last_progress: progress,
      heartbeat_at: nowIso,
      limits: { max_run_ms: maxRunMs, max_pages: maxPages, max_items_analyzed: maxItemsAnalyzed, max_detail_queries: maxDetailQueries, http_timeout_ms: httpTimeoutMs },
    };
    apiSummary = summaryPatch;
    try {
      const updates: Promise<unknown>[] = [
        (supabaseAdmin as any).from('automatic_company_queries').update({ heartbeat_at: nowIso }).eq('id', automation.id),
      ];
      if (runId) {
        updates.push(
          (supabaseAdmin as any)
            .from('automatic_company_query_runs')
            .update({ heartbeat_at: nowIso, api_summary: summaryPatch as any })
            .eq('id', runId),
        );
      }
      await Promise.all(updates);
    } catch (e: any) {
      apiSummary.heartbeat_error = e?.message ?? String(e);
    }
  };

  try {
    await touchHeartbeat('criacao_do_historico');
    const { data: runRow, error: runErr } = await (supabaseAdmin as any)
      .from('automatic_company_query_runs')
      .insert({
        automation_id: automation.id,
        status: 'running',
        trigger: opts.trigger,
        requested_quantity: requested,
        query_date: queryDate,
        cursor_start: { page: startPage, itemOffset: startOffset } as any,
        heartbeat_at: new Date().toISOString(),
        api_summary: {
          last_stage: 'historico_criado',
          query_date: queryDate,
          cursor_start: { page: startPage, itemOffset: startOffset },
          limits: { max_run_ms: maxRunMs, max_pages: maxPages, max_items_analyzed: maxItemsAnalyzed, max_detail_queries: maxDetailQueries, http_timeout_ms: httpTimeoutMs },
        } as any,
      })
      .select('id')
      .single();
    if (runErr) throw new Error(`run insert: ${runErr.message}`);
    runId = runRow.id as string;
    outcome.runId = runId;
    await touchHeartbeat('historico_criado', { run_id: runId, cursor_start: outcome.cursorStart });

    if (!publicBaseUrl) throw new Error('PUBLIC_APP_URL não configurado');

    const deps: WorkerDeps = {
      fetchPage: async (o) => {
        await touchHeartbeat('pesquisa_avancada', { page: o.page, limit: o.limit, date: o.date });
        return searchOpeningsByDate(o);
      },
      // fetchDetails intentionally omitted: response.cnpjs already carries
      // the seven required fields. GET /v5/cnpj/{cnpj} is no longer called
      // per-result to keep every run inside the timeout budget.
      tryEnqueue: async ({ automationId, runId: rId, queryDate: qd, cnpj, isTestRecord, dataQualityStatus, missingFields }) => {
        const { data, error } = await supabaseAdmin
          .from('automatic_company_queue')
          .insert({
            automation_id: automationId,
            run_id: rId,
            query_date: qd,
            cnpj,
            is_test_record: isTestRecord,
            data_quality_status: dataQualityStatus,
            missing_fields: missingFields as any,
          })
          .select('id')
          .maybeSingle();
        if (error) {
          if ((error as any).code === '23505') return { ok: false, reason: 'duplicate' };
          return { ok: false, reason: 'error', message: error.message };
        }
        return { ok: true, queueId: data!.id as string };
      },
      findActiveLinkByCnpj: async (cnpj) => {
        const { data: comp } = await supabaseAdmin.from('companies').select('id').eq('cnpj', cnpj).maybeSingle();
        if (!comp?.id) return null;
        const { data: lk } = await supabaseAdmin
          .from('company_links')
          .select('id, public_token, public_url, checkout_url')
          .eq('company_id', comp.id)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!lk) return null;
        return {
          id: lk.id as string,
          publicToken: (lk as any).public_token as string,
          publicUrl: (lk as any).public_url ?? null,
          checkoutUrl: (lk as any).checkout_url ?? null,
        };
      },
      upsertCompany: async (payload) => {
        const cnpj = String(payload.cnpj);
        const { data: existing } = await supabaseAdmin
          .from('companies')
          .select('id, is_test_record, data_quality_status')
          .eq('cnpj', cnpj)
          .maybeSingle();
        if (existing?.id) {
          const nextPayload: Record<string, unknown> = { ...payload };
          if (payload.data_quality_status === 'complete') {
            nextPayload.data_quality_status = 'complete';
            nextPayload.missing_fields = [];
            if ((existing as any).is_test_record) nextPayload.is_test_record = false;
          }
          const { error } = await (supabaseAdmin as any).from('companies').update(nextPayload).eq('id', existing.id);
          if (error) throw new Error(error.message);
          return { companyId: existing.id as string, wasNew: false };
        }
        const { data: ins, error } = await (supabaseAdmin as any).from('companies').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        return { companyId: ins.id as string, wasNew: true };
      },
      findActiveLinkByCompany: async (companyId) => {
        const { data: lk } = await supabaseAdmin
          .from('company_links')
          .select('id, public_token, public_url, checkout_url')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!lk) return null;
        return {
          id: lk.id as string,
          publicToken: (lk as any).public_token as string,
          publicUrl: (lk as any).public_url ?? null,
          checkoutUrl: (lk as any).checkout_url ?? null,
        };
      },
      insertLink: async ({ companyId, cnpj, nome, isTestRecord, dataQualityStatus }) => {
        const publicToken = crypto.randomUUID().replace(/-/g, '');
        const publicUrl = `${publicBaseUrl}/c/${publicToken}`;
        const checkoutUrl = `${publicBaseUrl}/checkout/${publicToken}`;
        const { data, error } = await supabaseAdmin
          .from('company_links')
          .insert({
            company_id: companyId,
            public_token: publicToken,
            token: publicToken,
            public_url: publicUrl,
            checkout_url: checkoutUrl,
            active: true,
            status: 'active',
            is_test_record: isTestRecord,
            data_quality_status: dataQualityStatus,
            company_data: { cnpj, nome, origin: 'casa_dos_dados_automation', is_test: isTestRecord } as any,
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        return { id: data.id as string, publicToken, publicUrl, checkoutUrl };
      },
      updateQueueRow: async ({ queueId, companyId, companyLinkId, wasNewCompany, wasNewLink }) => {
        await supabaseAdmin
          .from('automatic_company_queue')
          .update({ company_id: companyId, company_link_id: companyLinkId, was_new_company: wasNewCompany, was_new_link: wasNewLink })
          .eq('id', queueId);
      },
    };

    const res = await runCoreLoop(
      {
        automation,
        requested,
        queryDate,
        runId,
        startPage,
        startOffset,
        maxPages,
        pageSize,
        publicBaseUrl,
        isTestRun,
        maxRunMs,
        maxItemsAnalyzed,
        maxDetailQueries,
        httpTimeoutMs,
        signal: controller.signal,
        onProgress: touchHeartbeat,
      },
      deps,
    );
    Object.assign(outcome, res.outcome);
    if (!outcome.partialReason && outcome.imported === 0 && outcome.itemsAnalyzed > 0) {
      outcome.partialReason = 'Nenhuma empresa completa encontrada dentro dos limites desta execução';
    }
    finalStatus = outcome.partialReason ? 'partial' : 'ok';
    outcome.status = finalStatus;
    apiSummary = res.apiSummary;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    errorMessage = controller.signal.aborted && !/timeout|tempo/i.test(msg)
      ? `Tempo máximo da execução atingido (${maxRunMs}ms)`
      : msg;
    apiSummary.error = msg;
    apiSummary.last_stage = lastStage;
    finalStatus = 'error';
    outcome.error = errorMessage ?? msg;
    outcome.status = 'error';
  } finally {
    clearTimeout(abortTimer);
    const finishedAt = new Date();
    if (!outcome.cursorEnd) outcome.cursorEnd = { page: startPage, itemOffset: startOffset, lastCnpj: null };
    apiSummary.last_stage = finalStatus === 'error' ? lastStage : 'atualizacao_do_historico';
    apiSummary.finished_at = finishedAt.toISOString();
    apiSummary.detail_queries = outcome.detailQueries;
    apiSummary.partial_reason = outcome.partialReason ?? null;
    apiSummary.limit_reason = outcome.limitReason ?? null;

    if (opts.trigger !== 'test_manual' && outcome.cursorEnd) {
      try {
        const nextCursors = writeCursor(cursors, queryDate, {
          page: outcome.cursorEnd.page,
          itemOffset: outcome.cursorEnd.itemOffset,
          lastCnpj: outcome.cursorEnd.lastCnpj,
        });
        await (supabaseAdmin as any)
          .from('automatic_company_queries')
          .update({ pagination_cursors: nextCursors as any })
          .eq('id', automation.id);
      } catch (e: any) {
        apiSummary.cursor_save_error = e?.message ?? String(e);
      }
    }

    if (runId) {
      try {
        apiSummary.last_stage = 'atualizacao_do_historico';
        await (supabaseAdmin as any)
        .from('automatic_company_query_runs')
        .update({
          status: finalStatus,
          error_message: errorMessage,
          api_total: outcome.apiTotal,
          imported_count: outcome.imported,
          duplicate_count: outcome.duplicated,
          incomplete_count: outcome.incomplete,
          pending_enrichment_count: outcome.pendingEnrichment,
          link_created_count: outcome.linksCreated,
          link_reused_count: outcome.linksReused,
          test_link_count: outcome.testLinksCreated,
          missing_fields_summary: outcome.missingFieldsSummary as any,
          pages_fetched: outcome.pagesFetched,
          items_received: outcome.itemsReceived,
          items_analyzed: outcome.itemsAnalyzed,
          cursor_end: outcome.cursorEnd as any,
          api_summary: apiSummary as any,
          heartbeat_at: finishedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
        })
        .eq('id', runId);
      } catch (e: any) {
        apiSummary.history_update_error = e?.message ?? String(e);
      }
    }

    const next = new Date(finishedAt.getTime() + Math.max(1, automation.interval_minutes) * 60_000);
    const finalAutomationStatus = automation.enabled ? 'active' : 'inactive';
    apiSummary.last_stage = 'liberacao_do_lock';
    const patch: Record<string, unknown> = {
      status: finalAutomationStatus,
      heartbeat_at: null,
      lock_token: null,
      last_run_at: finishedAt.toISOString(),
      last_error: finalStatus === 'error' ? errorMessage : null,
    };
    if (opts.trigger !== 'test_manual') patch.next_run_at = next.toISOString();
    try {
      await (supabaseAdmin as any).from('automatic_company_queries').update(patch).eq('id', automation.id);
    } catch (e: any) {
      outcome.error = outcome.error ?? `Falha ao liberar lock: ${e?.message ?? String(e)}`;
      outcome.status = 'error';
    }
  }

  return outcome;
}
