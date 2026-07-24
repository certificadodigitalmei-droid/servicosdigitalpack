
CREATE TABLE IF NOT EXISTS public.site_display_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  show_cert_landing boolean NOT NULL DEFAULT true,
  show_cert_success boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_display_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.site_display_settings TO anon, authenticated;
GRANT ALL ON public.site_display_settings TO service_role;

ALTER TABLE public.site_display_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read display settings"
  ON public.site_display_settings FOR SELECT
  USING (true);

INSERT INTO public.site_display_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
