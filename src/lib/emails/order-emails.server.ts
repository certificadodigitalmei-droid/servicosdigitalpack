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
  created_at?: string | null
}

function protocoloFor(id: string): string {
  return `CD-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

function formatDateTimeBR(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  if (isNaN(d.getTime())) return undefined
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

function cleanPersonName(v?: string | null): string {
  if (!v) return ''
  return v
    .replace(/\d+/g, '')
    .replace(/[.\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    empresa: cleanPersonName(order.reference_name) || cleanPersonName(order.customer_name) || undefined,
    cnpj: formatCnpj(order.reference_cnpj || order.customer_document),
    link,
    protocolo: protocoloFor(order.id),
    dataSolicitacao: formatDateTimeBR(order.created_at),
  }
}

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, customer_email, customer_name, customer_document, reference_cnpj, reference_name, public_link_id, pix_code, created_at',
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

// ---------------------------------------------------------------------------
// Desconto nas cobranças: a régua NUNCA cria desconto. Ela apenas mantém o
// desconto que já existe no link da empresa (aplicado por uma campanha de
// e-mail com desconto enviada antes). Se o link tem desconto ativo, a
// cobrança sai com o modelo promocional e o mesmo valor com desconto.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_AMOUNT = 97

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function loadBaseAmount(): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('product_amount')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const base = Number((data as any)?.product_amount)
  return Number.isFinite(base) && base > 0 ? base : DEFAULT_BASE_AMOUNT
}

/**
 * Lê o desconto já existente no link público do pedido. Retorna null quando
 * não há desconto ativo — nesse caso a cobrança sai no valor normal.
 */
async function readLinkDiscount(
  order: OrderRow,
  baseAmount: number,
): Promise<{ valorPromocional: string; valorOriginal: string; validadeOferta: string } | null> {
  if (!order.public_link_id) return null

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data } = await supabaseAdmin
    .from('company_links')
    .select('discount_amount_cents, discount_expires_at')
    .eq('id', order.public_link_id)
    .maybeSingle()

  const row = (data as any) ?? {}
  const cents = Number(row.discount_amount_cents)
  if (!Number.isFinite(cents) || cents <= 0) return null

  const expiresAt = row.discount_expires_at ? new Date(row.discount_expires_at) : null
  if (expiresAt && expiresAt.getTime() <= Date.now()) return null

  const amount = cents / 100
  if (amount >= baseAmount) return null

  let validade = 'por tempo limitado'
  if (expiresAt) {
    const hoursLeft = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 3600000))
    validade = hoursLeft <= 24 ? `nas próximas ${hoursLeft}h` : `até ${expiresAt.toLocaleDateString('pt-BR')}`
  }

  return {
    valorPromocional: brl(amount),
    valorOriginal: brl(baseAmount),
    validadeOferta: validade,
  }
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
      templateData: { ...ctx, validade: VALIDADE_PADRAO, dataEmissao: formatDateTimeBR(new Date().toISOString()) },
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
      'id, customer_email, customer_name, customer_document, reference_cnpj, reference_name, public_link_id, pix_code, created_at',
    )
    .eq('status', 'awaiting_payment')
    .is('email_reminder_sent_at', null)
    .lte('created_at', cutoff)
    .gte('created_at', floor)
    .limit(50)

  const rows = (pending as OrderRow[]) ?? []
  const baseAmount = await loadBaseAmount()
  let sent = 0
  for (const order of rows) {
    if (!order.customer_email) {
      await markEmail(order.id, 'email_reminder_sent_at')
      continue
    }
    try {
      const ctx = await resolveContext(order)
      const promo = await readLinkDiscount(order, baseAmount)

      await sendTemplateEmail(promo ? 'oferta-desconto' : 'pix-pendente', order.customer_email, {
        idempotencyKey: `pix-pendente-${order.id}`,
        templateData: { ...ctx, ...(promo ?? {}) },
      })
      sent++
    } catch (err) {
      console.error('[order-emails] falha no lembrete', order.id, err)
    }
    await markEmail(order.id, 'email_reminder_sent_at')
  }


  return { sent, checked: rows.length }
}

export type RecoveryResult = { sent: number; checked: number; skipped: number }

/**
 * Recuperação de carrinho: enquanto o pedido não for pago, envia 1 e-mail por
 * dia (24h desde o último contato) até o limite de dias configurado.
 */
export async function sendDailyRecovery(
  opts: { maxDays?: number; limit?: number } = {},
): Promise<RecoveryResult> {
  const maxDays = opts.maxDays ?? 15
  const limit = opts.limit ?? 100
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const floor = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, customer_email, customer_name, customer_document, reference_cnpj, reference_name, public_link_id, pix_code, created_at, email_recovery_count, email_recovery_last_at, email_reminder_sent_at',
    )
    .in('status', ['pending', 'awaiting_payment'])
    .gte('created_at', floor)
    .order('created_at', { ascending: true })
    .limit(500)

  const rows = (data as any[]) ?? []
  let sent = 0
  let skipped = 0
  let checked = 0

  for (const row of rows) {
    if (sent >= limit) break
    // Último contato: recuperação > lembrete de 15min > criação do pedido.
    const last = row.email_recovery_last_at || row.email_reminder_sent_at || row.created_at
    if (last && last > dayAgo) continue
    checked++
    if (!row.customer_email) {
      skipped++
      continue
    }
    try {
      const ctx = await resolveContext(row as OrderRow)
      const nextCount = (row.email_recovery_count ?? 0) + 1
      await sendTemplateEmail('pix-pendente', row.customer_email, {
        idempotencyKey: `recuperacao-${row.id}-${nextCount}`,
        templateData: ctx,
      })
      await supabaseAdmin
        .from('orders')
        .update({
          email_recovery_count: nextCount,
          email_recovery_last_at: new Date().toISOString(),
        } as any)
        .eq('id', row.id)
      sent++
    } catch (err) {
      console.error('[order-emails] falha na recuperação', row.id, err)
      skipped++
    }
  }

  return { sent, checked, skipped }
}

// ---------------------------------------------------------------------------
// Fluxo de notificação automática (somente pedidos do dia, fuso de São Paulo)
// 1) PIX gerado  -> e-mail "Guia gerada" (disparado no momento da criação)
// 2) 30 minutos sem pagamento -> 1º e-mail de cobrança
// 3) depois disso, 1 e-mail de cobrança por hora
// 4) para de enviar às 22h (10h da noite) do mesmo dia
// 5) pagou -> e-mail "Pagamento confirmado"
// ---------------------------------------------------------------------------

export const CADENCE = {
  firstReminderMinutes: 180, // de 3 a 3 horas (3 * 60 = 180)
  repeatMinutes: 180,      // de 3 a 3 horas
  stopHour: 22,            // para às 22h (10h da noite)
} as const;

/** Retorna partes de data/hora no fuso de São Paulo. */
export function spParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour === '24' ? '0' : p.hour),
    minute: Number(p.minute),
  }
}

/** Início do dia atual (São Paulo) em ISO UTC. */
export function spTodayStartISO(now = new Date()): string {
  const { day } = spParts(now)
  // São Paulo = UTC-3 (sem horário de verão desde 2019)
  return new Date(`${day}T00:00:00-03:00`).toISOString()
}

export type CadenceResult = {
  skippedByHour: boolean
  firstReminders: number
  hourlyReminders: number
  checked: number
  skippedDuplicates: number
  errors: number
}

/** Chave do destinatário: e-mail (preferencial) ou CNPJ. */
export function recipientKey(row: {
  customer_email?: string | null
  reference_cnpj?: string | null
  customer_document?: string | null
}): string {
  const email = (row.customer_email || '').trim().toLowerCase()
  if (email) return `e:${email}`
  const doc = (row.reference_cnpj || row.customer_document || '').replace(/\D/g, '')
  return doc ? `d:${doc}` : ''
}

/**
 * Mantém apenas o pedido mais recente por destinatário e descarta os
 * destinatários que já pagaram hoje. Assim, mesmo que a empresa gere várias
 * guias, a cobrança considera só a última guia não paga.
 */
export function pickActiveOrders<T extends { id: string; created_at: string }>(
  unpaid: T[],
  paidKeys: Set<string>,
  keyOf: (row: T) => string,
): { active: T[]; duplicates: T[] } {
  const latest = new Map<string, T>()
  const duplicates: T[] = []
  for (const row of unpaid) {
    const key = keyOf(row)
    if (!key || paidKeys.has(key)) {
      duplicates.push(row)
      continue
    }
    const current = latest.get(key)
    if (!current) {
      latest.set(key, row)
      continue
    }
    if (new Date(row.created_at).getTime() > new Date(current.created_at).getTime()) {
      latest.set(key, row)
      duplicates.push(current)
    } else {
      duplicates.push(row)
    }
  }
  return { active: [...latest.values()], duplicates }
}

/** Executa a régua de cobrança do dia. Deve rodar a cada poucos minutos. */
export async function runNotificationCadence(): Promise<CadenceResult> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const now = new Date()
  const { hour } = spParts(now)
  const result: CadenceResult = {
    skippedByHour: hour >= CADENCE.stopHour,
    firstReminders: 0,
    hourlyReminders: 0,
    checked: 0,
    skippedDuplicates: 0,
    errors: 0,
  }
  if (result.skippedByHour) return result

  const dayStart = spTodayStartISO(now)

  const { data } = await supabaseAdmin
    .from('orders')
    .select(
      'id, customer_email, customer_name, customer_document, reference_cnpj, reference_name, public_link_id, pix_code, created_at, status, email_reminder_sent_at, email_recovery_count, email_recovery_last_at',
    )
    .gte('created_at', dayStart)
    .order('created_at', { ascending: true })
    .limit(500)

  const all = (data as any[]) ?? []
  const paidKeys = new Set<string>()
  for (const row of all) {
    if (row.status === 'paid') {
      const key = recipientKey(row)
      if (key) paidKeys.add(key)
    }
  }

  const unpaid = all.filter((r) => r.status === 'pending' || r.status === 'awaiting_payment')
  const { active, duplicates } = pickActiveOrders(unpaid, paidKeys, recipientKey)
  result.skippedDuplicates = duplicates.length

  const nowMs = now.getTime()
  const baseAmount = await loadBaseAmount()

  for (const row of active) {
    result.checked++
    if (!row.customer_email) continue

    const createdMs = new Date(row.created_at).getTime()
    const isFirst = !row.email_reminder_sent_at
    const lastContact = row.email_recovery_last_at || row.email_reminder_sent_at
    const dueFirst = isFirst && nowMs - createdMs >= CADENCE.firstReminderMinutes * 60 * 1000
    const dueRepeat =
      !isFirst &&
      lastContact &&
      nowMs - new Date(lastContact).getTime() >= CADENCE.repeatMinutes * 60 * 1000

    if (!dueFirst && !dueRepeat) continue

    try {
      const ctx = await resolveContext(row as OrderRow)
      const nextCount = (row.email_recovery_count ?? 0) + 1
      // Mantém o desconto que a empresa já recebeu por campanha (se houver).
      const promo = await readLinkDiscount(row as OrderRow, baseAmount)
      await sendTemplateEmail(promo ? 'oferta-desconto' : 'pix-pendente', row.customer_email, {
        idempotencyKey: `cadencia-${row.id}-${nextCount}`,
        templateData: { ...ctx, ...(promo ?? {}) },
      })

      const stamp = new Date().toISOString()
      const patch: Record<string, unknown> = {
        email_recovery_count: nextCount,
        email_recovery_last_at: stamp,
      }
      if (isFirst) patch.email_reminder_sent_at = stamp
      await supabaseAdmin.from('orders').update(patch as any).eq('id', row.id)
      if (isFirst) result.firstReminders++
      else result.hourlyReminders++
    } catch (err) {
      console.error('[order-emails] falha na cadência', row.id, err)
      result.errors++
    }
  }

  return result
}
