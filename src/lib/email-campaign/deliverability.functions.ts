import { createServerFn } from '@tanstack/react-start';
import { listEmailLogs } from '@lovable.dev/email-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type DeliverabilityBucket = {
  sent: number;
  rejected: number;
  bounced: number;
  complaint: number;
  unsubscribed: number;
  suppressed: number;
  rateLimited: number;
  total: number;
};

export type DeliverabilityEvent = {
  id: string;
  eventType: string;
  recipient: string;
  status?: string;
  subject?: string;
  createdAt: string;
};

export type DeliverabilityResult = {
  ok: boolean;
  message?: string;
  fetchedAt: string;
  historyStartsAt?: string;
  windows: {
    lastHour: DeliverabilityBucket;
    last24h: DeliverabilityBucket;
    last7d: DeliverabilityBucket;
  };
  timeline: { hour: string; sent: number; bounced: number; complaint: number; suppressed: number }[];
  recent: DeliverabilityEvent[];
  topBouncedDomains: { domain: string; count: number }[];
};

function empty(): DeliverabilityBucket {
  return { sent: 0, rejected: 0, bounced: 0, complaint: 0, unsubscribed: 0, suppressed: 0, rateLimited: 0, total: 0 };
}

function add(bucket: DeliverabilityBucket, eventType: string) {
  bucket.total++;
  switch (eventType) {
    case 'sent': bucket.sent++; break;
    case 'rejected': bucket.rejected++; break;
    case 'bounced': bucket.bounced++; break;
    case 'complaint':
    case 'complained': bucket.complaint++; break;
    case 'unsubscribed': bucket.unsubscribed++; break;
    case 'suppressed': bucket.suppressed++; break;
    case 'rate_limited': bucket.rateLimited++; break;
  }
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

export const getDeliverability = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeliverabilityResult> => {
    await assertAdmin(context);
    const fetchedAt = new Date().toISOString();
    const apiKey = process.env['LOVABLE_API_KEY'];
    const base: DeliverabilityResult = {
      ok: false,
      fetchedAt,
      windows: { lastHour: empty(), last24h: empty(), last7d: empty() },
      timeline: [],
      recent: [],
      topBouncedDomains: [],
    };
    if (!apiKey) return { ...base, message: 'LOVABLE_API_KEY não configurada' };

    const now = Date.now();
    const sinceIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const all: any[] = [];
      let cursor: string | undefined;
      let pages = 0;
      let historyStartsAt: string | undefined;
      do {
        const res: any = await listEmailLogs({ since: sinceIso, limit: 100, cursor } as any, { apiKey });
        historyStartsAt = res.history_starts_at ?? historyStartsAt;
        all.push(...(res.data ?? []));
        cursor = res.pagination?.has_more ? res.pagination.next_cursor : undefined;
        pages++;
      } while (cursor && pages < 40);

      const lastHour = empty();
      const last24h = empty();
      const last7d = empty();
      const hourMap = new Map<string, { sent: number; bounced: number; complaint: number; suppressed: number }>();
      const bouncedDomains = new Map<string, number>();

      for (const ev of all) {
        const type: string = ev.event_type;
        const ts = new Date(ev.created_at ?? ev.timestamp ?? fetchedAt).getTime();
        add(last7d, type);
        if (now - ts <= 24 * 60 * 60 * 1000) add(last24h, type);
        if (now - ts <= 60 * 60 * 1000) add(lastHour, type);

        if (now - ts <= 24 * 60 * 60 * 1000) {
          const key = new Date(ts).toISOString().slice(0, 13);
          const slot = hourMap.get(key) ?? { sent: 0, bounced: 0, complaint: 0, suppressed: 0 };
          if (type === 'sent') slot.sent++;
          else if (type === 'bounced') slot.bounced++;
          else if (type === 'complaint' || type === 'complained') slot.complaint++;
          else if (type === 'suppressed') slot.suppressed++;
          hourMap.set(key, slot);
        }

        if (type === 'bounced') {
          const domain = String(ev.recipient ?? '').split('@')[1]?.toLowerCase();
          if (domain) bouncedDomains.set(domain, (bouncedDomains.get(domain) ?? 0) + 1);
        }
      }

      const timeline = [...hourMap.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([hour, v]) => ({ hour, ...v }));

      const recent: DeliverabilityEvent[] = all
        .slice()
        .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        .slice(0, 40)
        .map((ev, i) => ({
          id: String(ev.id ?? `${ev.created_at}-${i}`),
          eventType: String(ev.event_type ?? ''),
          recipient: String(ev.recipient ?? ''),
          status: ev.status ? String(ev.status) : undefined,
          subject: ev.subject ? String(ev.subject) : undefined,
          createdAt: String(ev.created_at ?? fetchedAt),
        }));

      const topBouncedDomains = [...bouncedDomains.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([domain, count]) => ({ domain, count }));

      return {
        ok: true,
        fetchedAt,
        historyStartsAt,
        windows: { lastHour, last24h, last7d },
        timeline,
        recent,
        topBouncedDomains,
      };
    } catch (e: any) {
      return { ...base, message: e?.message || 'Erro ao consultar logs de e-mail' };
    }
  });
