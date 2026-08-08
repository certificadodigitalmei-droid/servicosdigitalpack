CREATE TABLE IF NOT EXISTS public.whatsapp_api_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  provider text NOT NULL DEFAULT 'chakrahq',
  base_url text NOT NULL DEFAULT 'https://api.chakrahq.com',
  channel_id text,
  template_name text,
  template_language text NOT NULL DEFAULT 'pt_BR',
  template_body text,
  variable_map jsonb NOT NULL DEFAULT '["company_name","cnpj","link"]'::jsonb,
  active boolean NOT NULL DEFAULT false,
  daily_limit integer NOT NULL DEFAULT 300,
  batch_size integer NOT NULL DEFAULT 20,
  min_delay_ms integer NOT NULL DEFAULT 4000,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_api_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_api_settings TO authenticated;
GRANT ALL ON public.whatsapp_api_settings TO service_role;

ALTER TABLE public.whatsapp_api_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage whatsapp api settings" ON public.whatsapp_api_settings;
CREATE POLICY "Admins manage whatsapp api settings"
  ON public.whatsapp_api_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS whatsapp_api_settings_updated_at ON public.whatsapp_api_settings;
CREATE TRIGGER whatsapp_api_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_api_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.whatsapp_api_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;