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

    const payload = {
      to: recipient,
      from: `${fromName} <${fromAddress}>`,
      sender_domain: SENDER_DOMAIN,
      subject: data.subject,
      html,
      text,
      purpose: 'transactional' as const,
      label: data.testMode ? 'campaign-test' : 'campaign',
      idempotency_key: idempotencyKey,
      reply_to: data.replyTo ?? fromAddress,
    };

    // Tenta rotear via workers Lovable adicionais (outras contas) para
    // somar capacidade. Se todos falharem/estiverem indisponíveis, cai
    // no envio local (LOVABLE_API_KEY deste projeto).
    const { data: workers } = await (context.supabase as any)
      .from('email_workers')
      .select('*')
      .eq('is_active', true)
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .order('priority', { ascending: true });

    let deliveredVia: 'local' | 'worker' = 'local';
    let workerError: string | null = null;

    if (workers && workers.length > 0) {
      for (const w of workers) {
        try {
          const wPayload = {
            ...payload,
            from: w.from_email ? `${w.from_name || fromName} <${w.from_email}>` : payload.from,
          };
          const res = await fetch(w.worker_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.worker_api_key}` },
            body: JSON.stringify(wPayload),
          });
          if (res.ok) {
            deliveredVia = 'worker';
            await (context.supabase as any).from('email_workers').update({
              last_used_at: new Date().toISOString(),
              last_success_at: new Date().toISOString(),
              last_error: null,
            }).eq('id', w.id);
            break;
          }
          const bodyText = await res.text();
          workerError = `worker ${w.name}: HTTP ${res.status} ${bodyText.slice(0, 200)}`;
          await (context.supabase as any).from('email_workers').update({
            last_used_at: new Date().toISOString(),
            last_error: workerError,
            last_error_at: new Date().toISOString(),
          }).eq('id', w.id);
          // 429/5xx: tenta próximo worker
        } catch (e) {
          workerError = `worker ${w.name}: ${(e as Error).message}`;
          await (context.supabase as any).from('email_workers').update({
            last_used_at: new Date().toISOString(),
            last_error: workerError,
            last_error_at: new Date().toISOString(),
          }).eq('id', w.id);
        }
      }
    }

    try {
      if (deliveredVia !== 'worker') {
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
            personalized_subject: data.subject,
          } as any);
        } catch {
          // Falha ao gravar histórico não deve invalidar o envio confirmado.
        }
      }
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
