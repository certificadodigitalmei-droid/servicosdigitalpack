CREATE OR REPLACE FUNCTION public.admin_cleanup_unpaid_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  removed jsonb := '{}'::jsonb;
  remaining jsonb := '{}'::jsonb;
  affected bigint;
  unprotected_companies bigint;
  unprotected_links bigint;
  main_email_queue bigint;
  import_queue bigint;
  whatsapp_queue_count bigint;
BEGIN
  LOCK TABLE
    public.orders,
    public.consent_logs,
    public.customers,
    public.companies,
    public.company_links,
    public.link_generations,
    public.link_events,
    public.contact_queue,
    public.email_send_queue,
    public.email_campaign_recipients,
    public.email_campaigns,
    public.automatic_company_queue,
    public.automatic_company_query_runs,
    public.automatic_company_queries,
    public.automation_audit_logs,
    public.whatsapp_queue,
    public.whatsapp_campaign_items,
    public.whatsapp_campaigns,
    public.api_logs,
    public.webhook_events,
    public.sync_runs,
    public.suppression_list,
    public.cloud_automation_settings
  IN EXCLUSIVE MODE;

  DELETE FROM public.api_logs;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{api_logs}', to_jsonb(affected));

  DELETE FROM public.webhook_events;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{webhook_events}', to_jsonb(affected));

  DELETE FROM public.sync_runs;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{sync_runs}', to_jsonb(affected));

  DELETE FROM public.automation_audit_logs;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{automation_audit_logs}', to_jsonb(affected));

  DELETE FROM public.link_events;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{link_events}', to_jsonb(affected));

  DELETE FROM public.contact_queue;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{contact_queue}', to_jsonb(affected));

  DELETE FROM public.email_send_queue;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{email_send_queue}', to_jsonb(affected));

  DELETE FROM public.email_campaign_recipients;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{email_campaign_recipients}', to_jsonb(affected));

  DELETE FROM public.email_campaigns;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{email_campaigns}', to_jsonb(affected));

  DELETE FROM public.whatsapp_queue;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{whatsapp_queue}', to_jsonb(affected));

  DELETE FROM public.whatsapp_campaign_items;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{whatsapp_campaign_items}', to_jsonb(affected));

  DELETE FROM public.whatsapp_campaigns;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{whatsapp_campaigns}', to_jsonb(affected));

  DELETE FROM public.automatic_company_queue;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{automatic_company_queue}', to_jsonb(affected));

  DELETE FROM public.automatic_company_query_runs;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{automatic_company_query_runs}', to_jsonb(affected));

  DELETE FROM public.suppression_list;
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{suppression_list}', to_jsonb(affected));

  DELETE FROM public.consent_logs c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = c.order_id AND o.status = 'paid'
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{consent_logs}', to_jsonb(affected));

  DELETE FROM public.orders
  WHERE status <> 'paid';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{orders}', to_jsonb(affected));

  DELETE FROM public.company_links l
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.orders o
    LEFT JOIN public.companies c ON c.id = l.company_id
    WHERE o.status = 'paid'
      AND (
        o.public_link_id = l.id
        OR (o.company_id IS NOT NULL AND o.company_id = l.company_id)
        OR (o.company_id IS NULL AND o.reference_cnpj IS NOT NULL AND o.reference_cnpj = c.cnpj)
      )
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{company_links}', to_jsonb(affected));

  DELETE FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.status = 'paid'
      AND (
        o.company_id = c.id
        OR (o.company_id IS NULL AND o.reference_cnpj IS NOT NULL AND o.reference_cnpj = c.cnpj)
      )
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{companies}', to_jsonb(affected));

  DELETE FROM public.customers c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.status = 'paid' AND o.customer_id = c.id
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{customers}', to_jsonb(affected));

  DELETE FROM public.link_generations g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_links l WHERE l.generation_id = g.id
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := jsonb_set(removed, '{link_generations}', to_jsonb(affected));

  UPDATE public.automatic_company_queries
  SET enabled = false,
      status = 'inactive',
      pagination_cursors = '{}'::jsonb,
      last_run_at = NULL,
      next_run_at = NULL,
      last_error = NULL,
      heartbeat_at = NULL,
      lock_token = NULL,
      updated_at = now();

  UPDATE public.cloud_automation_settings
  SET enabled = false,
      status = 'idle',
      lock_token = NULL,
      lock_heartbeat_at = NULL,
      updated_at = now();

  SELECT count(*) INTO unprotected_companies
  FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.status = 'paid'
      AND (
        o.company_id = c.id
        OR (o.company_id IS NULL AND o.reference_cnpj IS NOT NULL AND o.reference_cnpj = c.cnpj)
      )
  );

  SELECT count(*) INTO unprotected_links
  FROM public.company_links l
  LEFT JOIN public.companies c ON c.id = l.company_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.status = 'paid'
      AND (
        o.public_link_id = l.id
        OR (o.company_id IS NOT NULL AND o.company_id = l.company_id)
        OR (o.company_id IS NULL AND o.reference_cnpj IS NOT NULL AND o.reference_cnpj = c.cnpj)
      )
  );

  SELECT count(*) INTO main_email_queue FROM public.email_send_queue;
  SELECT count(*) INTO import_queue FROM public.automatic_company_queue;
  SELECT count(*) INTO whatsapp_queue_count FROM public.whatsapp_queue;

  remaining := jsonb_build_object(
    'companies', (SELECT count(*) FROM public.companies),
    'company_links', (SELECT count(*) FROM public.company_links),
    'orders_paid', (SELECT count(*) FROM public.orders WHERE status = 'paid'),
    'customers', (SELECT count(*) FROM public.customers),
    'email_send_queue', main_email_queue,
    'contact_queue', (SELECT count(*) FROM public.contact_queue),
    'automatic_company_queue', import_queue,
    'email_campaign_recipients', (SELECT count(*) FROM public.email_campaign_recipients),
    'whatsapp_queue', whatsapp_queue_count,
    'whatsapp_campaign_items', (SELECT count(*) FROM public.whatsapp_campaign_items),
    'unprotected_companies', unprotected_companies,
    'unprotected_company_links', unprotected_links
  );

  IF unprotected_companies <> 0
     OR unprotected_links <> 0
     OR main_email_queue <> 0
     OR import_queue <> 0
     OR whatsapp_queue_count <> 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'cleanup post-condition failed',
      DETAIL = remaining::text,
      HINT = 'No changes were committed; inspect the remaining counts and foreign-key dependencies.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'removed', removed,
    'remaining', remaining,
    'message', 'Limpeza concluída e pós-condições verificadas.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cleanup_unpaid_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_unpaid_data() TO service_role;