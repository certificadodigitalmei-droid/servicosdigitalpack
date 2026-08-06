CREATE UNIQUE INDEX IF NOT EXISTS email_send_queue_one_mass_email_per_recipient_idx
ON public.email_send_queue ((lower(trim(to_email))))
WHERE idempotency_key LIKE 'mass-email-%' AND status IN ('queued', 'pending', 'sending', 'sent');