
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  document TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can insert customers" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TYPE public.order_status AS ENUM ('pending','awaiting_payment','paid','expired','cancelled','refunded','failed');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  reference_cnpj TEXT,
  reference_name TEXT,
  product_name TEXT NOT NULL DEFAULT 'Apoio Digital para MEI',
  amount NUMERIC(12,2) NOT NULL DEFAULT 97.00,
  status public.order_status NOT NULL DEFAULT 'pending',
  payment_provider TEXT,
  external_transaction_id TEXT,
  pix_code TEXT,
  pix_qr_code TEXT,
  pix_expiration TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can insert orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  external_event_id TEXT,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  privacy_accepted BOOLEAN NOT NULL DEFAULT false,
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  service_private_acknowledged BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.consent_logs TO anon, authenticated;
GRANT ALL ON public.consent_logs TO service_role;
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can insert consent" ON public.consent_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
