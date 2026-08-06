UPDATE public.email_send_queue
SET status = 'queued',
    attempts = 0,
    next_retry_at = NULL,
    last_error = NULL,
    last_status_code = NULL
WHERE status = 'failed'
  AND (last_status_code = 429 OR last_error ILIKE 'rate_limited%');