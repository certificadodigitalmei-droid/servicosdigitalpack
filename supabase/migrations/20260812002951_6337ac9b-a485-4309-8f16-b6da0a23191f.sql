-- 1. Colunas novas -----------------------------------------------------------
ALTER TABLE public.whatsapp_campaign_items
  ADD COLUMN IF NOT EXISTS attempt_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_started_at timestamptz;

ALTER TABLE public.whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_campaign_items_campaign_status_idx
  ON public.whatsapp_campaign_items (campaign_id, status);

-- 2. Chave de comparação de telefone (tolerante ao 9º dígito) -----------------
CREATE OR REPLACE FUNCTION public.wa_phone_key(_p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH d AS (SELECT regexp_replace(coalesce(_p, ''), '\D', '', 'g') AS v),
       n AS (SELECT CASE WHEN length(v) > 11 AND left(v, 2) = '55' THEN substr(v, 3) ELSE v END AS v FROM d)
  SELECT CASE WHEN length(v) >= 10 THEN left(v, 2) || right(v, 8) ELSE v END FROM n;
$$;

-- 3. Reserva atômica já excluindo bloqueados ---------------------------------
CREATE OR REPLACE FUNCTION public.wa_reserve_ready_v2(_campaign_id uuid, _limit integer)
RETURNS TABLE(company_id uuid, cnpj text, company_name text, phone_e164 text, company_link_id uuid, token text)
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
       AND q.company_link_id IS NOT NULL
       AND coalesce(q.token, '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM public.whatsapp_campaign_items i
          WHERE i.campaign_id = _campaign_id
            AND public.wa_phone_key(i.phone) = public.wa_phone_key(q.phone_e164)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.blocked_contact_numbers b
          WHERE public.wa_phone_key(coalesce(b.phone_e164, b.phone_canonical)) = public.wa_phone_key(q.phone_e164)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.blocked_import_cnpjs bc
          WHERE bc.cnpj = regexp_replace(coalesce(q.cnpj, ''), '\D', '', 'g')
       )
     ORDER BY q.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(coalesce(_limit, 0), 0)
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

REVOKE ALL ON FUNCTION public.wa_reserve_ready_v2(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_reserve_ready_v2(uuid, integer) TO service_role;

-- 4. Liberação transacional de itens NUNCA tentados ---------------------------
CREATE OR REPLACE FUNCTION public.wa_release_untried(_campaign_id uuid, _hard_delete boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  released integer := 0;
  requeued integer := 0;
BEGIN
  CREATE TEMP TABLE _untried ON COMMIT DROP AS
    SELECT i.id, i.company_id, i.phone
      FROM public.whatsapp_campaign_items i
     WHERE i.campaign_id = _campaign_id
       AND i.status = 'pending'
       AND i.wamid IS NULL
       AND i.accepted_at IS NULL
       AND i.sent_at IS NULL
       AND i.attempt_started_at IS NULL
       AND coalesce(i.attempts, 0) = 0;

  UPDATE public.whatsapp_ready_queue q
     SET status = 'ready', campaign_id = NULL, reserved_at = NULL, updated_at = now()
    FROM _untried u
   WHERE q.campaign_id = _campaign_id
     AND (q.company_id = u.company_id OR public.wa_phone_key(q.phone_e164) = public.wa_phone_key(u.phone))
     AND q.status = 'reserved';
  GET DIAGNOSTICS requeued = ROW_COUNT;

  IF _hard_delete THEN
    DELETE FROM public.whatsapp_campaign_items i USING _untried u WHERE i.id = u.id;
  ELSE
    UPDATE public.whatsapp_campaign_items i
       SET status = 'cancelled', error_message = 'Cancelada sem tentativa', updated_at = now()
      FROM _untried u
     WHERE i.id = u.id;
  END IF;
  GET DIAGNOSTICS released = ROW_COUNT;

  RETURN jsonb_build_object('released', released, 'requeued', requeued);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_release_untried(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_release_untried(uuid, boolean) TO service_role;

-- 5. Purge preserva histórico de tentativa ------------------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_company_permanent(_company_id uuid, _cnpj text, _phone text, _reason text, _source text DEFAULT 'whatsapp'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- HISTÓRICO PRESERVADO: só some o que nunca foi tentado.
  DELETE FROM public.whatsapp_campaign_items
   WHERE company_id = v_company
     AND status = 'pending'
     AND wamid IS NULL
     AND accepted_at IS NULL
     AND sent_at IS NULL
     AND attempt_started_at IS NULL
     AND coalesce(attempts, 0) = 0;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{campaign_items_untried}', to_jsonb(affected));

  -- Tudo que teve tentativa continua na campanha, apenas desvinculado.
  UPDATE public.whatsapp_campaign_items
     SET company_id = NULL, company_link_id = NULL, updated_at = now()
   WHERE company_id = v_company;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{campaign_items_detached}', to_jsonb(affected));

  DELETE FROM public.whatsapp_queue
   WHERE company_id = v_company AND status <> 'sent';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{whatsapp_queue}', to_jsonb(affected));
  UPDATE public.whatsapp_queue SET company_id = NULL WHERE company_id = v_company;

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
$function$;

-- 6. Reparo idempotente e auditável de campanha -------------------------------
CREATE OR REPLACE FUNCTION public.wa_repair_campaign(_campaign_id uuid, _apply boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  before_state jsonb;
  after_state jsonb;
  v_correlated integer := 0;
  v_restored integer := 0;
  v_pending_conf integer := 0;
  v_orphans integer := 0;
  v_started timestamptz;
  v_name text;
  r record;
BEGIN
  SELECT name, coalesce(started_at, created_at) INTO v_name, v_started
    FROM public.whatsapp_campaigns WHERE id = _campaign_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campanha não encontrada');
  END IF;

  SELECT jsonb_build_object(
    'items', (SELECT count(*) FROM public.whatsapp_campaign_items WHERE campaign_id = _campaign_id),
    'by_status', (SELECT coalesce(jsonb_object_agg(s, n), '{}'::jsonb) FROM (
        SELECT status s, count(*) n FROM public.whatsapp_campaign_items
         WHERE campaign_id = _campaign_id GROUP BY 1) x),
    'unlinked_events', (SELECT count(*) FROM public.whatsapp_message_events WHERE campaign_item_id IS NULL),
    'audit', (SELECT count(*) FROM public.whatsapp_failure_audit WHERE campaign_id = _campaign_id),
    'ready', (SELECT count(*) FROM public.whatsapp_ready_queue WHERE status = 'ready'),
    'reserved', (SELECT count(*) FROM public.whatsapp_ready_queue WHERE status = 'reserved'),
    'blocked', (SELECT count(*) FROM public.blocked_contact_numbers)
  ) INTO before_state;

  IF NOT _apply THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'before', before_state);
  END IF;

  -- 6.1 Correlaciona eventos soltos com itens sem wamid, por telefone único.
  FOR r IN
    WITH ev AS (
      SELECT public.wa_phone_key(e.recipient) AS k,
             (array_agg(e.wamid ORDER BY CASE e.status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3
                                                        WHEN 'failed' THEN 5 WHEN 'sent' THEN 2 ELSE 1 END DESC,
                                          e.occurred_at DESC))[1] AS wamid,
             (array_agg(e.status ORDER BY CASE e.status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3
                                                        WHEN 'failed' THEN 5 WHEN 'sent' THEN 2 ELSE 1 END DESC,
                                          e.occurred_at DESC))[1] AS status,
             max(e.occurred_at) AS occurred_at,
             (array_agg(e.error_code ORDER BY e.occurred_at DESC))[1] AS error_code,
             (array_agg(e.error_title ORDER BY e.occurred_at DESC))[1] AS error_title,
             count(DISTINCT e.recipient) AS recipients
        FROM public.whatsapp_message_events e
       WHERE e.campaign_item_id IS NULL
         AND e.recipient IS NOT NULL
         AND e.occurred_at >= v_started - interval '2 hours'
       GROUP BY 1
    ), it AS (
      SELECT public.wa_phone_key(i.phone) AS k, count(*) AS n, min(i.id) AS id
        FROM public.whatsapp_campaign_items i
       WHERE i.campaign_id = _campaign_id
         AND i.wamid IS NULL
         AND i.status IN ('sending', 'confirmation_pending', 'pending')
       GROUP BY 1
    )
    SELECT it.id, ev.wamid, ev.status, ev.occurred_at, ev.error_code, ev.error_title
      FROM ev JOIN it ON it.k = ev.k
     WHERE it.n = 1
  LOOP
    UPDATE public.whatsapp_campaign_items
       SET wamid = r.wamid,
           delivery_status = r.status,
           status = CASE WHEN r.status = 'failed' THEN 'blocked' ELSE 'sent' END,
           accepted_at = coalesce(accepted_at, r.occurred_at),
           sent_at = CASE WHEN r.status <> 'failed' THEN coalesce(sent_at, r.occurred_at) ELSE sent_at END,
           delivered_at = CASE WHEN r.status IN ('delivered', 'read') THEN coalesce(delivered_at, r.occurred_at) ELSE delivered_at END,
           read_at = CASE WHEN r.status = 'read' THEN coalesce(read_at, r.occurred_at) ELSE read_at END,
           failed_at = CASE WHEN r.status = 'failed' THEN coalesce(failed_at, r.occurred_at) ELSE failed_at END,
           error_code = coalesce(r.error_code, error_code),
           error_title = coalesce(r.error_title, error_title),
           error_message = CASE WHEN r.status = 'failed' THEN coalesce(error_message, r.error_title, r.error_code) ELSE error_message END,
           locked_at = NULL,
           lock_token = NULL,
           updated_at = now()
     WHERE id = r.id;
    v_correlated := v_correlated + 1;

    UPDATE public.whatsapp_message_events SET campaign_item_id = r.id
     WHERE wamid = r.wamid AND campaign_item_id IS NULL;
  END LOOP;

  -- 6.2 Restaura rejeitados apagados, a partir da auditoria de falhas.
  INSERT INTO public.whatsapp_campaign_items
    (campaign_id, company_id, company_link_id, company_name, cnpj, phone, token, template_name,
     status, delivery_status, wamid, error_code, error_title, error_message,
     attempts, accepted_at, failed_at, sender_phone_number_id, sender_waba_id, created_at)
  SELECT a.campaign_id, NULL, NULL, a.company_name, a.cnpj, a.phone_e164, NULL,
         coalesce(a.template_name, c.template_name),
         'blocked', 'failed', a.wamid, a.error_code, a.reason, a.reason,
         1, a.created_at, a.created_at, c.sender_phone_number_id, c.sender_waba_id, a.created_at
    FROM public.whatsapp_failure_audit a
    JOIN public.whatsapp_campaigns c ON c.id = a.campaign_id
   WHERE a.campaign_id = _campaign_id
     AND NOT EXISTS (
       SELECT 1 FROM public.whatsapp_campaign_items i
        WHERE i.campaign_id = _campaign_id
          AND public.wa_phone_key(i.phone) = public.wa_phone_key(a.phone_e164)
     );
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  -- 6.3 Sem evento correlacionável: confirmação pendente (nunca "falha").
  UPDATE public.whatsapp_campaign_items
     SET status = 'confirmation_pending',
         error_message = 'Chamada aceita pela API sem confirmação registrada — não reenviar automaticamente.',
         locked_at = NULL,
         lock_token = NULL,
         updated_at = now()
   WHERE campaign_id = _campaign_id
     AND status = 'sending'
     AND wamid IS NULL;
  GET DIAGNOSTICS v_pending_conf = ROW_COUNT;

  -- 6.4 Encerra a campanha (nunca retoma).
  UPDATE public.whatsapp_campaigns
     SET status = CASE WHEN v_pending_conf > 0
                         OR EXISTS (SELECT 1 FROM public.whatsapp_campaign_items
                                     WHERE campaign_id = _campaign_id AND status = 'confirmation_pending')
                       THEN 'finished_partial' ELSE 'finished' END,
         finished_at = coalesce(finished_at, now()),
         next_send_at = NULL,
         updated_at = now()
   WHERE id = _campaign_id AND status <> 'running';

  -- 6.5 Reservas órfãs: sem item de campanha correspondente.
  WITH orphan AS (
    SELECT q.id, q.phone_e164, q.cnpj
      FROM public.whatsapp_ready_queue q
     WHERE q.status = 'reserved'
       AND NOT EXISTS (
         SELECT 1 FROM public.whatsapp_campaign_items i
          WHERE i.campaign_id = q.campaign_id
            AND public.wa_phone_key(i.phone) = public.wa_phone_key(q.phone_e164)
       )
  ), blocked AS (
    DELETE FROM public.whatsapp_ready_queue q
     USING orphan o
     WHERE q.id = o.id
       AND (EXISTS (SELECT 1 FROM public.blocked_contact_numbers b
                     WHERE public.wa_phone_key(coalesce(b.phone_e164, b.phone_canonical)) = public.wa_phone_key(o.phone_e164))
            OR EXISTS (SELECT 1 FROM public.blocked_import_cnpjs bc
                        WHERE bc.cnpj = regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')))
     RETURNING q.id
  ), freed AS (
    UPDATE public.whatsapp_ready_queue q
       SET status = 'ready', campaign_id = NULL, reserved_at = NULL, updated_at = now()
      FROM orphan o
     WHERE q.id = o.id
       AND q.id NOT IN (SELECT id FROM blocked)
     RETURNING q.id
  )
  SELECT (SELECT count(*) FROM blocked) + (SELECT count(*) FROM freed) INTO v_orphans;

  SELECT jsonb_build_object(
    'items', (SELECT count(*) FROM public.whatsapp_campaign_items WHERE campaign_id = _campaign_id),
    'by_status', (SELECT coalesce(jsonb_object_agg(s, n), '{}'::jsonb) FROM (
        SELECT status s, count(*) n FROM public.whatsapp_campaign_items
         WHERE campaign_id = _campaign_id GROUP BY 1) x),
    'by_delivery', (SELECT coalesce(jsonb_object_agg(s, n), '{}'::jsonb) FROM (
        SELECT coalesce(delivery_status, 'none') s, count(*) n FROM public.whatsapp_campaign_items
         WHERE campaign_id = _campaign_id GROUP BY 1) x),
    'unlinked_events', (SELECT count(*) FROM public.whatsapp_message_events WHERE campaign_item_id IS NULL),
    'audit', (SELECT count(*) FROM public.whatsapp_failure_audit WHERE campaign_id = _campaign_id),
    'ready', (SELECT count(*) FROM public.whatsapp_ready_queue WHERE status = 'ready'),
    'reserved', (SELECT count(*) FROM public.whatsapp_ready_queue WHERE status = 'reserved'),
    'blocked', (SELECT count(*) FROM public.blocked_contact_numbers),
    'campaign_status', (SELECT status FROM public.whatsapp_campaigns WHERE id = _campaign_id)
  ) INTO after_state;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true,
    'campaign', v_name,
    'correlated', v_correlated,
    'restored', v_restored,
    'confirmation_pending', v_pending_conf,
    'orphan_reservations', v_orphans,
    'before', before_state,
    'after', after_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wa_repair_campaign(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_repair_campaign(uuid, boolean) TO service_role;