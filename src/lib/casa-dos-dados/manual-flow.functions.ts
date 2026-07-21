// Manual 2-step flow for Casa dos Dados:
//   1) discoverList  — free listing (no `tipo_resultado=completo`) → enqueues CNPJs.
//   2) importOne     — pops one queue row, calls GET /v5/cnpj/{cnpj} (consumes 1 credit),
//                      upserts company + link, marks queue row `imported`.
// All server fns require admin role.

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');

const filtersSchema = z
  .object({
    only_mei: z.boolean().default(true),
    only_active: z.boolean().default(true),
    only_matriz: z.boolean().default(true),
    require_email: z.boolean().default(false),
  })
  .default({ only_mei: true, only_active: true, only_matriz: true, require_email: false });

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

async function ensureAutomation(supabase: any, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('automatic_company_queries')
    .select('id')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase
    .from('automatic_company_queries')
    .insert({
      owner_user_id: userId,
      name: 'Fluxo manual',
      mode: 'openings_today',
      enabled: false,
      status: 'inactive',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

// ---------------------------------------------------------------------------
// STEP 1 — DISCOVER (free)
// ---------------------------------------------------------------------------

export const discoverList = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        date: dateSchema,
        filters: filtersSchema,
        maxCnpjs: z.number().int().min(1).max(2000).default(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const automationId = await ensureAutomation(supabase, userId);

    const { searchOpeningsByDate } = await import('./client.server');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const pageSize = 50;
    const maxPages = Math.ceil(data.maxCnpjs / pageSize);
    const seen = new Set<string>();
    let enqueued = 0;
    let duplicated = 0;
    let apiTotal: number | null = null;
    let pagesFetched = 0;
    const startedAt = Date.now();
    const softLimitMs = 40_000;

    for (let page = 1; page <= maxPages; page += 1) {
      if (Date.now() - startedAt > softLimitMs) break;
      const r = await searchOpeningsByDate({
        filters: data.filters,
        limit: pageSize,
        page,
        date: data.date,
        completo: false, // FREE — does not consume credits.
        timeoutMs: 15_000,
      });
      pagesFetched += 1;
      if (!r.ok) throw new Error(`API status ${r.status} na página ${page}`);
      apiTotal = r.total;
      if (r.items.length === 0) break;

      for (const item of r.items) {
        const raw = (item as any).cnpj ?? (item as any).cnpj_completo;
        const cnpj = typeof raw === 'string' ? raw.replace(/\D+/g, '') : '';
        if (cnpj.length !== 14) continue;
        if (seen.has(cnpj)) continue;
        seen.add(cnpj);

        const { error: insErr } = await supabaseAdmin
          .from('automatic_company_queue')
          .insert({
            automation_id: automationId,
            query_date: data.date,
            cnpj,
            is_test_record: false,
            data_quality_status: 'pending_enrichment',
            status: 'discovered',
            raw_data: item as any,
            last_normalized_at: new Date().toISOString(),
          });
        if (insErr) {
          if ((insErr as any).code === '23505') duplicated += 1;
          // else: skip silently, do not fail the whole discovery
        } else {
          enqueued += 1;
        }
        if (enqueued + duplicated >= data.maxCnpjs) break;
      }
      if (enqueued + duplicated >= data.maxCnpjs) break;
      if (r.items.length < pageSize) break;
    }

    return {
      ok: true as const,
      date: data.date,
      apiTotal,
      pagesFetched,
      enqueued,
      duplicated,
      creditsConsumed: 0,
    };
  });

// ---------------------------------------------------------------------------
// STEP 2 — IMPORT ONE (paid, ~1 credit per call)
// ---------------------------------------------------------------------------

export const importOne = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        date: dateSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const automationId = await ensureAutomation(supabase, userId);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { fetchCompanyDetailsByCnpj } = await import('./client.server');
    const { normalizeCasaDosDadosCompany } = await import('./worker-logic');
    const publicBaseUrl = (process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

    // Pop one queue row (oldest first) for this automation.
    let query = supabaseAdmin
      .from('automatic_company_queue')
      .select('id, cnpj, query_date, raw_data')
      .eq('automation_id', automationId)
      .in('status', ['discovered', 'pending_enrichment'])
      .order('created_at', { ascending: true })
      .limit(1);
    if (data.date) query = query.eq('query_date', data.date);
    const { data: rows, error: selErr } = await query;
    if (selErr) throw new Error(selErr.message);
    const row = rows?.[0];
    if (!row) return { ok: false as const, reason: 'empty' as const };

    // Mark as processing (best-effort optimistic lock).
    await supabaseAdmin
      .from('automatic_company_queue')
      .update({
        status: 'importing',
        attempts: (0 as any),
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    try {
      // PAID call — 1 credit per CNPJ.
      const detail = await fetchCompanyDetailsByCnpj(row.cnpj as string, { timeoutMs: 20_000 });
      if (!detail.ok || !detail.item) {
        await supabaseAdmin
          .from('automatic_company_queue')
          .update({
            status: 'error',
            last_error: `API status ${detail.status} sem dados`,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        return { ok: false as const, reason: 'api_error' as const, status: detail.status, cnpj: row.cnpj };
      }

      const n = normalizeCasaDosDadosCompany(detail.item);
      const cnpj = row.cnpj as string;
      const displayName = (n.razao_social ?? '').replace(/^\d+[.\-/\s]*/, '').trim() || n.nome_fantasia || cnpj;

      const companyPayload: Record<string, unknown> = {
        cnpj,
        razao_social_original: n.razao_social,
        nome_fantasia: n.nome_fantasia,
        nome_titular_exibicao: displayName,
        email: n.email,
        uf: n.uf,
        municipio_descricao: n.municipio,
        situacao_cadastral_desc: n.situacao_cadastral,
        inicio_atividade: n.data_abertura,
        is_matriz: n.matriz_filial ? /matriz/i.test(n.matriz_filial) : undefined,
        possui_email: !!n.email,
        fonte: 'casa_dos_dados',
        last_seen_at: new Date().toISOString(),
        is_test_record: false,
        data_quality_status: 'complete',
        missing_fields: [],
      };
      for (const k of Object.keys(companyPayload)) if (companyPayload[k] === undefined) delete companyPayload[k];

      // Upsert company.
      const { data: existingCompany } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('cnpj', cnpj)
        .maybeSingle();

      let companyId: string;
      let wasNewCompany = false;
      if (existingCompany?.id) {
        companyId = existingCompany.id as string;
        const { error } = await (supabaseAdmin as any).from('companies').update(companyPayload).eq('id', companyId);
        if (error) throw new Error(`company update: ${error.message}`);
      } else {
        const { data: ins, error } = await (supabaseAdmin as any)
          .from('companies')
          .insert(companyPayload)
          .select('id')
          .single();
        if (error) throw new Error(`company insert: ${error.message}`);
        companyId = ins.id as string;
        wasNewCompany = true;
      }

      // Link: reuse active or create new.
      const { data: existingLink } = await supabaseAdmin
        .from('company_links')
        .select('id, public_token, public_url, checkout_url')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let linkId: string;
      let publicToken: string;
      let publicUrl: string;
      let checkoutUrl: string;
      let wasNewLink = false;

      if (existingLink) {
        linkId = existingLink.id as string;
        publicToken = (existingLink as any).public_token as string;
        publicUrl = (existingLink as any).public_url ?? `${publicBaseUrl}/c/${publicToken}`;
        checkoutUrl = (existingLink as any).checkout_url ?? `${publicBaseUrl}/checkout/${publicToken}`;
      } else {
        publicToken = crypto.randomUUID().replace(/-/g, '');
        publicUrl = `${publicBaseUrl}/c/${publicToken}`;
        checkoutUrl = `${publicBaseUrl}/checkout/${publicToken}`;
        const { data: nl, error: lErr } = await supabaseAdmin
          .from('company_links')
          .insert({
            company_id: companyId,
            public_token: publicToken,
            token: publicToken,
            public_url: publicUrl,
            checkout_url: checkoutUrl,
            active: true,
            status: 'active',
            is_test_record: false,
            data_quality_status: 'complete',
            company_data: { cnpj, nome: displayName, origin: 'casa_dos_dados_manual' } as any,
          })
          .select('id')
          .single();
        if (lErr) throw new Error(`link insert: ${lErr.message}`);
        linkId = nl.id as string;
        wasNewLink = true;
      }

      await supabaseAdmin
        .from('automatic_company_queue')
        .update({
          status: 'imported',
          company_id: companyId,
          company_link_id: linkId,
          was_new_company: wasNewCompany,
          was_new_link: wasNewLink,
          data_quality_status: 'complete',
          missing_fields: [] as any,
          last_error: null,
        })
        .eq('id', row.id);

      return {
        ok: true as const,
        cnpj,
        companyId,
        linkId,
        publicToken,
        publicUrl,
        checkoutUrl,
        wasNewCompany,
        wasNewLink,
        nome: displayName,
      };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      await supabaseAdmin
        .from('automatic_company_queue')
        .update({
          status: 'error',
          last_error: msg,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      return { ok: false as const, reason: 'exception' as const, error: msg, cnpj: row.cnpj };
    }
  });

// ---------------------------------------------------------------------------
// STATS
// ---------------------------------------------------------------------------

export const getFlowStats = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const automationId = await ensureAutomation(supabase, userId);

    const { data, error } = await supabase
      .from('automatic_company_queue')
      .select('status, query_date')
      .eq('automation_id', automationId);
    if (error) throw new Error(error.message);

    const byStatus: Record<string, number> = {};
    const byDate: Record<string, Record<string, number>> = {};
    for (const r of data ?? []) {
      const s = String((r as any).status);
      const d = String((r as any).query_date);
      byStatus[s] = (byStatus[s] ?? 0) + 1;
      if (!byDate[d]) byDate[d] = {};
      byDate[d][s] = (byDate[d][s] ?? 0) + 1;
    }
    return { automationId, byStatus, byDate };
  });

// Reset "error" rows back to discovered so the user can retry.
export const retryErrors = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date: dateSchema.optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const automationId = await ensureAutomation(supabase, userId);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let q = supabaseAdmin
      .from('automatic_company_queue')
      .update({ status: 'discovered', last_error: null })
      .eq('automation_id', automationId)
      .in('status', ['error', 'importing']);
    if (data.date) q = q.eq('query_date', data.date);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
