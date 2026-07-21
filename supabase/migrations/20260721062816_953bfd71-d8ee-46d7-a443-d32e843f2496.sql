ALTER TABLE public.automatic_company_queries
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_token UUID;

ALTER TABLE public.automatic_company_query_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovered_reason TEXT;

CREATE OR REPLACE FUNCTION public.recover_stale_automations(_older_than interval DEFAULT interval '10 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recovered_count integer := 0;
BEGIN
  WITH stale AS (
    SELECT q.id AS automation_id, q.enabled
    FROM public.automatic_company_queries q
    WHERE q.status = 'running'
      AND COALESCE(q.heartbeat_at, q.updated_at, q.last_run_at, q.created_at) < now() - _older_than
  ), updated_runs AS (
    UPDATE public.automatic_company_query_runs r
       SET status = 'error',
           finished_at = COALESCE(r.finished_at, now()),
           heartbeat_at = now(),
           error_message = COALESCE(r.error_message, 'Execução interrompida ou excedeu o tempo limite'),
           recovered_reason = 'stale_run_recovered',
           api_summary = jsonb_set(
             jsonb_set(COALESCE(r.api_summary, '{}'::jsonb), '{stale_run_recovered}', 'true'::jsonb, true),
             '{recovered_at}', to_jsonb(now()), true
           )
      FROM stale s
     WHERE r.automation_id = s.automation_id
       AND r.status = 'running'
     RETURNING r.automation_id
  ), updated_automations AS (
    UPDATE public.automatic_company_queries q
       SET status = CASE WHEN q.enabled THEN 'active' ELSE 'inactive' END,
           heartbeat_at = NULL,
           lock_token = NULL,
           last_error = 'Execução interrompida ou excedeu o tempo limite',
           updated_at = now()
      FROM stale s
     WHERE q.id = s.automation_id
     RETURNING q.id
  )
  SELECT count(*) INTO recovered_count FROM updated_automations;

  RETURN recovered_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recover_stale_automations(interval) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_automations(interval) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_due_automation()
 RETURNS TABLE(id uuid, owner_user_id uuid, mode text, quantity_per_run integer, interval_minutes integer, filters jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed_id UUID;
BEGIN
  PERFORM public.recover_stale_automations(interval '10 minutes');

  SELECT q.id INTO claimed_id
  FROM public.automatic_company_queries q
  WHERE q.enabled = true
    AND (q.next_run_at IS NULL OR q.next_run_at <= now())
    AND q.status <> 'running'
  ORDER BY q.next_run_at NULLS FIRST
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.automatic_company_queries
     SET status = 'running',
         heartbeat_at = now(),
         lock_token = gen_random_uuid(),
         updated_at = now()
   WHERE public.automatic_company_queries.id = claimed_id;

  RETURN QUERY
    SELECT q.id, q.owner_user_id, q.mode, q.quantity_per_run, q.interval_minutes, q.filters
      FROM public.automatic_company_queries q
     WHERE q.id = claimed_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_automation_by_id(_id uuid)
 RETURNS TABLE(id uuid, owner_user_id uuid, mode text, quantity_per_run integer, interval_minutes integer, filters jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed_id UUID;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.recover_stale_automations(interval '10 minutes');

  SELECT q.id INTO claimed_id
  FROM public.automatic_company_queries q
  WHERE q.id = _id
    AND q.status <> 'running'
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.automatic_company_queries
     SET status = 'running',
         heartbeat_at = now(),
         lock_token = gen_random_uuid(),
         updated_at = now()
   WHERE public.automatic_company_queries.id = claimed_id;

  RETURN QUERY
    SELECT q.id, q.owner_user_id, q.mode, q.quantity_per_run, q.interval_minutes, q.filters
      FROM public.automatic_company_queries q
     WHERE q.id = claimed_id;
END;
$function$;