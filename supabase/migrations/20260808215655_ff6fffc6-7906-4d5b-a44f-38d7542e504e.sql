ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS plugin_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text,
  ADD COLUMN IF NOT EXISTS waba_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_api_version text NOT NULL DEFAULT 'v19.0',
  ADD COLUMN IF NOT EXISTS template_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS button_base_url text NOT NULL DEFAULT 'https://seu-certificado-mei-digital.online/c/';

ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS button_url_token text;

UPDATE public.whatsapp_api_settings
   SET provider = 'chakrahq',
       base_url = 'https://api.chakrahq.com',
       plugin_id = '3f095662-d969-42b0-a41e-e729e1f46328',
       whatsapp_phone_number_id = '1290004607527438',
       waba_id = '1996285911002627',
       whatsapp_api_version = 'v19.0',
       template_name = 'certificado1',
       template_language = 'pt_BR',
       template_status = 'PENDING',
       button_base_url = 'https://seu-certificado-mei-digital.online/c/'
 WHERE id = 1;

INSERT INTO public.whatsapp_api_settings (id, provider, base_url, template_name, template_language, plugin_id, whatsapp_phone_number_id, waba_id, whatsapp_api_version, template_status, button_base_url)
SELECT 1, 'chakrahq', 'https://api.chakrahq.com', 'certificado1', 'pt_BR', '3f095662-d969-42b0-a41e-e729e1f46328', '1290004607527438', '1996285911002627', 'v19.0', 'PENDING', 'https://seu-certificado-mei-digital.online/c/'
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_api_settings WHERE id = 1);