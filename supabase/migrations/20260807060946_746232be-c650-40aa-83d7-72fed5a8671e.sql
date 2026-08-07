ALTER TABLE public.cloud_automation_settings
  ADD COLUMN IF NOT EXISTS lock_token uuid,
  ADD COLUMN IF NOT EXISTS lock_heartbeat_at timestamptz;