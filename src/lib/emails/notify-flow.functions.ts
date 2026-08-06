import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', context.userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!data) throw new Error('Forbidden');
}

export type NotifyFlowRow = {
  id: string;
  createdAt: string;
  status: string;
  amount: number | null;
  email: string | null;
  empresa: string | null;
  cnpj: string | null;
  guiaSentAt: string | null;
  firstReminderAt: string | null;
  paidEmailAt: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  nextSendAt: string | null;
  finished: boolean;
  /** true quando existe uma guia mais recente (ou pagamento) para o mesmo destinatário */
  superseded: boolean;
};

export type NotifyFlowEvent = {
  id: string;
  createdAt: string;
  sentAt: string | null;
  to: string;
  subject: string;
  status: string;
  attempts: number;
  error: string | null;
  tipo: string;
  orderId: string | null;
  empresa: string | null;
  cnpj: string | null;
};

export type NotifyFlowStats = {
  pedidosHoje: number;
  guiaEnviada: number;
  cobrancasEnviadas: number;
  pagos: number;
  aguardando: number;
  semEmail: number;
  emCobranca: number;
  duplicadas: number;
  janelaAberta: boolean;
  horaAtual: number;
};

/** Acompanhamento do fluxo automático de e-mails (somente pedidos do dia). */
export const listNotifyFlow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { day?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { CADENCE, spParts, spTodayStartISO, recipientKey, pickActiveOrders } = await import(
      '@/lib/emails/order-emails.server'
    );

    const now = new Date();
    const parts = spParts(now);
    const day = data.day || parts.day;
    const start = day === parts.day ? spTodayStartISO(now) : new Date(`${day}T00:00:00-03:00`).toISOString();
    const end = new Date(`${day}T23:59:59-03:00`).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, created_at, status, amount, customer_email, customer_name, customer_document, reference_name, reference_cnpj, email_pix_sent_at, email_reminder_sent_at, email_paid_sent_at, email_recovery_count, email_recovery_last_at',
      )
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const janelaAberta = parts.hour < CADENCE.stopHour;

    const all = ((rows as any[]) ?? []);
    const paidKeys = new Set<string>();
    for (const r of all) {
      if (r.status === 'paid') {
        const k = recipientKey(r);
        if (k) paidKeys.add(k);
      }
    }
    const unpaid = all.filter((r) => r.status !== 'paid');
    const { active } = pickActiveOrders(unpaid as any[], paidKeys, recipientKey as any);
    const activeIds = new Set(active.map((r: any) => r.id));

    const list: NotifyFlowRow[] = all.map((r) => {
      const paid = r.status === 'paid';
      const superseded = !paid && !activeIds.has(r.id);
      const last = r.email_recovery_last_at || r.email_reminder_sent_at || null;
      let nextSendAt: string | null = null;
      if (!paid && !superseded && janelaAberta) {
        const base = last
          ? new Date(last).getTime() + CADENCE.repeatMinutes * 60 * 1000
          : new Date(r.created_at).getTime() + CADENCE.firstReminderMinutes * 60 * 1000;
        nextSendAt = new Date(base).toISOString();
      }
      return {
        id: r.id,
        createdAt: r.created_at,
        status: r.status,
        amount: r.amount != null ? Number(r.amount) : null,
        email: r.customer_email ?? null,
        empresa: r.reference_name || r.customer_name || null,
        cnpj: r.reference_cnpj || r.customer_document || null,
        guiaSentAt: r.email_pix_sent_at ?? null,
        firstReminderAt: r.email_reminder_sent_at ?? null,
        paidEmailAt: r.email_paid_sent_at ?? null,
        reminderCount: r.email_recovery_count ?? 0,
        lastReminderAt: r.email_recovery_last_at ?? null,
        nextSendAt,
        finished: paid || superseded || !janelaAberta,
        superseded,
      };
    });

    const stats: NotifyFlowStats = {
      pedidosHoje: list.length,
      guiaEnviada: list.filter((o) => o.guiaSentAt).length,
      cobrancasEnviadas: list.reduce((acc, o) => acc + o.reminderCount, 0),
      pagos: list.filter((o) => o.status === 'paid').length,
      aguardando: list.filter((o) => o.status !== 'paid').length,
      semEmail: list.filter((o) => !o.email).length,
      emCobranca: list.filter((o) => o.status !== 'paid' && !o.superseded).length,
      duplicadas: list.filter((o) => o.superseded).length,
      janelaAberta,
      horaAtual: parts.hour,
    };

    // ---- Detalhamento: cada e-mail do fluxo automático enviado no dia ----
    const byOrderId = new Map(list.map((o) => [o.id, o]));
    const byEmail = new Map<string, NotifyFlowRow>();
    for (const o of list) if (o.email) byEmail.set(o.email.toLowerCase(), o);

    const { data: qrows } = await supabaseAdmin
      .from('email_send_queue')
      .select('id, created_at, updated_at, to_email, subject, status, attempts, last_error, idempotency_key')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
      .limit(1000);

    const tipoFromKey = (key: string, subject: string): string | null => {
      const k = (key || '').toLowerCase();
      if (k.startsWith('pix-gerado-')) return 'Guia gerada (PIX criado)';
      if (k.startsWith('pagamento-confirmado-')) return 'Pagamento confirmado';
      if (k.startsWith('pix-pendente-') || k.startsWith('recuperacao-') || k.startsWith('cadencia-'))
        return 'Cobrança / recuperação';
      if (k.includes('oferta-desconto')) return 'Oferta com desconto';
      if (k.startsWith('campanha-') || k.startsWith('manual-') || k.startsWith('campaign-'))
        return 'Modelo de mensagem (campanhas)';
      if (k.startsWith('teste-') || k.startsWith('test-')) return 'Teste';
      const s = (subject || '').toLowerCase();
      if (s.includes('confirmad') || s.includes('emitido')) return 'Pagamento confirmado';
      if (s.includes('desconto')) return 'Oferta com desconto';
      if (s.includes('guia') || s.includes('pix')) return 'Guia gerada (PIX criado)';
      if (s.includes('pendente') || s.includes('regulariz') || s.includes('lembrete'))
        return 'Cobrança / recuperação';
      return 'Modelo de mensagem (campanhas)';
    };


    const orderIdFromKey = (key: string): string | null => {
      const m = (key || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      return m ? m[0] : null;
    };

    const auditedEvents: NotifyFlowEvent[] = ((qrows as any[]) ?? [])
      .map((r) => {
        const tipo = tipoFromKey(r.idempotency_key ?? '', r.subject ?? '');
        if (!tipo) return null;
        const orderId = orderIdFromKey(r.idempotency_key ?? '');
        const ord =
          (orderId ? byOrderId.get(orderId) : undefined) ??
          byEmail.get(String(r.to_email ?? '').toLowerCase());
        return {
          id: r.id,
          createdAt: r.created_at,
          sentAt: r.status === 'sent' ? r.updated_at : null,
          to: r.to_email,
          subject: r.subject,
          status: r.status,
          attempts: r.attempts ?? 0,
          error: r.last_error ?? null,
          tipo,
          orderId: orderId ?? ord?.id ?? null,
          empresa: ord?.empresa ?? null,
          cnpj: ord?.cnpj ?? null,
        } as NotifyFlowEvent;
      })
      .filter(Boolean) as NotifyFlowEvent[];

    // Recupera o histórico anterior à implantação da auditoria. Os horários
    // abaixo são os marcadores reais gravados no pedido após cada envio.
    const auditedKinds = new Set(
      auditedEvents.map((event) => `${event.orderId ?? ''}:${event.tipo}`),
    );
    const recoveredEvents: NotifyFlowEvent[] = [];
    const addRecovered = (
      order: NotifyFlowRow,
      sentAt: string | null,
      tipo: string,
      subject: string,
      suffix: string,
    ) => {
      if (!sentAt || auditedKinds.has(`${order.id}:${tipo}`)) return;
      recoveredEvents.push({
        id: `recovered-${order.id}-${suffix}`,
        createdAt: sentAt,
        sentAt,
        to: order.email ?? '—',
        subject,
        status: 'sent',
        attempts: 1,
        error: null,
        tipo,
        orderId: order.id,
        empresa: order.empresa,
        cnpj: order.cnpj,
      });
    };
    for (const order of list) {
      addRecovered(order, order.guiaSentAt, 'Guia gerada (PIX criado)', 'Guia de pagamento PIX gerada', 'pix');
      addRecovered(order, order.firstReminderAt, 'Cobrança / recuperação', 'Pagamento PIX pendente', 'first-reminder');
      if (order.lastReminderAt && order.lastReminderAt !== order.firstReminderAt) {
        addRecovered(order, order.lastReminderAt, 'Cobrança / recuperação', 'Pagamento PIX pendente', 'last-reminder');
      }
      addRecovered(order, order.paidEmailAt, 'Pagamento confirmado', 'Pagamento confirmado', 'paid');
    }
    const events = [...auditedEvents, ...recoveredEvents].sort(
      (a, b) => new Date(b.sentAt ?? b.createdAt).getTime() - new Date(a.sentAt ?? a.createdAt).getTime(),
    );

    return { orders: list, stats, day, events };
  });

/** Régua desativada: o produto envia somente o e-mail principal da empresa. */
export const runNotifyFlowNow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return { skipped: true, reason: 'follow_up_emails_disabled' };
  });
