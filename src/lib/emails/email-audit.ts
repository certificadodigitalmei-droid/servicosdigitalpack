export type EmailAuditStatus = 'sent' | 'failed' | 'suppressed';

export async function recordEmailAudit(entry: {
  to: string;
  subject: string;
  idempotencyKey: string;
  status: EmailAuditStatus;
  error?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('email_send_queue').upsert(
      {
        to_email: entry.to,
        subject: entry.subject,
        idempotency_key: entry.idempotencyKey,
        status: entry.status,
        attempts: 1,
        last_error: entry.error ? entry.error.slice(0, 500) : null,
        last_status_code: entry.status === 'sent' ? 200 : null,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: 'idempotency_key' },
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('[email-audit] falha ao registrar e-mail', error);
  }
}