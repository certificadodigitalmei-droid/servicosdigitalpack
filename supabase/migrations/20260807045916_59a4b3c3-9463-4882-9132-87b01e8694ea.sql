UPDATE public.site_popup_settings
SET
  payment_title = '*ATENÇÃO ÀS INFORMAÇÕES:*',
  payment_partner_text = 'O pagamento para ativação do processo de certificado digital será feito pela empresa parceira credenciada *DIGITAL CERTIFICA A1 LTDA*, *ICP-Brasil* e pela *AC INCP SP* para a prestação e processamento do serviço.',
  payment_alert_text = 'O processo de pagamento é simples, fácil e totalmente digital pelo portal, seguro e prático. Basta *copiar o código PIX* e *colar na área do seu banco*, copie e cole e realize o pagamento. O processo é feito 100% digital e em poucos minutos o certificado é vinculado automaticamente ao CNPJ.',
  payment_validity_text = '*Validade do certificado: 12 meses a partir da data de emissão.*',
  updated_at = now()
WHERE id = 1;
