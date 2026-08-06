DELETE FROM public.email_send_queue AS pending
WHERE pending.status IN ('queued', 'pending')
  AND pending.idempotency_key LIKE 'mass-email-%'
  AND EXISTS (
    SELECT 1
    FROM public.email_send_queue AS delivered
    WHERE delivered.status = 'sent'
      AND delivered.id <> pending.id
      AND lower(trim(delivered.to_email)) = lower(trim(pending.to_email))
  );