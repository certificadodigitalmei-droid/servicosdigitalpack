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

export type EmailLogRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  to: string;
  subject: string;
  status: string;
  attempts: number;
  lastError: string | null;
  lastStatusCode: number | null;
  nextRetryAt: string | null;
  messageId: string | null;
  tipo: string;
};

export type EmailLogStats = {
  total: number;
  enviados: number;
  naFila: number;
  falhas: number;
  ultimaHora: number;
  ultimoEnvioAt: string | null;
};

function classify(subject: string): string {
  const s = (subject || '').toLowerCase();
  if (s.includes('confirmad') || s.includes('emitido') || s.includes('aprovad')) return 'Pagamento confirmado';
  if (s.includes('guia') || s.includes('pix')) return 'Guia gerada (PIX)';
  if (s.includes('pendente') || s.includes('lembrete') || s.includes('regulariz')) return 'Cobrança / recuperação';
  if (s.includes('teste')) return 'Teste';
  return 'Campanha / outros';
}

/** Log real de todos os e-mails processados pelo sistema (fila do Workspace). */
export const listEmailLog = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { from?: string; to?: string; status?: string; search?: string; limit?: number } | undefined) =>
      input ?? {},
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    let query = supabaseAdmin
      .from('email_send_queue')
      .select(
        'id, created_at, updated_at, to_email, subject, status, attempts, last_error, last_status_code, next_retry_at, sent_message_id',
      )
      .order('created_at', { ascending: false })
      .limit(Math.min(data.limit ?? 300, 1000));

    if (data.from) query = query.gte('created_at', data.from);
    if (data.to) query = query.lte('created_at', data.to);
    if (data.status && data.status !== 'all') query = query.eq('status', data.status);
    if (data.search) query = query.or(`to_email.ilike.%${data.search}%,subject.ilike.%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list: EmailLogRow[] = ((rows as any[]) ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      to: r.to_email,
      subject: r.subject,
      status: r.status,
      attempts: r.attempts ?? 0,
      lastError: r.last_error ?? null,
      lastStatusCode: r.last_status_code ?? null,
      nextRetryAt: r.next_retry_at ?? null,
      messageId: r.sent_message_id ?? null,
      tipo: classify(r.subject),
    }));

    const hourAgo = Date.now() - 60 * 60 * 1000;
    const sentRows = list.filter((r) => r.status === 'sent');
    const stats: EmailLogStats = {
      total: list.length,
      enviados: sentRows.length,
      naFila: list.filter((r) => ['queued', 'sending', 'retrying'].includes(r.status)).length,
      falhas: list.filter((r) => r.status === 'failed').length,
      ultimaHora: sentRows.filter((r) => new Date(r.updatedAt).getTime() >= hourAgo).length,
      ultimoEnvioAt: sentRows[0]?.updatedAt ?? null,
    };

    return { rows: list, stats };
  });

/** Recoloca e-mails com falha na fila para nova tentativa. */
export const retryFailedEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids?: string[] } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    let q = supabaseAdmin
      .from('email_send_queue')
      .update({ status: 'queued', attempts: 0, next_retry_at: null, last_error: null })
      .eq('status', 'failed');
    if (data.ids?.length) q = q.in('id', data.ids);

    const { data: rows, error } = await q.select('id');
    if (error) throw new Error(error.message);
    return { requeued: rows?.length ?? 0 };
  });
