
CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('uniaopay','nexuspay')),
  api_key text NOT NULL,
  base_url text,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_gateways_only_one_active
  ON public.payment_gateways ((is_active))
  WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment gateways"
  ON public.payment_gateways
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE TRIGGER payment_gateways_set_updated_at
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Semeia UniãoPay a partir do secret existente (só como registro; a chave real permanece no secret).
INSERT INTO public.payment_gateways (name, provider_type, api_key, base_url, is_active, notes)
VALUES ('UniãoPay (padrão)', 'uniaopay', 'USE_ENV_UNIAOPAY_API_KEY', 'https://uniao7pay.shop/api/v1/uniaopay', true,
        'Chave real lida do secret UNIAOPAY_API_KEY quando api_key = USE_ENV_UNIAOPAY_API_KEY.');
