ALTER TABLE public.cloud_automation_settings
  ADD COLUMN IF NOT EXISTS send_profile text NOT NULL DEFAULT 'moderado',
  ADD COLUMN IF NOT EXISTS burst_concurrency integer NOT NULL DEFAULT 10;