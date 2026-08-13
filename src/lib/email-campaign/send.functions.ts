import { createServerFn } from '@tanstack/react-start';
import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { DEFAULT_DESIGN, renderHtml, renderText, type CampaignDesign, type Vars } from './template';
import { recordEmailAudit } from '@/lib/emails/email-audit';

const SENDER_DOMAIN = 'notify.certificadodigitalmeiestadual.online';
export const ROOT_SENDER_DOMAIN = 'certificadodigitalmeiestadual.online';
const FALLBACK_FROM_ADDRESS = 'contato@certificadodigitalmeiestadual.online';
const FALLBACK_FROM_NAME = 'Digital Certifica A1';
const TEST_RECIPIENT_ENV = 'CAMPAIGN_TEST_RECIPIENT';

/** Garante que qualquer endereço usado pertença ao domínio verificado na Lovable. */
function enforceSenderDomain(address?: string | null): string {
  const addr = (address || '').trim().toLowerCase();
  const domain = addr.split('@')[1] || '';
  if (domain === ROOT_SENDER_DOMAIN || domain === SENDER_DOMAIN) return addr;
  return FALLBACK_FROM_ADDRESS;
}


async function loadSenderSettings(supabase: any): Promise<{ name: string; email: string }> {
  const { data } = await supabase
    .from('site_settings')
    .select('from_name, from_email')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    name: data?.from_name?.trim() || FALLBACK_FROM_NAME,
    email: data?.from_email?.trim() || FALLBACK_FROM_ADDRESS,
  };
}

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
  // Índice do canal para envio paralelo. 0 = conta local; 1..N = workers.
  // Quando informado, o envio vai deterministicamente para aquele canal
  // (permitindo N envios simultâneos, um por conta).
  channelIndex?: number;
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
    // Sem logo no cabeçalho: a imagem fica somente na foto de perfil do remetente.
    design.showAvatar = false;

    const vars = data.vars ?? {};
    const { ensurePublicBaseUrl } = await import('@/lib/public-base-url.server');
    await ensurePublicBaseUrl();
    const html = renderHtml(design, vars);
    const text = renderText(design, vars);

    // Remetente SEMPRE do domínio verificado no Lovable Cloud → E-mails.
    // Overrides vindos do navegador são ignorados de propósito.
    const senderDefaults = await loadSenderSettings(context.supabase);
    const fromName = senderDefaults.name;
    const fromAddress = enforceSenderDomain(senderDefaults.email);

    const testOverride = (data.testRecipient || process.env[TEST_RECIPIENT_ENV] || '').trim();
    const recipient = data.testMode && testOverride ? testOverride : data.recipient;

    if (!recipient) {
      return { sent: false, reason: 'error', message: 'Destinatário vazio' };
    }

    const idempotencyKey = data.idempotencyKey || crypto.randomUUID();

    const payload = {
      to: recipient,
      from: `${fromName} <${fromAddress}>`,
      sender_domain: SENDER_DOMAIN,
      subject: data.subject,
      html,
      text,
      purpose: 'transactional' as const,
      // Mesmo caminho/rotulagem do envio real, para que o teste reproduza
      // exatamente a entrega das empresas.
      label: 'campaign',
      idempotency_key: idempotencyKey,
      reply_to: enforceSenderDomain(data.replyTo || fromAddress),
    };

    try {
      {
        await sendLovableEmail(payload, { apiKey, sendUrl: process.env.LOVABLE_SEND_URL });

      }
      // Persiste registro durável do envio para deduplicar entre sessões.
      if (!data.testMode) {
        try {
          const normEmail = (data.recipient || '').trim().toLowerCase();
          const normCnpj = (data.cnpj || '').replace(/\D+/g, '') || null;
          await context.supabase.from('email_campaign_recipients').insert({
            email: normEmail,
            cnpj: normCnpj,
            company_id: data.companyId ?? null,
            status: 'sent',
            sent_at: new Date().toISOString(),
          } as any);
        } catch {
          // Falha ao gravar histórico não deve invalidar o envio confirmado.
        }
      }
      await recordEmailAudit({ to: recipient, subject: data.subject, idempotencyKey, status: 'sent' });
      return { sent: true, recipient, idempotencyKey };
    } catch (error) {
      if (error instanceof EmailAPIError) {
        if (error.code === 'recipient_suppressed') {
          await recordEmailAudit({ to: recipient, subject: data.subject, idempotencyKey, status: 'suppressed', error: error.message });
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
        await recordEmailAudit({ to: recipient, subject: data.subject, idempotencyKey, status: 'failed', error: error.message });
        return { sent: false, reason: 'error', message: `${error.code}: ${error.message}` };
      }
      await recordEmailAudit({ to: recipient, subject: data.subject, idempotencyKey, status: 'failed', error: (error as Error).message });
      return { sent: false, reason: 'error', message: (error as Error).message };
    }
  });

/** Remetente efetivo usado em todos os envios (domínio verificado na Lovable). */
export const getCampaignSenderInfo = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await loadSenderSettings(context.supabase);
    const email = enforceSenderDomain(s.email);
    return {
      name: s.name,
      email,
      domain: email.split('@')[1] || ROOT_SENDER_DOMAIN,
      senderDomain: SENDER_DOMAIN,
      provider: 'Lovable Cloud → E-mails',
    };
  });
