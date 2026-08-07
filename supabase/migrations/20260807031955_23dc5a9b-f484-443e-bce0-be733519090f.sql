ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS webhook_secret text;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.payment_gateways'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%provider_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.payment_gateways DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_provider_type_check
  CHECK (provider_type IN ('sigilopay', 'syncpay', 'mercadopago'));

ALTER TABLE public.payment_gateways
  ADD CONSTRAINT payment_gateways_environment_check
  CHECK (environment IN ('test', 'production'));