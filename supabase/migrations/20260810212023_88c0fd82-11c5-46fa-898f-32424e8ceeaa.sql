CREATE TABLE IF NOT EXISTS public.whatsapp_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL,
  phone_number_id text NOT NULL,
  waba_id text,
  display_phone_number text,
  verified_name text,
  status text,
  chakra_status text,
  quality_score text,
  messaging_limit_tier text,
  account_mode text,
  name_status text,
  is_active boolean NOT NULL DEFAULT false,
  is_selected boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_senders_plugin_phone_key UNIQUE (plugin_id, phone_number_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_senders TO authenticated;
GRANT ALL ON public.whatsapp_senders TO service_role;

ALTER TABLE public.whatsapp_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage whatsapp senders"
ON public.whatsapp_senders FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS whatsapp_senders_updated_at ON public.whatsapp_senders;
CREATE TRIGGER whatsapp_senders_updated_at
BEFORE UPDATE ON public.whatsapp_senders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Modelos passam a pertencer a uma WABA -------------------------------------
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS waba_id text;

DELETE FROM public.whatsapp_templates WHERE true;

ALTER TABLE public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_name_key;
DROP INDEX IF EXISTS public.whatsapp_templates_name_key;
DROP INDEX IF EXISTS public.whatsapp_templates_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_waba_name_lang_key
  ON public.whatsapp_templates (waba_id, name, language);

-- Snapshot do remetente no histórico ----------------------------------------
ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS sender_phone_number_id text,
  ADD COLUMN IF NOT EXISTS sender_waba_id text;

ALTER TABLE public.whatsapp_campaign_items
  ADD COLUMN IF NOT EXISTS sender_phone_number_id text,
  ADD COLUMN IF NOT EXISTS sender_waba_id text;

-- Troca imediata e segura da conexão ativa ----------------------------------
UPDATE public.whatsapp_api_settings
   SET provider = 'chakrahq',
       base_url = 'https://api.chakrahq.com',
       plugin_id = '3f095662-d969-42b0-a41e-e729e1f46328',
       whatsapp_phone_number_id = '1235744579622400',
       waba_id = '1017869177527684',
       template_name = 'atualizacao_solicitacao_certificado_v1',
       template_language = 'pt_BR',
       template_status = 'PENDING',
       active = false,
       last_error = NULL,
       updated_at = now()
 WHERE id = 1;

INSERT INTO public.whatsapp_senders
  (plugin_id, phone_number_id, waba_id, display_phone_number, status, is_active, is_selected)
VALUES
  ('3f095662-d969-42b0-a41e-e729e1f46328', '1235744579622400', '1017869177527684', '+55 11 95421-1075', 'UNKNOWN', false, true)
ON CONFLICT (plugin_id, phone_number_id) DO UPDATE SET is_selected = true, updated_at = now();