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

export type RecoveryOrder = {
  id: string;
  createdAt: string;
  status: string;
  amount: number | null;
  email: string | null;
  empresa: string | null;
  cnpj: string | null;
  recoveryCount: number;
  lastContactAt: string | null;
  nextSendAt: string | null;
};

/** Lista os pedidos pendentes que estão na régua de recuperação. */
export const listRecoveryOrders = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const days = data.days ?? 15;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const floor = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from('orders')
      .select(
        'id, created_at, status, amount, customer_email, reference_name, customer_name, reference_cnpj, customer_document, email_recovery_count, email_recovery_last_at, email_reminder_sent_at',
      )
      .in('status', ['pending', 'awaiting_payment'])
      .gte('created_at', floor)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    const list: RecoveryOrder[] = ((rows as any[]) ?? []).map((r) => {
      const last = r.email_recovery_last_at || r.email_reminder_sent_at || r.created_at;
      const next = last ? new Date(new Date(last).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
      return {
        id: r.id,
        createdAt: r.created_at,
        status: r.status,
        amount: r.amount != null ? Number(r.amount) : null,
        email: r.customer_email ?? null,
        empresa: r.reference_name || r.customer_name || null,
        cnpj: r.reference_cnpj || r.customer_document || null,
        recoveryCount: r.email_recovery_count ?? 0,
        lastContactAt: last ?? null,
        nextSendAt: next,
      };
    });

    const now = Date.now();
    return {
      orders: list,
      stats: {
        total: list.length,
        semEmail: list.filter((o) => !o.email).length,
        prontos: list.filter((o) => o.email && o.nextSendAt && new Date(o.nextSendAt).getTime() <= now).length,
        emailsEnviados: list.reduce((acc, o) => acc + o.recoveryCount, 0),
      },
    };
  });

/** Recuperação desativada: o produto envia somente o e-mail principal. */
export const runRecoveryNow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return { skipped: true, reason: 'follow_up_emails_disabled' };
  });

/** Renderiza um modelo de e-mail em HTML para pré-visualização no painel. */
export const previewEmailTemplate = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const React = await import('react');
    const { render } = await import('@react-email/render');
    const { TEMPLATES } = await import('@/lib/email-templates/registry');

    const entry = TEMPLATES[data.name];
    if (!entry) throw new Error('Modelo não encontrado');

    const sample = {
      empresa: 'MEI EXEMPLO COMERCIO LTDA',
      cnpj: '12.345.678/0001-90',
      link: 'https://digitalcertificaa1mei.online/c/exemplo',
      pixCode: '00020126850014BR.GOV.BCB.PIX2563exemplo-de-codigo-pix-copia-e-cola5204000053039865802BR6009SAO PAULO62070503***6304ABCD',
      validade: '12 meses',
      ...(entry.previewData ?? {}),
    };

    const html = await render(React.createElement(entry.component, sample));
    const subject = typeof entry.subject === 'function' ? entry.subject(sample) : entry.subject;
    return { html, subject, displayName: entry.displayName ?? data.name };
  });
