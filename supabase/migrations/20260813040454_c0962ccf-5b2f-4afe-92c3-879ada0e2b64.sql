UPDATE public.site_settings
SET from_email = replace(from_email, 'seu-certificado-mei-digital.online', 'certificadodigitalccmei.online'),
    reply_to = replace(reply_to, 'seu-certificado-mei-digital.online', 'certificadodigitalccmei.online'),
    updated_at = now()
WHERE from_email LIKE '%seu-certificado-mei-digital.online%' OR reply_to LIKE '%seu-certificado-mei-digital.online%';