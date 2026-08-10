ALTER TABLE public.whatsapp_campaign_items
  ADD COLUMN IF NOT EXISTS wamid text,
  ADD COLUMN IF NOT EXISTS provider_internal_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_title text,
  ADD COLUMN IF NOT EXISTS error_details text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_campaign_items_wamid_key
  ON public.whatsapp_campaign_items (wamid) WHERE wamid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid text NOT NULL,
  campaign_item_id uuid REFERENCES public.whatsapp_campaign_items(id) ON DELETE SET NULL,
  status text NOT NULL,
  recipient text,
  error_code text,
  error_title text,
  error_details text,
  raw jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_message_events_unique
  ON public.whatsapp_message_events (wamid, status);
CREATE INDEX IF NOT EXISTS whatsapp_message_events_created_idx
  ON public.whatsapp_message_events (created_at DESC);

GRANT SELECT ON public.whatsapp_message_events TO authenticated;
GRANT ALL ON public.whatsapp_message_events TO service_role;
ALTER TABLE public.whatsapp_message_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read whatsapp message events"
  ON public.whatsapp_message_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.whatsapp_failure_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text,
  company_id uuid,
  company_name text,
  cnpj text,
  campaign_id uuid,
  template_name text,
  wamid text,
  error_code text,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'whatsapp',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_failure_audit_created_idx
  ON public.whatsapp_failure_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_failure_audit_phone_idx
  ON public.whatsapp_failure_audit (phone_e164);

GRANT SELECT ON public.whatsapp_failure_audit TO authenticated;
GRANT ALL ON public.whatsapp_failure_audit TO service_role;
ALTER TABLE public.whatsapp_failure_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read whatsapp failure audit"
  ON public.whatsapp_failure_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));