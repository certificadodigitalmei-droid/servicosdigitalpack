CREATE TABLE public.cloud_automation_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  status text NOT NULL DEFAULT 'idle',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cloud_automation_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.cloud_automation_settings TO authenticated;
GRANT ALL ON public.cloud_automation_settings TO service_role;

ALTER TABLE public.cloud_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cloud automation settings"
  ON public.cloud_automation_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert cloud automation settings"
  ON public.cloud_automation_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update cloud automation settings"
  ON public.cloud_automation_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER cloud_automation_settings_updated_at
  BEFORE UPDATE ON public.cloud_automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cloud_automation_settings (id, enabled) VALUES (1, false);