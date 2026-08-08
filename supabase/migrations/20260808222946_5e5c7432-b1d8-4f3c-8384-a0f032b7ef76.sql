CREATE TABLE IF NOT EXISTS public.blocked_contact_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text UNIQUE,
  phone_canonical text,
  reason text NOT NULL DEFAULT 'permanent_recipient_error',
  source text NOT NULL DEFAULT 'whatsapp',
  cnpj_snapshot text,
  company_id uuid,
  provider_status integer,
  provider_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_contact_numbers TO authenticated;
GRANT ALL ON public.blocked_contact_numbers TO service_role;

ALTER TABLE public.blocked_contact_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage blocked numbers"
ON public.blocked_contact_numbers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS blocked_contact_numbers_canonical_uidx
  ON public.blocked_contact_numbers (phone_canonical)
  WHERE phone_canonical IS NOT NULL;
CREATE INDEX IF NOT EXISTS blocked_contact_numbers_company_idx ON public.blocked_contact_numbers (company_id);
CREATE INDEX IF NOT EXISTS blocked_contact_numbers_cnpj_idx ON public.blocked_contact_numbers (cnpj_snapshot);

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS whatsapp_phone_e164 text;
CREATE INDEX IF NOT EXISTS companies_whatsapp_phone_idx ON public.companies (whatsapp_phone_e164);