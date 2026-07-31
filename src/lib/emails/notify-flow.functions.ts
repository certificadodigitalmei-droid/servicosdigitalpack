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
};

export type NotifyFlowStats = {
  pedidosHoje: number;
  guiaEnviada: number;
  cobrancasEnviadas: number;
  pagos: number;
  aguardando: number;
  semEmail: number;
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
    const { CADENCE, spParts, spTodayStartISO } = await import('@/lib/emails/order-emails.server');

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

    const list: NotifyFlowRow[] = ((rows as any[]) ?? []).map((r) => {
      const paid = r.status === 'paid';
      const last = r.email_recovery_last_at || r.email_reminder_sent_at || null;
      let nextSendAt: string | null = null;
      if (!paid) {
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
        finished: paid || !janelaAberta,
      };
    });

    const stats: NotifyFlowStats = {
      pedidosHoje: list.length,
      guiaEnviada: list.filter((o) => o.guiaSentAt).length,
      cobrancasEnviadas: list.reduce((acc, o) => acc + o.reminderCount, 0),
      pagos: list.filter((o) => o.status === 'paid').length,
      aguardando: list.filter((o) => o.status !== 'paid').length,
      semEmail: list.filter((o) => !o.email).length,
      janelaAberta,
      horaAtual: parts.hour,
    };

    return { orders: list, stats, day };
  });

/** Executa a régua agora (mesma lógica do robô agendado). */
export const runNotifyFlowNow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runNotificationCadence } = await import('@/lib/emails/order-emails.server');
    return await runNotificationCadence();
  });
