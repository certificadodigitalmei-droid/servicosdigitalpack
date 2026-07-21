// Fluxo SIMPLES para Casa dos Dados + configuração de auto-import contínuo.

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

// ---------------------------------------------------------------------------
// SALDO (grátis)
// ---------------------------------------------------------------------------
export const getSaldo = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { checkSaldo } = await import('./client.server');
    const r = await checkSaldo({ timeoutMs: 10_000 });
    return { status: r.status, ok: r.ok, body: JSON.stringify(r.body) };
  });

// ---------------------------------------------------------------------------
// CONTAGEM (grátis)
// ---------------------------------------------------------------------------
export const countByDate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ date: dateSchema, filters: filtersSchema }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { countOpeningsByDate } = await import('./client.server');
    const r = await countOpeningsByDate({
      filters: data.filters,
      date: data.date,
      timeoutMs: 15_000,
    });
    return { ok: r.ok, status: r.status, total: r.total, date: r.date };
  });

// ---------------------------------------------------------------------------
// LISTAR CNPJs da data (grátis — modo descoberta, sem tipo_resultado=completo)
// Usado pelo Modo Automático para acumular a lista em tempo real no navegador.
// ---------------------------------------------------------------------------
export const listByDate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        date: dateSchema,
        filters: filtersSchema,
        limit: z.number().int().min(1).max(20).default(20),
        page: z.number().int().min(1).max(500).default(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { searchOpeningsByDate } = await import('./client.server');
    const r = await searchOpeningsByDate({
      filters: data.filters,
      date: data.date,
      limit: data.limit,
      page: data.page,
      completo: false,
      timeoutMs: 15_000,
    });
    const items = (r.items ?? []).map((raw: any) => {
      const estab = raw?.estabelecimento && typeof raw.estabelecimento === 'object' ? raw.estabelecimento : raw;
      const cnpjRaw =
        raw?.cnpj ?? raw?.cnpj_completo ?? estab?.cnpj ?? estab?.cnpj_completo ?? '';
      const cnpj = String(cnpjRaw).replace(/\D+/g, '');
      const nome =
        raw?.razao_social ??
        raw?.nome_empresarial ??
        estab?.razao_social ??
        raw?.nome_fantasia ??
        estab?.nome_fantasia ??
        cnpj;
      const fantasia = raw?.nome_fantasia ?? estab?.nome_fantasia ?? null;
      const uf = raw?.uf ?? estab?.uf ?? raw?.endereco?.uf ?? null;
      const municipio =
        raw?.municipio ?? estab?.municipio ?? raw?.endereco?.municipio ?? null;
      return { cnpj, nome: String(nome), fantasia, uf, municipio };
    }).filter((it) => it.cnpj.length === 14);
    return { ok: r.ok, status: r.status, total: r.total, date: data.date, items };
  });

// ---------------------------------------------------------------------------
// IMPORTAR LOTE — manual (não dedup por padrão)
// ---------------------------------------------------------------------------
export const importBatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        date: dateSchema,
        filters: filtersSchema,
        limit: z.number().int().min(1).max(15).default(10),
        page: z.number().int().min(1).max(200).default(1),
        skipExisting: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runImportBatch } = await import('./simple-flow.server');
    return runImportBatch(data);
  });

// ---------------------------------------------------------------------------
// AUTO-IMPORT (contínuo, dedup automático)
// Reusa a tabela automatic_company_queries: um único registro por usuário.
// ---------------------------------------------------------------------------
export const getAutoImportConfig = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await context.supabase
      .from('automatic_company_queries')
      .select(
        'id, enabled, interval_minutes, quantity_per_run, filters, next_run_at, last_run_at, last_error, status',
      )
      .eq('owner_user_id', context.userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let lastRun: any = null;
    if (data?.id) {
      const { data: run } = await context.supabase
        .from('automatic_company_query_runs')
        .select(
          'id, started_at, finished_at, status, total_returned, saved_companies, links_generated, error_message, api_summary',
        )
        .eq('automation_id', data.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lastRun = run;
    }

    return { config: data ?? null, lastRun };
  });

export const saveAutoImportConfig = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enabled: z.boolean(),
        interval_minutes: z.number().int().min(5).max(1440),
        quantity_per_run: z.number().int().min(1).max(15),
        filters: filtersSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from('automatic_company_queries')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      enabled: data.enabled,
      status: data.enabled ? 'active' : 'inactive',
      interval_minutes: data.interval_minutes,
      quantity_per_run: data.quantity_per_run,
      filters: data.filters,
      mode: 'openings_today',
      query_date_mode: 'today',
      selected_query_date: null,
      auto_import_enabled: true,
      auto_generate_links_enabled: true,
    };
    if (data.enabled) {
      patch.next_run_at = new Date().toISOString();
    }

    if (existing?.id) {
      const { error } = await (supabase as any)
        .from('automatic_company_queries')
        .update(patch)
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id };
    }
    const { data: created, error } = await (supabase as any)
      .from('automatic_company_queries')
      .insert({ owner_user_id: userId, name: 'Auto-import MEI', ...patch })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });
