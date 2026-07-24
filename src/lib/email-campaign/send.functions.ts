import { createServerFn } from '@tanstack/react-start';
import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { DEFAULT_DESIGN, renderHtml, renderText, type CampaignDesign, type Vars } from './template';

const SENDER_DOMAIN = 'notify.seu-certificado-mei-digital.online';
const DEFAULT_FROM_ADDRESS = 'certificado.mei.estadual@seu-certificado-mei-digital.online';
const DEFAULT_FROM_NAME = 'Certificado Digital MEI';
const TEST_RECIPIENT_ENV = 'CAMPAIGN_TEST_RECIPIENT';

export type CampaignSendInput = {
  recipient: string;
  subject: string;
  vars: Vars;
  design?: Partial<CampaignDesign>;
  idempotencyKey?: string;
  replyTo?: string;
  fromAddress?: string;
  fromName?: string;
  testMode?: boolean;
  testRecipient?: string | null;
  // Identificadores para deduplicação durável: gravamos sent_at em
  // email_campaign_recipients para que a fila jamais reinsira alguém que
  // já foi disparado, mesmo depois de trocar de navegador ou limpar o cache.
  companyId?: string | null;
  cnpj?: string | null;
};

export type CampaignSendResult =
  | { sent: true; recipient: string; idempotencyKey: string }
  | { sent: false; reason: 'recipient_suppressed' | 'rate_limited' | 'error'; message?: string; retryAfterSeconds?: number };

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

export const sendCampaignEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CampaignSendInput) => input)
  .handler(async ({ data, context }): Promise<CampaignSendResult> => {
    await assertAdmin(context);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error('LOVABLE_API_KEY não configurada');

    const design: CampaignDesign = { ...DEFAULT_DESIGN, ...(data.design ?? {}) };
    const vars = data.vars ?? {};
    const html = renderHtml(design, vars);
    const text = renderText(design, vars);

    const fromName = data.fromName ?? DEFAULT_FROM_NAME;
    const fromAddress = data.fromAddress ?? DEFAULT_FROM_ADDRESS;

    const testOverride = (data.testRecipient || process.env[TEST_RECIPIENT_ENV] || '').trim();
    const recipient = data.testMode && testOverride ? testOverride : data.recipient;

    if (!recipient) {
      return { sent: false, reason: 'error', message: 'Destinatário vazio' };
    }

    const idempotencyKey = data.idempotencyKey || crypto.randomUUID();

    try {
      await sendLovableEmail(
        {
          to: recipient,
          from: `${fromName} <${fromAddress}>`,
          sender_domain: SENDER_DOMAIN,
          subject: data.subject,
          html,
          text,
          purpose: 'transactional',
          label: data.testMode ? 'campaign-test' : 'campaign',
          idempotency_key: idempotencyKey,
          reply_to: data.replyTo ?? fromAddress,
        },
        { apiKey, sendUrl: process.env.LOVABLE_SEND_URL }
      );
      return { sent: true, recipient, idempotencyKey };
    } catch (error) {
      if (error instanceof EmailAPIError) {
        if (error.code === 'recipient_suppressed') {
          return { sent: false, reason: 'recipient_suppressed', message: 'Destinatário suprimido (bounce/reclamação/opt-out)' };
        }
        if (error.status === 429) {
          return {
            sent: false,
            reason: 'rate_limited',
            message: 'Limite de envios atingido — aguarde e tente novamente',
            retryAfterSeconds: (error as any).retryAfterSeconds ?? 60,
          };
        }
        return { sent: false, reason: 'error', message: `${error.code}: ${error.message}` };
      }
      return { sent: false, reason: 'error', message: (error as Error).message };
    }
  });
