ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS from_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_to TEXT;

UPDATE public.site_settings
   SET from_email = COALESCE(from_email, 'certificado.mei.estadual@seu-certificado-mei-digital.online'),
       from_name = COALESCE(from_name, 'Certificado Digital MEI'),
       reply_to = COALESCE(reply_to, ''),
       updated_at = now()
 WHERE from_email IS NULL OR from_name IS NULL;