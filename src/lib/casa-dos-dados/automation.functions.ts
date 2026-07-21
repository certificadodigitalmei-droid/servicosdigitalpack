// Server functions exposed to the admin UI for the "Consulta Automática" feature.
// Every function verifies that the caller has the 'admin' role.

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

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

function todayBRDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function resolveQueryDate(
  mode: string | null | undefined,
  selected: string | null | undefined,
): string {
  if (mode === 'specific' && selected && /^\d{4}-\d{2}-\d{2}$/.test(selected)) {
    // Não permitir futuro
    if (selected > todayBRDate()) return todayBRDate();
    return selected;
  }
  return todayBRDate();
}

export const getAutomationState = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: automation } = await supabase
      .from('automatic_company_queries')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let runs: any[] = [];
    if (automation?.id) {
      const { data } = await supabase
        .from('automatic_company_query_runs')
        .select('*')
        .eq('automation_id', automation.id)
        .order('started_at', { ascending: false })
        .limit(20);
      runs = data ?? [];
    }
    return { automation, runs, todayBR: todayBRDate() };
  });

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida')
  .refine((s) => s <= todayBRDate(), 'não é permitido escolher datas futuras');

export const upsertAutomation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        quantity_per_run: z.number().int().min(1).max(1000),
        interval_minutes: z.number().int().min(1).max(1440).default(60),
        query_date_mode: z.enum(['today', 'specific']).default('today'),
        selected_query_date: dateSchema.nullable().optional(),
        auto_import_enabled: z.boolean().default(true),
        auto_generate_links_enabled: z.boolean().default(true),
        filters: z
          .object({
            only_mei: z.boolean().default(true),
            only_active: z.boolean().default(true),
            only_matriz: z.boolean().default(true),
            require_email: z.boolean().default(true),
          })
          .default({ only_mei: true, only_active: true, only_matriz: true, require_email: true }),
      })
      .refine(
        (v) => !(v.auto_generate_links_enabled && !v.auto_import_enabled),
        { message: 'Ative a importação para gerar links.', path: ['auto_generate_links_enabled'] },
      )
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const selected =
      data.query_date_mode === 'specific' ? data.selected_query_date ?? null : null;

    const { data: existing } = await supabase
      .from('automatic_company_queries')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle();

    const patch = {
      quantity_per_run: data.quantity_per_run,
      interval_minutes: data.interval_minutes,
      filters: data.filters,
      query_date_mode: data.query_date_mode,
      selected_query_date: selected,
      auto_import_enabled: data.auto_import_enabled,
      auto_generate_links_enabled: data.auto_generate_links_enabled,
    };

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
      .insert({
        owner_user_id: userId,
        name: 'Consulta padrão',
        mode: 'openings_today',
        ...patch,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const setAutomationEnabled = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Ao ativar automação horária: força modo "today" (nunca repetir consulta de data passada).
    const patch: Record<string, unknown> = {
      enabled: data.enabled,
      status: data.enabled ? 'active' : 'inactive',
    };
    if (data.enabled) {
      patch.next_run_at = new Date().toISOString();
      patch.query_date_mode = 'today';
      patch.selected_query_date = null;
    }
    const { error } = await (supabase as any)
      .from('automatic_company_queries')
      .update(patch)
      .eq('id', data.id)
      .eq('owner_user_id', userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runAutomationNow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        overrideQuantity: z.number().int().min(1).max(1000).optional(),
        queryDate: dateSchema.nullable().optional(),
        trigger: z.enum(['manual', 'test_manual']).default('manual'),
        overrideAutoImport: z.boolean().optional(),
        overrideAutoLinks: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: claimed, error } = await supabase.rpc('claim_automation_by_id', { _id: data.id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!row) return { ok: false, reason: 'already_running' as const };

    // Load full row for auto flags
    const { data: fullRow } = await supabase
      .from('automatic_company_queries')
      .select('*')
      .eq('id', row.id)
      .maybeSingle();

    const queryDate =
      data.queryDate && /^\d{4}-\d{2}-\d{2}$/.test(data.queryDate)
        ? data.queryDate
        : resolveQueryDate((fullRow as any)?.query_date_mode, (fullRow as any)?.selected_query_date);

    const autoImport =
      data.overrideAutoImport ?? (fullRow as any)?.auto_import_enabled ?? true;
    const autoLinks =
      data.overrideAutoLinks ?? (fullRow as any)?.auto_generate_links_enabled ?? true;

    const { runAutomationOnce } = await import('./worker.server');
    const outcome = await runAutomationOnce(
      {
        id: row.id,
        owner_user_id: row.owner_user_id,
        enabled: (fullRow as any)?.enabled ?? false,
        mode: row.mode,
        quantity_per_run: row.quantity_per_run,
        interval_minutes: row.interval_minutes,
        filters: (row.filters ?? {}) as any,
        auto_import_enabled: autoImport,
        auto_generate_links_enabled: autoLinks,
        pagination_cursors: (fullRow as any)?.pagination_cursors ?? {},
        max_pages_per_run: (fullRow as any)?.max_pages_per_run ?? 20,
        page_size: (fullRow as any)?.page_size ?? 50,
      },
      {
        trigger: data.trigger,
        overrideQuantity: data.overrideQuantity,
        queryDate,
      },
    );
    return { ok: true as const, outcome, queryDate };
  });

export const testApi = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { checkSaldo } = await import('./client.server');
    const r = await checkSaldo();
    return { status: r.status, ok: r.ok, body: JSON.stringify(r.body ?? null) };
  });

/**
 * Consulta apenas a QUANTIDADE (total) para uma data.
 * Não importa empresa, não gera token, não gera link, não adiciona à fila.
 */
export const countByDateFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        queryDate: dateSchema.nullable().optional(),
        filters: z
          .object({
            only_mei: z.boolean().default(true),
            only_active: z.boolean().default(true),
            only_matriz: z.boolean().default(true),
            require_email: z.boolean().default(true),
          })
          .default({ only_mei: true, only_active: true, only_matriz: true, require_email: true }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { countOpeningsByDate } = await import('./client.server');
    const date = data.queryDate && /^\d{4}-\d{2}-\d{2}$/.test(data.queryDate)
      ? data.queryDate
      : todayBRDate();
    const r = await countOpeningsByDate({ filters: data.filters, date });
    return {
      status: r.status,
      ok: r.ok,
      total: r.total,
      date: r.date,
      filters: data.filters,
      checkedAt: new Date().toISOString(),
    };
  });

// Back-compat: mantém o nome antigo, agora consulta o dia atual (BR).
export const countOpeningsTodayFn = countByDateFn;
