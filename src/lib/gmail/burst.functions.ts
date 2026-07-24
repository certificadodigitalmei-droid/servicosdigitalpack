// Burst sender via Gmail API. Admin-only. Sends up to 100 pre-rendered
// messages in parallel using the shared sendGmailMessage helper.
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('forbidden: admin role required');
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const messageSchema = z.object({
  to: z
    .string()
    .trim()
    .max(320)
    .refine((v) => emailRegex.test(v), 'e-mail inválido')
    .refine((v) => !/[\r\n]/.test(v), 'caractere inválido'),
  subject: z.string().trim().min(1).max(500).refine((v) => !/[\r\n]/.test(v), 'assunto inválido'),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
  companyId: z.string().uuid().nullable().optional(),
  cnpj: z.string().max(32).nullable().optional(),
});

const burstSchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
  testMode: z.boolean().default(false),
  testRecipient: z.string().trim().max(320).nullable().optional(),
});

export type BurstResultItem =
  | { to: string; ok: true; messageId: string; companyId?: string | null; cnpj?: string | null }
  | { to: string; ok: false; error: string; code?: string; status?: number; retryAfterSeconds?: number; companyId?: string | null; cnpj?: string | null };

export const sendWorkspaceBurst = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => burstSchema.parse(data))
  .handler(async ({ data, context }): Promise<{ sent: number; failed: number; results: BurstResultItem[] }> => {
    await assertAdmin(context.supabase, context.userId);
    const { sendGmailMessage, GmailError } = await import('./gmail.server');

    const testOverride = data.testMode ? (data.testRecipient || '').trim() : '';

    const results: BurstResultItem[] = await Promise.all(
      data.messages.map(async (m) => {
        const to = data.testMode && testOverride ? testOverride : m.to;
        try {
          const r = await sendGmailMessage({
            to,
            subject: m.subject,
            html: m.html,
            text: m.text,
          });
          // Grava histórico durável (só em envio REAL, não em teste)
          if (!data.testMode) {
            try {
              const normEmail = (m.to || '').trim().toLowerCase();
              const normCnpj = (m.cnpj || '').replace(/\D+/g, '') || null;
              await context.supabase.from('email_campaign_recipients').insert({
                email: normEmail,
                cnpj: normCnpj,
                company_id: m.companyId ?? null,
                status: 'sent',
                sent_at: new Date().toISOString(),
                personalized_subject: m.subject,
              } as any);
            } catch {
              // Falha ao gravar histórico não deve invalidar o envio confirmado.
            }
          }
          return { to, ok: true, messageId: r.messageId, companyId: m.companyId ?? null, cnpj: m.cnpj ?? null };
        } catch (e) {
          const err = e as InstanceType<typeof GmailError>;
          return {
            to,
            ok: false,
            error: err.message || 'erro desconhecido',
            code: err.code,
            status: err.status,
            retryAfterSeconds: err.retryAfterSeconds,
            companyId: m.companyId ?? null,
            cnpj: m.cnpj ?? null,
          };
        }
      }),
    );

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    return { sent, failed, results };
  });
