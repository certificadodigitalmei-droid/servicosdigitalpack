import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { randomBytes } from 'node:crypto';

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

export type WaProfile = 'ultra' | 'safe' | 'moderate' | 'fast';

export const PROFILES: Record<WaProfile, { min_delay_ms: number; max_delay_ms: number; batch_size: number; long_pause_ms: number; daily_limit: number; label: string; hourly: number }> = {
  ultra: { min_delay_ms: 90000, max_delay_ms: 180000, batch_size: 15, long_pause_ms: 900000, daily_limit: 120, label: 'Ultra Seguro', hourly: 20 },
  safe: { min_delay_ms: 45000, max_delay_ms: 120000, batch_size: 20, long_pause_ms: 600000, daily_limit: 200, label: 'Seguro (recomendado)', hourly: 40 },
  moderate: { min_delay_ms: 25000, max_delay_ms: 60000, batch_size: 30, long_pause_ms: 480000, daily_limit: 400, label: 'Moderado', hourly: 80 },
  fast: { min_delay_ms: 15000, max_delay_ms: 30000, batch_size: 40, long_pause_ms: 300000, daily_limit: 600, label: 'Rápido (mais risco)', hourly: 150 },
};

export const getWaConfig = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let { data } = await supabaseAdmin
      .from('whatsapp_batch_config')
      .select('*')
      .eq('owner_user_id', context.userId)
      .maybeSingle();
    if (!data) {
      const token = randomBytes(24).toString('hex');
      const p = PROFILES.safe;
      const ins = await supabaseAdmin.from('whatsapp_batch_config').insert({
        owner_user_id: context.userId,
        extension_token: token,
        profile: 'safe',
        min_delay_ms: p.min_delay_ms,
        max_delay_ms: p.max_delay_ms,
        batch_size: p.batch_size,
        long_pause_ms: p.long_pause_ms,
        daily_limit: p.daily_limit,
      }).select('*').single();
      data = ins.data as any;
    }
    return data;
  });

export const setWaProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ profile: z.enum(['ultra', 'safe', 'moderate', 'fast']), daily_limit: z.number().int().min(10).max(2000).optional(), running: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const p = PROFILES[data.profile];
    const patch: any = {
      profile: data.profile,
      min_delay_ms: p.min_delay_ms,
      max_delay_ms: p.max_delay_ms,
      batch_size: p.batch_size,
      long_pause_ms: p.long_pause_ms,
      daily_limit: data.daily_limit ?? p.daily_limit,
    };
    if (typeof data.running === 'boolean') patch.running = data.running;
    const { error } = await supabaseAdmin.from('whatsapp_batch_config')
      .update(patch).eq('owner_user_id', context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateWaToken = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const token = randomBytes(24).toString('hex');
    const { error } = await supabaseAdmin.from('whatsapp_batch_config')
      .update({ extension_token: token }).eq('owner_user_id', context.userId);
    if (error) throw new Error(error.message);
    return { token };
  });

export const enqueueWaMessages = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      batch_label: z.string().max(80).optional(),
      items: z.array(z.object({
        phone: z.string().min(8),
        message: z.string().min(1).max(4000),
        company_name: z.string().optional().nullable(),
        cnpj: z.string().optional().nullable(),
        company_link_id: z.string().uuid().optional().nullable(),
      })).min(1).max(2000),
      skip_recent_hours: z.number().int().min(0).max(720).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const skipH = data.skip_recent_hours ?? 24;
    let existing = new Set<string>();
    const phones = Array.from(new Set(data.items.map((i) => i.phone.replace(/\D/g, ''))));
    // 1) sempre pular quem JÁ FOI ENVIADO alguma vez (status='sent'), independente da janela
    for (let i = 0; i < phones.length; i += 500) {
      const chunk = phones.slice(i, i + 500);
      const { data: rows } = await supabaseAdmin
        .from('whatsapp_queue')
        .select('phone')
        .eq('owner_user_id', context.userId)
        .eq('status', 'sent')
        .in('phone', chunk);
      for (const r of (rows ?? []) as any[]) existing.add(String(r.phone));
    }
    // 2) pular também quem foi enfileirado recentemente (pending/sending) na janela configurada
    if (skipH > 0) {
      const since = new Date(Date.now() - skipH * 3600_000).toISOString();
      for (let i = 0; i < phones.length; i += 500) {
        const chunk = phones.slice(i, i + 500);
        const { data: rows } = await supabaseAdmin
          .from('whatsapp_queue')
          .select('phone')
          .eq('owner_user_id', context.userId)
          .in('status', ['pending', 'sending'])
          .in('phone', chunk)
          .gte('created_at', since);
        for (const r of (rows ?? []) as any[]) existing.add(String(r.phone));
      }
    }
    const rows = data.items
      .map((i) => ({ ...i, phone: i.phone.replace(/\D/g, '') }))
      .filter((i) => i.phone.length >= 10 && !existing.has(i.phone))
      .map((i) => ({
        owner_user_id: context.userId,
        phone: i.phone,
        message: i.message,
        company_name: i.company_name ?? null,
        cnpj: i.cnpj ?? null,
        company_link_id: i.company_link_id ?? null,
        batch_label: data.batch_label ?? null,
        status: 'pending',
      }));
    if (rows.length === 0) return { inserted: 0, skipped: data.items.length };
    // insert in chunks
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error, count } = await supabaseAdmin.from('whatsapp_queue').insert(chunk, { count: 'exact' });
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }
    return { inserted, skipped: data.items.length - inserted };
  });

export const listWaQueue = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const [pendingRes, sentRes, failedRes, recentRes] = await Promise.all([
      supabaseAdmin.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('owner_user_id', context.userId).eq('status', 'pending'),
      supabaseAdmin.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('owner_user_id', context.userId).eq('status', 'sent'),
      supabaseAdmin.from('whatsapp_queue').select('id', { count: 'exact', head: true }).eq('owner_user_id', context.userId).eq('status', 'failed'),
      supabaseAdmin.from('whatsapp_queue').select('id,phone,company_name,cnpj,status,sent_at,error_message,created_at').eq('owner_user_id', context.userId).order('created_at', { ascending: false }).limit(100),
    ]);
    return {
      pending: pendingRes.count ?? 0,
      sent: sentRes.count ?? 0,
      failed: failedRes.count ?? 0,
      recent: recentRes.data ?? [],
    };
  });

export const clearWaQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(['pending', 'all']) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let q = supabaseAdmin.from('whatsapp_queue').delete().eq('owner_user_id', context.userId);
    if (data.scope === 'pending') q = q.eq('status', 'pending');
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
