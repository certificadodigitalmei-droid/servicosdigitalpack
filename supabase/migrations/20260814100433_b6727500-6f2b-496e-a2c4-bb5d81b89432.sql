UPDATE public.site_settings
SET from_email = 'contato@seuceritificadodigitalmei.online',
    reply_to = CASE WHEN reply_to IS NULL THEN NULL ELSE 'contato@seuceritificadodigitalmei.online' END,
    updated_at = now()
WHERE from_email IS NULL OR from_email NOT ILIKE '%@%seuceritificadodigitalmei.online';