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

  FOR r IN
    WITH ev AS (
      SELECT public.wa_phone_key(e.recipient) AS k,
             (array_agg(e.wamid ORDER BY CASE e.status WHEN 'failed' THEN 5 WHEN 'read' THEN 4
                                                        WHEN 'delivered' THEN 3 WHEN 'sent' THEN 2 ELSE 1 END DESC,
                                          e.occurred_at DESC))[1] AS wamid,
             (array_agg(e.status ORDER BY CASE e.status WHEN 'failed' THEN 5 WHEN 'read' THEN 4
                                                        WHEN 'delivered' THEN 3 WHEN 'sent' THEN 2 ELSE 1 END DESC,
                                          e.occurred_at DESC))[1] AS status,
             max(e.occurred_at) AS occurred_at,
             (array_agg(e.error_code ORDER BY e.occurred_at DESC))[1] AS error_code,
             (array_agg(e.error_title ORDER BY e.occurred_at DESC))[1] AS error_title
        FROM public.whatsapp_message_events e
       WHERE e.campaign_item_id IS NULL
         AND e.recipient IS NOT NULL
         AND e.occurred_at >= v_started - interval '2 hours'
       GROUP BY 1
    ), it AS (
      SELECT public.wa_phone_key(i.phone) AS k, count(*) AS n, (array_agg(i.id))[1] AS id
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

  UPDATE public.whatsapp_campaigns
     SET status = CASE WHEN EXISTS (SELECT 1 FROM public.whatsapp_campaign_items
                                     WHERE campaign_id = _campaign_id AND status = 'confirmation_pending')
                       THEN 'finished_partial' ELSE 'finished' END,
         finished_at = coalesce(finished_at, now()),
         next_send_at = NULL,
         updated_at = now()
   WHERE id = _campaign_id AND status <> 'running';

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

DO $$
DECLARE res jsonb;
BEGIN
  res := public.wa_repair_campaign('411da891-7901-4734-9a4b-75f088968a63'::uuid, true);
  INSERT INTO public.automation_audit_logs (event_type, details)
  VALUES ('whatsapp_campaign_repair', res);
END $$;