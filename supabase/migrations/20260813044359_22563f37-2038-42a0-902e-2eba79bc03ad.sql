UPDATE public.site_settings
SET from_email = replace(from_email, 'certificadodigitalccmei.online', 'digitalcertificaa1mei.online'),
    reply_to = replace(reply_to, 'certificadodigitalccmei.online', 'digitalcertificaa1mei.online'),
    updated_at = now()
WHERE from_email ILIKE '%certificadodigitalccmei.online%' OR reply_to ILIKE '%certificadodigitalccmei.online%';