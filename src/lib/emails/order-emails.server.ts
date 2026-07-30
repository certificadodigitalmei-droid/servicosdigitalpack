// Server-only: dispara os e-mails transacionais do fluxo de pagamento.
// Nunca importar em componentes de cliente.
import { sendTemplateEmail } from '@/lib/email-templates/send-email'
import { PUBLIC_BASE_URL } from '@/lib/public-base-url'

const VALIDADE_PADRAO = '12 meses'

function formatCnpj(raw?: string | null): string | undefined {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length !== 14) return raw || undefined
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

type OrderRow = {
  id: string
  customer_email: string | null
  customer_name: string | null
  customer_document: string | null
  reference_cnpj: string | null
  reference_name: string | null
  public_link_id: string | null
  pix_code: string | null
}

async function resolveContext(order: OrderRow) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  let link: string | undefined
  if (order.public_link_id) {
    const { data } = await supabaseAdmin
      .from('company_links')
      .select('public_token')
      .eq('id', order.public_link_id)
      .maybeSingle()
    if (data?.public_token) link = `${PUBLIC_BASE_URL}/c/${data.public_token}`
  }

  return {
    empresa: order.reference_name || order.customer_name || undefined,
    cnpj: formatCnpj(order.reference_cnpj || order.customer_document),
    link,
  }
}

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, customer_email, customer_name, customer_document, reference_cnpj, reference_name, public_link_id, pix_code',
    )
    .eq('id', orderId)
    .maybeSingle()
  return (data as OrderRow) ?? null
}

async function markEmail(orderId: string, column: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  await supabaseAdmin
    .from('orders')
    .update({ [column]: new Date().toISOString() } as any)
    .eq('id', orderId)
}

/** E-mail imediato: "sua guia de pagamento está disponível". */
export async function sendPixCreatedEmail(orderId: string): Promise<void> {
  try {
    const order = await loadOrder(orderId)
    if (!order?.customer_email) return
    const ctx = await resolveContext(order)
    await sendTemplateEmail('pix-gerado', order.customer_email, {
      idempotencyKey: `pix-gerado-${order.id}`,
      templateData: { ...ctx, pixCode: order.pix_code || undefined },
    })
    await markEmail(order.id, 'email_pix_sent_at')
  } catch (err) {
    console.error('[order-emails] falha ao enviar e-mail de PIX gerado', err)
  }
}

/** E-mail de confirmação: certificado emitido e vinculado. */
export async function sendPaidEmail(orderId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const order = await loadOrder(orderId)
    if (!order?.customer_email) return

    // Evita duplicidade quando webhook e reconciliação disparam juntos.
    const { data: flag } = await supabaseAdmin
      .from('orders')
      .select('email_paid_sent_at')
      .eq('id', orderId)
      .maybeSingle()
    if ((flag as any)?.email_paid_sent_at) return

    const ctx = await resolveContext(order)
    await sendTemplateEmail('pagamento-confirmado', order.customer_email, {
      idempotencyKey: `pagamento-confirmado-${order.id}`,
      templateData: { ...ctx, validade: VALIDADE_PADRAO },
    })
    await markEmail(order.id, 'email_paid_sent_at')
  } catch (err) {
    console.error('[order-emails] falha ao enviar e-mail de pagamento confirmado', err)
  }
}

/**
 * Varredura de cobrança: pedidos com PIX gerado há mais de N minutos,
 * ainda não pagos e sem lembrete enviado.
 */
export async function sendPendingReminders(minutes = 15): Promise<{ sent: number; checked: number }> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString()
  const floor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: pending } = await supabaseAdmin
    .from('orders')
    .select(
      'id, customer_email, customer_name, customer_document, reference_cnpj, reference_name, public_link_id, pix_code',
    )
    .eq('status', 'awaiting_payment')
    .is('email_reminder_sent_at', null)
    .lte('created_at', cutoff)
    .gte('created_at', floor)
    .limit(50)

  const rows = (pending as OrderRow[]) ?? []
  let sent = 0
  for (const order of rows) {
    if (!order.customer_email) {
      await markEmail(order.id, 'email_reminder_sent_at')
      continue
    }
    try {
      const ctx = await resolveContext(order)
      await sendTemplateEmail('pix-pendente', order.customer_email, {
        idempotencyKey: `pix-pendente-${order.id}`,
        templateData: ctx,
      })
      sent++
    } catch (err) {
      console.error('[order-emails] falha no lembrete', order.id, err)
    }
    await markEmail(order.id, 'email_reminder_sent_at')
  }

  return { sent, checked: rows.length }
}
