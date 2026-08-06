UPDATE public.cloud_automation_settings
SET send_profile = 'moderado',
    send_mode = 'paced',
    paced_delay_sec = 36,
    hourly_batch_size = 100,
    import_batch_size = 20,
    burst_concurrency = 1,
    enabled = true,
    status = 'active',
    updated_at = now()
WHERE id = 1;