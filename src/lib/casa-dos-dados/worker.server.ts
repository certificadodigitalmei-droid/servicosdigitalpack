// Worker that executes a single automation "run".
// Called by the internal server route (via pg_cron) OR from the "run now" server fn.
//
// Pagination model:
//   - "quantity_per_run" means N NEW companies imported (or N unique CNPJs
//     when auto-import is off). Duplicates never consume the quota.
//   - Pages are fetched with `page_size` items each. The worker walks forward
//     until it hits the requested quota, runs out of items, or reaches
//     `max_pages_per_run`.
//   - The cursor { page, item_offset, last_cnpj } is persisted per query_date
//     on `automatic_company_queries.pagination_cursors` so the next run
//     resumes where the previous one stopped.

import { searchOpeningsByDate, todayBR, type CasaFilters, type CasaSearchResult } from './client.server';
import { classifyItem, readCursor, writeCursor, type CursorMap } from './worker-logic';

type Automation = {
  id: string;
  owner_user_id: string;
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
  | 'company_upsert_error'
  | 'link_error'
  | 'queue_error'
  | 'other';

export type RunOutcome = {
  runId: string | null;
  status: 'ok' | 'error' | 'noop';
  apiStatus?: number;
  apiTotal?: number | null;
  requested: number;
  imported: number;
  updated: number;
  duplicated: number;
  linksCreated: number;
  linksReused: number;
  itemsReceived: number;
  itemsAnalyzed: number;
  pagesFetched: number;
  cursorStart: { page: number; itemOffset: number } | null;
  cursorEnd: { page: number; itemOffset: number; lastCnpj: string | null } | null;
  skipped: Array<{ index: number; page: number; cnpj: string | null; reason: SkipReason; detail?: string }>;
  responseKeys?: string[];
  error?: string;
  autoImportEnabled: boolean;
  autoGenerateLinksEnabled: boolean;
  sample?: {
    cnpj: string | null;
    nome: string | null;
    token: string | null;
    linkPublico: string | null;
    linkCheckout: string | null;
  } | null;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNestedEmail(obj: Record<string, unknown>): string | null {
  const direct = pickString(obj, ['email', 'email_contato']);
  if (direct) return direct;
  const emails = (obj as any).emails;
  if (Array.isArray(emails) && emails.length > 0) {
    const first = emails[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') return pickString(first as Record<string, unknown>, ['email', 'endereco']);
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
}) => Promise<CasaSearchResult>;

export type WorkerDeps = {
  fetchPage: FetchPageFn;
  // Attempts to enqueue a CNPJ for a run. Returns 'duplicate' if the
  // (automation_id, query_date, cnpj) tuple already exists.
  tryEnqueue: (args: { automationId: string; runId: string; queryDate: string; cnpj: string }) =>
    Promise<{ ok: true; queueId: string } | { ok: false; reason: 'duplicate' } | { ok: false; reason: 'error'; message: string }>;
  // Looks up a duplicate CNPJ's active link (if any) so the worker can
  // count it as `linksReused`.
  findActiveLinkByCnpj: (cnpj: string) => Promise<{ id: string; publicToken: string; publicUrl: string | null; checkoutUrl: string | null } | null>;
  upsertCompany: (payload: Record<string, unknown>) => Promise<{ companyId: string; wasNew: boolean }>;
  findActiveLinkByCompany: (companyId: string) => Promise<{ id: string; publicToken: string; publicUrl: string | null; checkoutUrl: string | null } | null>;
  insertLink: (args: { companyId: string; cnpj: string; nome: string }) =>
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
};

export async function runCoreLoop(input: CoreLoopInput, deps: WorkerDeps): Promise<{
  outcome: Omit<RunOutcome, 'runId' | 'status' | 'autoImportEnabled' | 'autoGenerateLinksEnabled'>;
  apiSummary: Record<string, unknown>;
}> {
  const { automation, requested, queryDate, runId, startPage, startOffset, maxPages, pageSize, publicBaseUrl } = input;
  const autoImportEnabled = automation.auto_import_enabled ?? true;
  const autoGenerateLinksEnabled = (automation.auto_generate_links_enabled ?? true) && autoImportEnabled;

  const outcome = {
    apiStatus: undefined as number | undefined,
    apiTotal: null as number | null,
    requested,
    imported: 0,
    updated: 0,
    duplicated: 0,
    linksCreated: 0,
    linksReused: 0,
    itemsReceived: 0,
    itemsAnalyzed: 0,
    pagesFetched: 0,
    cursorStart: { page: startPage, itemOffset: startOffset } as { page: number; itemOffset: number },
    cursorEnd: null as { page: number; itemOffset: number; lastCnpj: string | null } | null,
    skipped: [] as RunOutcome['skipped'],
    responseKeys: undefined as string[] | undefined,
    sample: null as RunOutcome['sample'],
  };

  const apiSummary: Record<string, unknown> = {
    query_date: queryDate,
    page_size: pageSize,
    max_pages: maxPages,
    cursor_start: outcome.cursorStart,
    pages: [] as Array<Record<string, unknown>>,
  };

  let page = startPage;
  let offset = startOffset;
  let lastCnpj: string | null = null;
  let sampleSet = false;

  // Safety cap on total iterations regardless of page count (defensive).
  const HARD_ITEM_CAP = maxPages * pageSize + 10;
  let itemsSeen = 0;

  pageLoop: while (true) {
    if (outcome.pagesFetched >= maxPages) break;
    if (outcome.imported >= requested) break;

    const result = await deps.fetchPage({ filters: automation.filters ?? {}, limit: pageSize, page, date: queryDate });
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
      // Nothing left on this page → end of data.
      outcome.cursorEnd = { page, itemOffset: 0, lastCnpj };
      break;
    }

    outcome.itemsReceived += result.items.length;

    for (let i = offset; i < result.items.length; i += 1) {
      itemsSeen += 1;
      if (itemsSeen > HARD_ITEM_CAP) break pageLoop;

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

      const enq = await deps.tryEnqueue({ automationId: automation.id, runId, queryDate, cnpj });
      if (!enq.ok && enq.reason === 'duplicate') {
        outcome.duplicated += 1;
        outcome.skipped.push({ index: i, page, cnpj, reason: 'duplicate' });
        // If the duplicate CNPJ still has an active link, count as reused.
        if (autoGenerateLinksEnabled) {
          const active = await deps.findActiveLinkByCnpj(cnpj);
          if (active) outcome.linksReused += 1;
        }
        // DO NOT consume quota — keep walking.
        continue;
      }
      if (!enq.ok) {
        outcome.skipped.push({ index: i, page, cnpj, reason: 'queue_error', detail: enq.message });
        continue;
      }
      const queueId = enq.queueId;

      if (!autoImportEnabled) {
        // Just queued; counts as "processed new" for quantity purposes.
        outcome.imported += 1;
        if (outcome.imported >= requested) {
          outcome.cursorEnd = { page, itemOffset: i + 1, lastCnpj };
          break pageLoop;
        }
        continue;
      }

      const companyPayload: Record<string, unknown> = {
        cnpj,
        razao_social_original: pickString(item, ['razao_social', 'nome_empresarial']) ?? null,
        nome_fantasia: pickString(item, ['nome_fantasia']),
        nome_titular_exibicao:
          pickString(item, ['nome_titular', 'nome']) ??
          pickString(item, ['razao_social', 'nome_empresarial']),
        email: pickNestedEmail(item),
        uf: pickString(item, ['uf']),
        municipio_descricao: pickString(item, ['municipio', 'cidade']),
        situacao_cadastral_desc: pickString(item, ['situacao_cadastral', 'situacao']),
        inicio_atividade: toDate((item as any).data_abertura ?? (item as any).abertura),
        is_mei: automation.filters?.only_mei ? true : ((item as any).mei === true || (item as any).is_mei === true),
        is_matriz: automation.filters?.only_matriz ? true : undefined,
        fonte: 'casa_dos_dados',
        last_seen_at: new Date().toISOString(),
        possui_email: !!pickNestedEmail(item),
      };
      for (const k of Object.keys(companyPayload)) if (companyPayload[k] === undefined) delete companyPayload[k];

      let companyId: string;
      let wasNewCompany = false;
      try {
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

      if (autoGenerateLinksEnabled) {
        try {
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
            });
            linkId = nl.id;
            publicToken = nl.publicToken;
            publicUrl = nl.publicUrl;
            checkoutUrl = nl.checkoutUrl;
            wasNewLink = true;
            outcome.linksCreated += 1;
          }
        } catch (e: any) {
          outcome.skipped.push({ index: i, page, cnpj, reason: 'link_error', detail: e?.message ?? String(e) });
          continue;
        }
      }

      await deps.updateQueueRow({ queueId, companyId, companyLinkId: linkId, wasNewCompany, wasNewLink });

      outcome.imported += 1;
      if (!sampleSet) {
        outcome.sample = {
          cnpj,
          nome: (companyPayload.nome_titular_exibicao as string) ?? (companyPayload.razao_social_original as string) ?? null,
          token: publicToken,
          linkPublico: publicUrl,
          linkCheckout: checkoutUrl,
        };
        sampleSet = true;
      }

      if (outcome.imported >= requested) {
        outcome.cursorEnd = { page, itemOffset: i + 1, lastCnpj };
        break pageLoop;
      }
    }

    // Finished the page without hitting the quota → advance to next page.
    if (!outcome.cursorEnd) {
      // If we walked the whole page, next run should start at page+1 offset 0.
      // But only if we've actually consumed everything from `offset` onward.
      offset = 0;
      page += 1;
      // If API total is known and we've fetched everything, stop.
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
  if (!publicBaseUrl) throw new Error('PUBLIC_APP_URL não configurado');

  const requested = Math.max(1, opts.overrideQuantity ?? automation.quantity_per_run ?? 1);
  const queryDate = opts.queryDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.queryDate)
    ? opts.queryDate
    : todayBR();

  const maxPages = Math.max(1, automation.max_pages_per_run ?? 20);
  const pageSize = Math.max(1, Math.min(200, automation.page_size ?? 50));

  const cursors = (automation.pagination_cursors ?? {}) as CursorMap;
  const { page: startPage, itemOffset: startOffset } = readCursor(cursors, queryDate);

  const autoImportEnabled = automation.auto_import_enabled ?? true;
  const autoGenerateLinksEnabled = (automation.auto_generate_links_enabled ?? true) && autoImportEnabled;

  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('automatic_company_query_runs')
    .insert({
      automation_id: automation.id,
      status: 'running',
      trigger: opts.trigger,
      requested_quantity: requested,
      query_date: queryDate,
      cursor_start: { page: startPage, itemOffset: startOffset } as any,
    })
    .select('id')
    .single();
  if (runErr) throw new Error(`run insert: ${runErr.message}`);
  const runId = runRow.id as string;

  const deps: WorkerDeps = {
    fetchPage: (o) => searchOpeningsByDate(o),
    tryEnqueue: async ({ automationId, runId: rId, queryDate: qd, cnpj }) => {
      const { data, error } = await supabaseAdmin
        .from('automatic_company_queue')
        .insert({ automation_id: automationId, run_id: rId, query_date: qd, cnpj })
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
      const { data: existing } = await supabaseAdmin.from('companies').select('id').eq('cnpj', cnpj).maybeSingle();
      if (existing?.id) {
        const { error } = await (supabaseAdmin as any).from('companies').update(payload).eq('id', existing.id);
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
    insertLink: async ({ companyId, cnpj, nome }) => {
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
          company_data: { cnpj, nome, origin: 'casa_dos_dados_automation' } as any,
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

  const outcome: RunOutcome = {
    runId,
    status: 'ok',
    requested,
    imported: 0,
    updated: 0,
    duplicated: 0,
    linksCreated: 0,
    linksReused: 0,
    itemsReceived: 0,
    itemsAnalyzed: 0,
    pagesFetched: 0,
    cursorStart: { page: startPage, itemOffset: startOffset },
    cursorEnd: null,
    skipped: [],
    autoImportEnabled,
    autoGenerateLinksEnabled,
    sample: null,
  };

  let apiSummary: Record<string, unknown> = {};
  try {
    const res = await runCoreLoop(
      { automation, requested, queryDate, runId, startPage, startOffset, maxPages, pageSize, publicBaseUrl },
      deps,
    );
    Object.assign(outcome, res.outcome);
    outcome.status = 'ok';
    apiSummary = res.apiSummary;

    // Persist cursor for this date (only on non-test runs so a passed-date
    // test does not shift the real automation's cursor).
    if (opts.trigger !== 'test_manual' && outcome.cursorEnd) {
      const nextCursors = writeCursor(cursors, queryDate, {
        page: outcome.cursorEnd.page,
        itemOffset: outcome.cursorEnd.itemOffset,
        lastCnpj: outcome.cursorEnd.lastCnpj,
      });
      await (supabaseAdmin as any)
        .from('automatic_company_queries')
        .update({ pagination_cursors: nextCursors as any })
        .eq('id', automation.id);
    }

    await supabaseAdmin
      .from('automatic_company_query_runs')
      .update({
        status: 'ok',
        api_total: outcome.apiTotal,
        imported_count: outcome.imported,
        duplicate_count: outcome.duplicated,
        link_created_count: outcome.linksCreated,
        link_reused_count: outcome.linksReused,
        pages_fetched: outcome.pagesFetched,
        items_received: outcome.itemsReceived,
        items_analyzed: outcome.itemsAnalyzed,
        cursor_end: outcome.cursorEnd as any,
        api_summary: apiSummary as any,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const isTest = opts.trigger === 'test_manual';
    const now = new Date();
    const next = new Date(now.getTime() + Math.max(1, automation.interval_minutes) * 60_000);
    const okPatch: Record<string, unknown> = { status: 'active', last_run_at: now.toISOString(), last_error: null };
    if (!isTest) okPatch.next_run_at = next.toISOString();
    await (supabaseAdmin as any).from('automatic_company_queries').update(okPatch).eq('id', automation.id);

    return outcome;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    apiSummary.error = msg;

    await supabaseAdmin
      .from('automatic_company_query_runs')
      .update({
        status: 'error',
        error_message: msg,
        api_total: outcome.apiTotal,
        imported_count: outcome.imported,
        duplicate_count: outcome.duplicated,
        link_created_count: outcome.linksCreated,
        link_reused_count: outcome.linksReused,
        pages_fetched: outcome.pagesFetched,
        items_received: outcome.itemsReceived,
        items_analyzed: outcome.itemsAnalyzed,
        cursor_end: outcome.cursorEnd as any,
        api_summary: apiSummary as any,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const isTestErr = opts.trigger === 'test_manual';
    const nowE = new Date();
    const nextE = new Date(nowE.getTime() + Math.max(1, automation.interval_minutes) * 60_000);
    const errPatch: Record<string, unknown> = { status: 'error', last_error: msg, last_run_at: nowE.toISOString() };
    if (!isTestErr) errPatch.next_run_at = nextE.toISOString();
    await (supabaseAdmin as any).from('automatic_company_queries').update(errPatch).eq('id', automation.id);

    outcome.status = 'error';
    outcome.error = msg;
    return outcome;
  }
}
