import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

/**
 * Fonte única de verdade das métricas de e-mail do painel.
 * Todas as abas (Dashboard, Links Gerados, E-mails Enviados) leem daqui,
 * sempre a partir da tabela real `email_send_queue`.
 *
 * Convenções:
 * - "enviado" = status 'sent'; a data considerada é `updated_at` (momento da confirmação).
 * - Recortes de dia usam o fuso America/Sao_Paulo.
 */

export const HOURLY_LIMIT = 100;

export function brtStartOfTodayISO(now = new Date()): string {
  // Data de hoje no fuso de São Paulo -> meia-noite local convertida para UTC
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // BRT = UTC-3 (sem horário de verão no Brasil desde 2019)
  return new Date(`${parts}T00:00:00-03:00`).toISOString();
}

const rangeSchema = z
  .object({
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  })
  .optional();

export type EmailMetrics = {
  periodo: number;
  hoje: number;
  ultimaHora: number;
  fila: number;
  falhas: number;
  suprimidos: number;
  total: number;
  limiteHora: number;
  saldoHora: number;
  ultimoEnvioAt: string | null;
  proximoRetryAt: string | null;
};

async function countMetrics(supabase: any, from?: string | null, to?: string | null): Promise<EmailMetrics> {
  const nowISO = new Date().toISOString();
  const hourAgoISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const todayISO = brtStartOfTodayISO();

  const sentCount = (gte?: string | null, lte?: string | null) => {
    let q = supabase
      .from('email_send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent');
    if (gte) q = q.gte('updated_at', gte);
    if (lte) q = q.lte('updated_at', lte);
    return q;
  };

  const [periodoRes, hojeRes, horaRes, totalRes, filaRes, falhasRes, supRes, ultimoRes, retryRes] =
    await Promise.all([
      sentCount(from ?? null, to ?? null),
      sentCount(todayISO, null),
      sentCount(hourAgoISO, nowISO),
      sentCount(null, null),
      supabase
        .from('email_send_queue')
        .select('id', { count: 'exact', head: true })
        .in('status', ['queued', 'pending', 'sending']),
      supabase.from('email_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('email_send_queue').select('id', { count: 'exact', head: true }).eq('status', 'suppressed'),
      supabase
        .from('email_send_queue')
        .select('updated_at')
        .eq('status', 'sent')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('email_send_queue')
        .select('next_retry_at')
        .not('next_retry_at', 'is', null)
        .order('next_retry_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const ultimaHora = horaRes.count ?? 0;

  return {
    periodo: periodoRes.count ?? 0,
    hoje: hojeRes.count ?? 0,
    ultimaHora,
    fila: filaRes.count ?? 0,
    falhas: falhasRes.count ?? 0,
    suprimidos: supRes.count ?? 0,
    total: totalRes.count ?? 0,
    limiteHora: HOURLY_LIMIT,
    saldoHora: Math.max(0, HOURLY_LIMIT - ultimaHora),
    ultimoEnvioAt: (ultimoRes.data as any)?.updated_at ?? null,
    proximoRetryAt: (retryRes.data as any)?.next_retry_at ?? null,
  };
}

export const getEmailMetrics = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data) ?? {})
  .handler(async ({ context, data }): Promise<EmailMetrics> => {
    return countMetrics(context.supabase, data?.from ?? null, data?.to ?? null);
  });

export type SentEmailRow = {
  id: string;
  sentAt: string;
  to: string;
  subject: string;
  messageId: string | null;
};

export const listSentEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        search: z.string().nullable().optional(),
        limit: z.number().min(1).max(1000).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }): Promise<SentEmailRow[]> => {
    let q = context.supabase
      .from('email_send_queue')
      .select('id, to_email, subject, updated_at, sent_message_id')
      .eq('status', 'sent')
      .order('updated_at', { ascending: false })
      .limit(data.limit ?? 500);

    if (data.from) q = q.gte('updated_at', data.from);
    if (data.to) q = q.lte('updated_at', data.to);
    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(`to_email.ilike.%${s}%,subject.ilike.%${s}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return ((rows as any[]) ?? []).map((r) => ({
      id: r.id,
      sentAt: r.updated_at,
      to: r.to_email,
      subject: r.subject,
      messageId: r.sent_message_id ?? null,
    }));
  });
