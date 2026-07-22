import { createServerFn } from '@tanstack/react-start';
import { listEmailLogs } from '@lovable.dev/email-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type EmailStatsResult = {
  ok: boolean;
  message?: string;
  historyStartsAt?: string;
  lastHour: {
    sent: number;
    rejected: number;
    bounced: number;
    complaint: number;
    unsubscribed: number;
    suppressed: number;
    rateLimited: number;
    total: number;
  };
  last24h: {
    sent: number;
    rejected: number;
    bounced: number;
    complaint: number;
    unsubscribed: number;
    suppressed: number;
    rateLimited: number;
    total: number;
  };
};

function empty() {
  return { sent: 0, rejected: 0, bounced: 0, complaint: 0, unsubscribed: 0, suppressed: 0, rateLimited: 0, total: 0 };
}

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

async function fetchWindow(apiKey: string, sinceIso: string) {
  const bucket = empty();
  let cursor: string | undefined;
  let pages = 0;
  let historyStartsAt: string | undefined;
  do {
    const res: any = await listEmailLogs(
      { since: sinceIso, limit: 100, cursor } as any,
      { apiKey },
    );
    historyStartsAt = res.history_starts_at ?? historyStartsAt;
    for (const ev of res.data as Array<{ event_type: string }>) {
      bucket.total++;
      switch (ev.event_type) {
        case 'sent': bucket.sent++; break;
        case 'rejected': bucket.rejected++; break;
        case 'bounced': bucket.bounced++; break;
        case 'complaint': bucket.complaint++; break;
        case 'unsubscribed': bucket.unsubscribed++; break;
        case 'suppressed': bucket.suppressed++; break;
        case 'rate_limited': bucket.rateLimited++; break;
      }
    }
    cursor = res.pagination?.has_more ? res.pagination.next_cursor : undefined;
    pages++;
  } while (cursor && pages < 20);
  return { bucket, historyStartsAt };
}

export const getEmailStats = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailStatsResult> => {
    await assertAdmin(context);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, message: 'LOVABLE_API_KEY não configurada', lastHour: empty(), last24h: empty() };
    }
    const now = Date.now();
    const hourIso = new Date(now - 60 * 60 * 1000).toISOString();
    const dayIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    try {
      const [hour, day] = await Promise.all([
        fetchWindow(apiKey, hourIso),
        fetchWindow(apiKey, dayIso),
      ]);
      return {
        ok: true,
        historyStartsAt: hour.historyStartsAt ?? day.historyStartsAt,
        lastHour: hour.bucket,
        last24h: day.bucket,
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Erro ao consultar logs', lastHour: empty(), last24h: empty() };
    }
  });
