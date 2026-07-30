ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_pix_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_paid_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_pending_reminder_idx
  ON public.orders (created_at)
  WHERE status = 'awaiting_payment' AND email_reminder_sent_at IS NULL;