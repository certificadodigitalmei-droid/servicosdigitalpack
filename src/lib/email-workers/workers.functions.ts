import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type EmailWorker = {
  id: string;
  name: string;
  worker_url: string;
  worker_api_key: string;
  from_email: string | null;
  from_name: string | null;
  priority: number;
  hourly_limit: number;
  daily_limit: number;
  monthly_limit: number;
  is_active: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
  last_used_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', context.userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error('Falha ao verificar permissão: ' + error.message);
  if (!data) throw new Error('forbidden');
}

export const listEmailWorkers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailWorker[]> => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any)
      .from('email_workers')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as EmailWorker[];
  });

export type UpsertWorkerInput = {
  id?: string;
  name: string;
  worker_url: string;
  worker_api_key: string;
  from_email?: string | null;
  from_name?: string | null;
  priority?: number;
  hourly_limit?: number;
  daily_limit?: number;
  monthly_limit?: number;
  notes?: string | null;
};

export const upsertEmailWorker = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpsertWorkerInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload: any = {
      name: data.name.trim(),
      worker_url: data.worker_url.trim().replace(/\/+$/, ''),
      worker_api_key: data.worker_api_key.trim(),
      from_email: data.from_email?.trim() || null,
      from_name: data.from_name?.trim() || null,
      priority: data.priority ?? 100,
      hourly_limit: data.hourly_limit ?? 100,
      daily_limit: data.daily_limit ?? 2000,
      monthly_limit: data.monthly_limit ?? 50000,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await (context.supabase as any).from('email_workers').update(payload).eq('id', data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (context.supabase as any).from('email_workers').insert(payload).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteEmailWorker = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any).from('email_workers').delete().eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleEmailWorker = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context.supabase as any)
      .from('email_workers')
      .update({ is_active: data.is_active })
      .eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testEmailWorker = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; recipient?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: w, error } = await (context.supabase as any)
      .from('email_workers')
      .select('*')
      .eq('id', data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!w) throw new Error('Worker não encontrado');

    const recipient = (data.recipient || '').trim();
    const now = new Date().toISOString();

    try {
      const res = await fetch(w.worker_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${w.worker_api_key}`,
        },
        body: JSON.stringify({
          mode: recipient ? 'send-test' : 'ping',
          to: recipient || undefined,
          subject: 'Teste de conexão — Central MEI',
          html: '<p>Este é um envio de teste do painel Central MEI Digital.</p>',
          text: 'Este é um envio de teste do painel Central MEI Digital.',
        }),
      });
      const bodyText = await res.text();
      const ok = res.ok;
      const message = ok ? (recipient ? 'Envio de teste enfileirado com sucesso' : 'Worker respondeu com sucesso') : `HTTP ${res.status}: ${bodyText.slice(0, 300)}`;
      await (context.supabase as any)
        .from('email_workers')
        .update({ last_test_at: now, last_test_ok: ok, last_test_message: message })
        .eq('id', data.id);
      return { ok, message };
    } catch (e) {
      const message = (e as Error).message;
      await (context.supabase as any)
        .from('email_workers')
        .update({ last_test_at: now, last_test_ok: false, last_test_message: message })
        .eq('id', data.id);
      return { ok: false, message };
    }
  });

export const getEmailWorkersSummary = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await (context.supabase as any)
      .from('email_workers')
      .select('is_active, hourly_limit, daily_limit, monthly_limit');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const active = rows.filter(r => r.is_active);
    return {
      total: rows.length,
      active: active.length,
      hourly: 100 + active.reduce((s, r) => s + (r.hourly_limit ?? 0), 0),
      daily: 2000 + active.reduce((s, r) => s + (r.daily_limit ?? 0), 0),
      monthly: 50000 + active.reduce((s, r) => s + (r.monthly_limit ?? 0), 0),
    };
  });
