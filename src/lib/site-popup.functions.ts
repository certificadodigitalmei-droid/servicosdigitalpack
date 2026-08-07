import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type PopupFooterItem = { icon: string; text: string };

export type SitePopupSettings = {
  enabled: boolean;
  badge_text: string;
  title: string;
  highlight_text: string;
  law_title: string;
  law_text: string;
  provider_text: string;
  risks_title: string;
  risks: string[];
  price_main_label: string;
  price_main: string;
  price_main_note: string;
  price_installment_label: string;
  price_installment: string;
  price_installment_note: string;
  validity_title: string;
  validity_subtitle: string;
  footer_items: PopupFooterItem[];
  continue_button_text: string;
  cancel_button_text: string;
  // Payment info popup
  payment_enabled: boolean;
  payment_badge_text: string;
  payment_title: string;
  payment_partner_text: string;
  payment_alert_text: string;
  payment_confirmation_text: string;
  payment_validity_text: string;
  payment_loading_title: string;
  payment_loading_subtitle: string;
  payment_continue_button_text: string;
  payment_cancel_button_text: string;
};

const DEFAULTS: SitePopupSettings = {
  enabled: true,
  badge_text: 'COMUNICADO',
  title: 'Seu CNPJ foi Aberto ou Atualizado Recentemente:',
  highlight_text: 'Porém encontra-se pendente Certificado Digital',
  law_title: 'QUE É OBRIGATÓRIO POR LEI',
  law_text: 'Conforme determinação da Receita Federal, todas as empresas devem possuir um Certificado Digital ativo.',
  provider_text: 'Emita direto conosco por empresas parceiras credenciadas pelo ICP-Brasil e pela AC INCP SP.',
  risks_title: 'Sua empresa pode sofrer caso fique pendente:',
  risks: [
    'Não consegue emitir Nota Fiscal Eletrônica (NF-e)',
    'Fica impedida de assinar contratos digitais',
    'Sujeita a multas e penalidades da Receita Federal',
    'Bloqueio em licitações e contratos públicos',
    'Restrição no acesso a crédito e financiamentos',
  ],
  price_main_label: 'Valor único',
  price_main: 'R$ 97,00',
  price_main_note: 'equivalente a 12 meses',
  price_installment_label: 'Isso dá apenas',
  price_installment: 'R$ 8,08',
  price_installment_note: 'por mês',
  validity_title: 'Validade de 12 meses',
  validity_subtitle: '100% seguro e dentro da lei',
  footer_items: [
    { icon: 'lock', text: 'Processo 100% online e seguro' },
    { icon: 'key', text: 'Credenciados pelo ICP-Brasil e AC INCP SP' },
    { icon: 'headset', text: 'Suporte especializado em todo o processo' },
  ],
  continue_button_text: 'Continuar para emissão',
  cancel_button_text: 'Voltar',
  payment_enabled: true,
  payment_badge_text: 'Informações sobre o pagamento',
  payment_title: '*ATENÇÃO ÀS INFORMAÇÕES:*',
  payment_partner_text:
    'O pagamento para ativação do processo de certificado digital será feito pela empresa parceira: "DIGITAL CERTIFICA A1 LTDA" credenciada na ICP-Brasil e também na AC INCP SP para a prestação e processamento do serviço.',
  payment_alert_text:
    'O processo de pagamento é simples e fácil, totalmente digital direto pelo portal. Basta "Copiar o código PIX" e (Colar na área do seu banco), copie e cole e realize o pagamento. O processo é feito 100% digital e em poucos minutos o certificado é vinculado automaticamente ao CNPJ.',
  payment_confirmation_text:
    'Após a confirmação do pagamento, o certificado contratado será emitido e vinculado ao CNPJ informado durante a solicitação, conforme as condições do serviço.',
  payment_validity_text: '*Validade do certificado: 12 meses a partir da data de emissão.*',
  payment_loading_title: 'Gerando guia de pagamento',
  payment_loading_subtitle: 'Aguarde enquanto processamos sua solicitação com segurança...',
  payment_continue_button_text: 'Continuar',
  payment_cancel_button_text: 'Cancelar',

};

export const POPUP_DEFAULTS = DEFAULTS;

export const getSitePopup = createServerFn({ method: 'GET' }).handler(async (): Promise<SitePopupSettings> => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('site_popup_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return {
    ...DEFAULTS,
    ...data,
    risks: Array.isArray(data.risks) ? (data.risks as string[]) : DEFAULTS.risks,
    footer_items: Array.isArray(data.footer_items)
      ? (data.footer_items as PopupFooterItem[])
      : DEFAULTS.footer_items,
  };
});

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

const payloadSchema = z.object({
  enabled: z.boolean(),
  badge_text: z.string().max(60),
  title: z.string().max(300),
  highlight_text: z.string().max(200),
  law_title: z.string().max(120),
  law_text: z.string().max(600),
  provider_text: z.string().max(600),
  risks_title: z.string().max(200),
  risks: z.array(z.string().max(200)).max(12),
  price_main_label: z.string().max(60),
  price_main: z.string().max(40),
  price_main_note: z.string().max(80),
  price_installment_label: z.string().max(60),
  price_installment: z.string().max(40),
  price_installment_note: z.string().max(80),
  validity_title: z.string().max(120),
  validity_subtitle: z.string().max(200),
  footer_items: z
    .array(z.object({ icon: z.string().max(40), text: z.string().max(200) }))
    .max(6),
  continue_button_text: z.string().max(60),
  cancel_button_text: z.string().max(60),
  payment_enabled: z.boolean(),
  payment_badge_text: z.string().max(120),
  payment_title: z.string().max(200),
  payment_partner_text: z.string().max(800),
  payment_alert_text: z.string().max(800),
  payment_confirmation_text: z.string().max(800),
  payment_validity_text: z.string().max(300),
  payment_loading_title: z.string().max(120),
  payment_loading_subtitle: z.string().max(300),
  payment_continue_button_text: z.string().max(60),
  payment_cancel_button_text: z.string().max(60),
});

export const saveSitePopup = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => payloadSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('site_popup_settings')
      .upsert({ id: 1, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
