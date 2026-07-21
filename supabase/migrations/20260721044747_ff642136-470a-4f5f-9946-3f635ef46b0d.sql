UPDATE public.automatic_company_queries
SET status = CASE WHEN enabled THEN 'active' ELSE 'inactive' END,
    updated_at = now()
WHERE status = 'running'
  AND (last_run_at IS NULL OR last_run_at < now() - interval '10 minutes');

UPDATE public.automatic_company_query_runs
SET status = 'error',
    error_message = COALESCE(error_message, 'run interrupted - status reset'),
    finished_at = now()
WHERE status = 'running'
  AND started_at < now() - interval '10 minutes';