CREATE TABLE IF NOT EXISTS public.campaign_variant_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  variant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.campaign_variant_settings TO authenticated;
GRANT ALL ON public.campaign_variant_settings TO service_role;

ALTER TABLE public.campaign_variant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage campaign variant settings"
ON public.campaign_variant_settings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

INSERT INTO public.campaign_variant_settings (id, variant_ids)
VALUES (1, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;