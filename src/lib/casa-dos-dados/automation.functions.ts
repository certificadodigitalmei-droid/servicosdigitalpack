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
    return { automation, runs };
  });

export const upsertAutomation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        quantity_per_run: z.number().int().min(1).max(1000),
        interval_minutes: z.number().int().min(1).max(1440).default(60),
        filters: z
          .object({
            only_mei: z.boolean().default(true),
            only_active: z.boolean().default(true),
            only_matriz: z.boolean().default(true),
            require_email: z.boolean().default(true),
          })
          .default({ only_mei: true, only_active: true, only_matriz: true, require_email: true }),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: existing } = await supabase
      .from('automatic_company_queries')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await (supabase as any)
        .from('automatic_company_queries')
        .update({
          quantity_per_run: data.quantity_per_run,
          interval_minutes: data.interval_minutes,
          filters: data.filters,
        })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id };
    }
    const { data: created, error } = await supabase
      .from('automatic_company_queries')
      .insert({
        owner_user_id: userId,
        name: 'Consulta padrão',
        mode: 'openings_today',
        quantity_per_run: data.quantity_per_run,
        interval_minutes: data.interval_minutes,
        filters: data.filters,
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
    const patch: Record<string, unknown> = {
      enabled: data.enabled,
      status: data.enabled ? 'active' : 'inactive',
    };
    if (data.enabled) patch.next_run_at = new Date().toISOString();
    const { error } = await supabase
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
    z.object({ id: z.string().uuid(), overrideQuantity: z.number().int().min(1).max(1000).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: claimed, error } = await supabase.rpc('claim_automation_by_id', { _id: data.id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!row) return { ok: false, reason: 'already_running' as const };

    const { runAutomationOnce } = await import('./worker.server');
    const outcome = await runAutomationOnce(
      {
        id: row.id,
        owner_user_id: row.owner_user_id,
        mode: row.mode,
        quantity_per_run: row.quantity_per_run,
        interval_minutes: row.interval_minutes,
        filters: (row.filters ?? {}) as any,
      },
      { trigger: 'manual', overrideQuantity: data.overrideQuantity },
    );
    return { ok: true as const, outcome };
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

export const countOpeningsTodayFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { countOpeningsToday } = await import('./client.server');
    const r = await countOpeningsToday();
    return { status: r.status, ok: r.ok, body: JSON.stringify(r.body ?? null) };
  });
