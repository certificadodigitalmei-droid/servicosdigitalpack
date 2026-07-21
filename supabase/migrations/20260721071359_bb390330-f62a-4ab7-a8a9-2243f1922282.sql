CREATE OR REPLACE FUNCTION public.claim_automation_by_id(_id uuid)
 RETURNS TABLE(id uuid, owner_user_id uuid, mode text, quantity_per_run integer, interval_minutes integer, filters jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed_id UUID;
BEGIN
  -- Authorization is enforced at the API layer: EXECUTE on this function is
  -- granted only to service_role. Callers (server functions) validate the
  -- admin role against public.user_roles before invoking this RPC.

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