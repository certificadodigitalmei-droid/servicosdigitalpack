ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_recovery_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_recovery_last_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_recovery_idx
  ON public.orders (status, email_recovery_last_at);