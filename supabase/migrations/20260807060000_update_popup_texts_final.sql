UPDATE public.site_popup_settings
SET 
  payment_alert_text = 'O processo de pagamento é simples, rápido e 100% digital, feito direto pelo portal. Basta copiar o código PIX e colar na área Pix do seu banco para realizar o pagamento. Em poucos minutos o certificado é emitido.',
  payment_confirmation_text = 'Após a confirmação do pagamento, o certificado contratado será emitido e vinculado ao CNPJ informado automaticamente.'
WHERE id = 1;
