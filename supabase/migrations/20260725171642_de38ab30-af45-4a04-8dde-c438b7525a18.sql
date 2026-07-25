DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders','company_links','link_events','email_send_queue',
    'automatic_company_query_runs','satellite_jobs','email_workers',
    'companies','payment_gateways','automatic_company_queries'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;