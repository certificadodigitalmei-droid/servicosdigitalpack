
CREATE TABLE IF NOT EXISTS public.casa_dos_dados_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  api_base_url TEXT,
  api_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT casa_dos_dados_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.casa_dos_dados_settings TO authenticated;
GRANT ALL ON public.casa_dos_dados_settings TO service_role;

ALTER TABLE public.casa_dos_dados_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage casa dos dados settings"
  ON public.casa_dos_dados_settings
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

INSERT INTO public.casa_dos_dados_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
