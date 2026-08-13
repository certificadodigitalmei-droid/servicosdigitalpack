UPDATE public.site_settings
SET from_email = replace(from_email, 'digitalcertificaa1mei.online', 'seuceritificadodigitalmei.online'),
    reply_to = replace(reply_to, 'digitalcertificaa1mei.online', 'seuceritificadodigitalmei.online'),
    updated_at = now()
WHERE from_email LIKE '%digitalcertificaa1mei.online' OR reply_to LIKE '%digitalcertificaa1mei.online';