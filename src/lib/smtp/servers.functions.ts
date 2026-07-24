// Server functions to manage SMTP server configurations (admin only).
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

export type SmtpServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password_masked: string;
  from_email: string;
  from_name: string | null;
  encryption: string;
  hourly_limit: number;
  daily_limit: number;
  monthly_limit: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mask(v: string): string {
  if (!v) return '';
  if (v.length <= 6) return '•'.repeat(v.length);
  return `${v.slice(0, 2)}${'•'.repeat(8)}${v.slice(-2)}`;
}

export const listSmtpServers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin
      .from('smtp_servers')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      password_masked: mask(s.password),
      from_email: s.from_email,
      from_name: s.from_name,
      encryption: s.encryption,
      hourly_limit: s.hourly_limit,
      daily_limit: s.daily_limit,
      monthly_limit: s.monthly_limit,
      is_active: s.is_active,
      notes: s.notes,
      created_at: s.created_at,
      updated_at: s.updated_at,
    })) as SmtpServer[];
  });

export const upsertSmtpServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(120),
        host: z.string().min(3).max(200),
        port: z.number().int().min(1).max(65535),
        username: z.string().min(1).max(200),
        password: z.string().min(1).max(500).optional(),
        from_email: z.string().email().max(200),
        from_name: z.string().max(120).optional().or(z.literal('')),
        encryption: z.enum(['none', 'tls', 'ssl']).default('tls'),
        hourly_limit: z.number().int().min(0).max(1000000),
        daily_limit: z.number().int().min(0).max(10000000),
        monthly_limit: z.number().int().min(0).max(100000000),
        notes: z.string().max(500).optional().or(z.literal('')),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const base: any = {
      name: data.name,
      host: data.host,
      port: data.port,
      username: data.username,
      from_email: data.from_email,
      from_name: data.from_name && data.from_name.length > 0 ? data.from_name : null,
      encryption: data.encryption,
      hourly_limit: data.hourly_limit,
      daily_limit: data.daily_limit,
      monthly_limit: data.monthly_limit,
      notes: data.notes && data.notes.length > 0 ? data.notes : null,
    };

    if (data.id) {
      if (data.password) base.password = data.password;
      const { error } = await supabaseAdmin.from('smtp_servers').update(base).eq('id', data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    if (!data.password) throw new Error('senha é obrigatória ao cadastrar');
    const { data: inserted, error } = await supabaseAdmin
      .from('smtp_servers')
      .insert({ ...base, password: data.password, is_active: false })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

export const activateSmtpServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error: e1 } = await supabaseAdmin
      .from('smtp_servers')
      .update({ is_active: false })
      .neq('id', data.id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from('smtp_servers')
      .update({ is_active: true })
      .eq('id', data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const deleteSmtpServer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('smtp_servers').delete().eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
