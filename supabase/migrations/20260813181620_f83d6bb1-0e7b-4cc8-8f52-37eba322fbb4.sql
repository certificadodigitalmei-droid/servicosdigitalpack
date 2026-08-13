ALTER TABLE public.cloud_automation_settings
  ADD COLUMN IF NOT EXISTS warmup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;

UPDATE public.cloud_automation_settings
   SET warmup_started_at = COALESCE(warmup_started_at, now())
 WHERE id = 1;