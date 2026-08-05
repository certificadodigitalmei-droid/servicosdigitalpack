ALTER TABLE public.cloud_automation_settings
  ADD COLUMN IF NOT EXISTS import_batch_size integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'burst',
  ADD COLUMN IF NOT EXISTS hourly_batch_size integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS paced_delay_sec integer NOT NULL DEFAULT 36;

INSERT INTO public.cloud_automation_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;