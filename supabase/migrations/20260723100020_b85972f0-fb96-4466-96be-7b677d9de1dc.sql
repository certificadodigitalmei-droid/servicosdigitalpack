
ALTER TABLE public.site_popup_settings
  ADD COLUMN IF NOT EXISTS payment_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_badge_text text NOT NULL DEFAULT 'Informações sobre o pagamento',
  ADD COLUMN IF NOT EXISTS payment_title text NOT NULL DEFAULT 'Antes de continuar, leia com atenção',
  ADD COLUMN IF NOT EXISTS payment_partner_text text NOT NULL DEFAULT 'O pagamento poderá ser processado por uma das empresas parceiras responsáveis pela prestação e processamento do serviço. Por esse motivo, o nome empresarial ou CNPJ apresentado pelo seu banco poderá ser diferente do nome deste portal.',
  ADD COLUMN IF NOT EXISTS payment_alert_text text NOT NULL DEFAULT 'Em razão do volume de transações e da utilização de diferentes empresas parceiras para o processamento dos pagamentos, algumas instituições financeiras podem apresentar alertas automáticos de segurança ou prevenção a fraudes.',
  ADD COLUMN IF NOT EXISTS payment_confirmation_text text NOT NULL DEFAULT 'Após a confirmação do pagamento, o certificado contratado será emitido e vinculado ao CNPJ informado durante a solicitação, conforme as condições do serviço.',
  ADD COLUMN IF NOT EXISTS payment_validity_text text NOT NULL DEFAULT 'Validade do certificado: 12 meses a partir da data de emissão.',
  ADD COLUMN IF NOT EXISTS payment_loading_title text NOT NULL DEFAULT 'Gerando guia de pagamento',
  ADD COLUMN IF NOT EXISTS payment_loading_subtitle text NOT NULL DEFAULT 'Aguarde enquanto processamos sua solicitação com segurança...',
  ADD COLUMN IF NOT EXISTS payment_continue_button_text text NOT NULL DEFAULT 'Continuar para o PIX',
  ADD COLUMN IF NOT EXISTS payment_cancel_button_text text NOT NULL DEFAULT 'Cancelar';
