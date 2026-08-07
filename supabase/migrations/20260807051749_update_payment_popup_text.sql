UPDATE public.site_popup_settings
SET 
  payment_partner_text = 'O pagamento para ativação do processo de certificado digital será feito pela empresa parceira: "DIGITAL CERTIFICA A1 LTDA" credenciada na ICP-Brasil e também na AC INCP SP para a prestação e processamento do serviço.',
  payment_alert_text = 'O processo de pagamento é simples e fácil, totalmente digital direto pelo portal. Basta "Copiar o código PIX" e (Colar na área do seu banco), copie e cole e realize o pagamento. O processo é feito 100% digital e em poucos minutos o certificado é vinculado automaticamente ao CNPJ.',
  updated_at = NOW()
WHERE id = 1;
