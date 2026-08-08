CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  language text NOT NULL DEFAULT 'pt_BR',
  category text,
  status text NOT NULL DEFAULT 'PENDING',
  header_text text,
  body_text text,
  footer_text text,
  button_label text,
  button_url_base text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_templates_admin_all" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE TRIGGER whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'pt_BR',
  status text NOT NULL DEFAULT 'draft',
  pace_preset text NOT NULL DEFAULT 'recommended',
  interval_seconds integer NOT NULL DEFAULT 30,
  target_count integer NOT NULL DEFAULT 50,
  daily_unique_cap integer NOT NULL DEFAULT 250,
  continuous_mode boolean NOT NULL DEFAULT false,
  next_send_at timestamptz,
  paused_reason text,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_campaigns_admin_all" ON public.whatsapp_campaigns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_status ON public.whatsapp_campaigns(status, next_send_at);
CREATE TRIGGER whatsapp_campaigns_updated_at BEFORE UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_link_id uuid REFERENCES public.company_links(id) ON DELETE SET NULL,
  company_name text,
  cnpj text,
  phone text NOT NULL,
  token text,
  template_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token uuid,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaign_items TO authenticated;
GRANT ALL ON public.whatsapp_campaign_items TO service_role;
ALTER TABLE public.whatsapp_campaign_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_campaign_items_admin_all" ON public.whatsapp_campaign_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_items_campaign_company ON public.whatsapp_campaign_items(campaign_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_items_campaign_phone_template ON public.whatsapp_campaign_items(campaign_id, phone, template_name);
CREATE INDEX IF NOT EXISTS idx_wa_items_queue ON public.whatsapp_campaign_items(campaign_id, status, next_attempt_at);
CREATE TRIGGER whatsapp_campaign_items_updated_at BEFORE UPDATE ON public.whatsapp_campaign_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.wa_campaign_claim_item(_campaign_id uuid)
RETURNS TABLE(id uuid, company_id uuid, company_name text, cnpj text, phone text, token text, template_name text, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  claimed uuid;
BEGIN
  -- Autorização é feita na camada de API: EXECUTE só é concedido a service_role.
  UPDATE public.whatsapp_campaign_items i
     SET status = 'sending', locked_at = now(), lock_token = gen_random_uuid(), attempts = i.attempts + 1
   WHERE i.id = (
     SELECT c.id FROM public.whatsapp_campaign_items c
      WHERE c.campaign_id = _campaign_id
        AND c.status = 'pending'
        AND c.next_attempt_at <= now()
      ORDER BY c.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
   RETURNING i.id INTO claimed;

  IF claimed IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT i.id, i.company_id, i.company_name, i.cnpj, i.phone, i.token, i.template_name, i.attempts
      FROM public.whatsapp_campaign_items i
     WHERE i.id = claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.wa_campaign_claim_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_campaign_claim_item(uuid) TO service_role;