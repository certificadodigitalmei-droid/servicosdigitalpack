CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('reconcile-payments') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments');

SELECT cron.schedule(
  'reconcile-payments',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://servicosdigitalpack.lovable.app/api/public/hooks/reconcile-payments',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_1xfyqIIcZWTseIifVLgYUQ_YQLjbl-x"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);