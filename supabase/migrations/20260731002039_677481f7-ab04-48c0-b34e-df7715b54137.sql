ALTER TABLE public.company_links
  ADD COLUMN IF NOT EXISTS discount_amount_cents integer,
  ADD COLUMN IF NOT EXISTS discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_email_count integer NOT NULL DEFAULT 0;