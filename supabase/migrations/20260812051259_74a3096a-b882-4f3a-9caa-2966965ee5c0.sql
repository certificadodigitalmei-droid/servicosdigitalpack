CREATE TABLE IF NOT EXISTS public.whatsapp_autopilot_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  batch_size integer NOT NULL DEFAULT 20,
  rest_minutes integer NOT NULL DEFAULT 25,
  min_interval_seconds integer NOT NULL DEFAULT 40,
  max_interval_seconds integer NOT NULL DEFAULT 110,
  daily_cap integer NOT NULL DEFAULT 250,
  window_start smallint NOT NULL DEFAULT 8,
  window_end smallint NOT NULL DEFAULT 20,
  template_name text,
  sender_phone_number_id text,
  sequence integer NOT NULL DEFAULT 0,
  last_batch_at timestamptz,
  next_batch_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_autopilot_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.whatsapp_autopilot_settings TO authenticated;
GRANT ALL ON public.whatsapp_autopilot_settings TO service_role;

ALTER TABLE public.whatsapp_autopilot_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_autopilot_admin_all ON public.whatsapp_autopilot_settings;
CREATE POLICY wa_autopilot_admin_all ON public.whatsapp_autopilot_settings
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role));

INSERT INTO public.whatsapp_autopilot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS min_interval_seconds integer,
  ADD COLUMN IF NOT EXISTS max_interval_seconds integer,
  ADD COLUMN IF NOT EXISTS autopilot boolean NOT NULL DEFAULT false;