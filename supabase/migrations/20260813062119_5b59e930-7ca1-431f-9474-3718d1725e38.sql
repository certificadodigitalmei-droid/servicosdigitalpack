select cron.unschedule('reconcile-payments');
select cron.schedule('reconcile-payments', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://project--8a8fa8c9-4225-4a51-a790-5ffe68f740c2.lovable.app/api/public/hooks/reconcile-payments',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_1xfyqIIcZWTseIifVLgYUQ_YQLjbl-x"}'::jsonb,
    body := '{}'::jsonb
  );
$$);