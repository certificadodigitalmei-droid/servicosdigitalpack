UPDATE public.email_send_queue SET status = 'queued' WHERE status = 'sending';
UPDATE public.email_send_queue SET next_retry_at = NULL WHERE status IN ('queued','pending') AND last_status_code = 429;