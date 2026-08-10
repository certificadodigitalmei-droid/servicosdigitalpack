-- 1) Fila de prontidão do WhatsApp -------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_ready_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  company_name text,
  phone_e164 text NOT NULL,
  phone_canonical text,
  company_link_id uuid REFERENCES public.company_links(id) ON DELETE SET NULL,
  token text,
  status text NOT NULL DEFAULT 'ready',
  campaign_id uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'import',
  reserved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_ready_queue_status_chk
    CHECK (status IN ('ready','reserved','sent','blocked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_ready_queue_company_uidx
  ON public.whatsapp_ready_queue (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_ready_queue_phone_uidx
  ON public.whatsapp_ready_queue (phone_e164);
CREATE INDEX IF NOT EXISTS whatsapp_ready_queue_status_idx
  ON public.whatsapp_ready_queue (status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_ready_queue TO authenticated;
GRANT ALL ON public.whatsapp_ready_queue TO service_role;
ALTER TABLE public.whatsapp_ready_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_ready_queue_admin_all ON public.whatsapp_ready_queue;
CREATE POLICY wa_ready_queue_admin_all ON public.whatsapp_ready_queue
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP TRIGGER IF EXISTS whatsapp_ready_queue_updated_at ON public.whatsapp_ready_queue;
CREATE TRIGGER whatsapp_ready_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_ready_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) CNPJs permanentemente bloqueados na importação ---------------------------
CREATE TABLE IF NOT EXISTS public.blocked_import_cnpjs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'import',
  phone_raw text,
  phone_canonical text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_import_cnpjs_cnpj_uidx
  ON public.blocked_import_cnpjs (cnpj);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_import_cnpjs TO authenticated;
GRANT ALL ON public.blocked_import_cnpjs TO service_role;
ALTER TABLE public.blocked_import_cnpjs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_import_cnpjs_admin_all ON public.blocked_import_cnpjs;
CREATE POLICY blocked_import_cnpjs_admin_all ON public.blocked_import_cnpjs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- 3) Reserva atômica da fila de prontidão para uma campanha -------------------
CREATE OR REPLACE FUNCTION public.wa_reserve_ready(_campaign_id uuid, _limit integer)
RETURNS TABLE(
  company_id uuid,
  cnpj text,
  company_name text,
  phone_e164 text,
  company_link_id uuid,
  token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
      FROM public.whatsapp_ready_queue q
     WHERE q.status = 'ready'
       AND NOT EXISTS (
         SELECT 1 FROM public.whatsapp_campaign_items i
          WHERE i.campaign_id = _campaign_id AND i.company_id = q.company_id
       )
     ORDER BY q.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(_limit, 0)
  ), moved AS (
    UPDATE public.whatsapp_ready_queue q
       SET status = 'reserved',
           campaign_id = _campaign_id,
           reserved_at = now(),
           updated_at = now()
      FROM picked p
     WHERE q.id = p.id
     RETURNING q.company_id, q.cnpj, q.company_name, q.phone_e164, q.company_link_id, q.token
  )
  SELECT m.company_id, m.cnpj, m.company_name, m.phone_e164, m.company_link_id, m.token FROM moved m;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_reserve_ready(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_reserve_ready(uuid, integer) TO service_role;

-- 4) Exclusão definitiva por falha permanente do destinatário -----------------
CREATE OR REPLACE FUNCTION public.admin_purge_company_permanent(
  _company_id uuid,
  _cnpj text,
  _phone text,
  _reason text,
  _source text DEFAULT 'whatsapp'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid := _company_id;
  v_cnpj text := nullif(regexp_replace(coalesce(_cnpj,''), '\D', '', 'g'), '');
  v_phone text := nullif(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), '');
  v_paid bigint := 0;
  removed jsonb := '{}'::jsonb;
  affected bigint;
BEGIN
  IF v_company IS NULL AND v_cnpj IS NOT NULL THEN
    SELECT c.id INTO v_company FROM public.companies c WHERE c.cnpj = v_cnpj LIMIT 1;
  END IF;
  IF v_cnpj IS NULL AND v_company IS NOT NULL THEN
    SELECT c.cnpj INTO v_cnpj FROM public.companies c WHERE c.id = v_company LIMIT 1;
  END IF;

  -- Bloqueio permanente primeiro: telefone e CNPJ.
  IF v_phone IS NOT NULL THEN
    INSERT INTO public.blocked_contact_numbers
      (phone_e164, phone_canonical, reason, source, cnpj_snapshot, company_id)
    VALUES (v_phone, v_phone, coalesce(_reason,'falha permanente'), coalesce(_source,'whatsapp'), v_cnpj, v_company)
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_cnpj IS NOT NULL THEN
    INSERT INTO public.blocked_import_cnpjs (cnpj, reason, source, phone_raw, phone_canonical)
    VALUES (v_cnpj, coalesce(_reason,'falha permanente'), coalesce(_source,'whatsapp'), _phone, v_phone)
    ON CONFLICT (cnpj) DO NOTHING;
  END IF;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object('success', true, 'company_found', false, 'blocked', true, 'removed', removed);
  END IF;

  SELECT count(*) INTO v_paid FROM public.orders o
   WHERE o.company_id = v_company AND o.status = 'paid';

  DELETE FROM public.whatsapp_ready_queue WHERE company_id = v_company;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{ready_queue}', to_jsonb(affected));

  DELETE FROM public.whatsapp_campaign_items
   WHERE company_id = v_company AND status <> 'sent';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{campaign_items}', to_jsonb(affected));

  DELETE FROM public.whatsapp_queue
   WHERE company_id = v_company AND status <> 'sent';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{whatsapp_queue}', to_jsonb(affected));

  DELETE FROM public.contact_queue WHERE company_id = v_company;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{contact_queue}', to_jsonb(affected));

  DELETE FROM public.automatic_company_queue WHERE company_id = v_company;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{import_queue}', to_jsonb(affected));

  IF v_cnpj IS NOT NULL THEN
    DELETE FROM public.email_campaign_recipients
     WHERE regexp_replace(coalesce(cnpj,''), '\D', '', 'g') = v_cnpj
       AND status <> 'sent';
    GET DIAGNOSTICS affected = ROW_COUNT;
    removed := jsonb_set(removed, '{email_recipients}', to_jsonb(affected));
  END IF;

  IF v_paid = 0 THEN
    DELETE FROM public.link_events
     WHERE company_link_id IN (SELECT id FROM public.company_links WHERE company_id = v_company);
    DELETE FROM public.company_links WHERE company_id = v_company;
    GET DIAGNOSTICS affected = ROW_COUNT;
    removed := jsonb_set(removed, '{company_links}', to_jsonb(affected));

    DELETE FROM public.automation_audit_logs WHERE company_id = v_company;
    DELETE FROM public.companies WHERE id = v_company;
    GET DIAGNOSTICS affected = ROW_COUNT;
    removed := jsonb_set(removed, '{companies}', to_jsonb(affected));

    RETURN jsonb_build_object(
      'success', true, 'company_found', true, 'blocked', true,
      'company_removed', true, 'company_quarantined', false, 'removed', removed
    );
  END IF;

  -- Existe venda paga: preserva histórico financeiro, tira do marketing.
  UPDATE public.company_links SET active = false, updated_at = now()
   WHERE company_id = v_company;
  UPDATE public.companies
     SET status = 'bloqueada',
         possui_telefone = false,
         whatsapp_phone_e164 = NULL,
         telefones = '[]'::jsonb,
         ddd = NULL,
         email = NULL,
         possui_email = false,
         updated_at = now()
   WHERE id = v_company;

  RETURN jsonb_build_object(
    'success', true, 'company_found', true, 'blocked', true,
    'company_removed', false, 'company_quarantined', true, 'removed', removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_company_permanent(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_company_permanent(uuid, text, text, text, text) TO service_role;