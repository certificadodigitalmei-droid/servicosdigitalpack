ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS recovery_discount_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recovery_discount_amount numeric NOT NULL DEFAULT 56.99,
  ADD COLUMN IF NOT EXISTS recovery_discount_hours integer NOT NULL DEFAULT 24;