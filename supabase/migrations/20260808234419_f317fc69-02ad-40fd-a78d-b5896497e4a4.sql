CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('whatsapp-campaign-tick') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-campaign-tick'
);

SELECT cron.schedule(
  'whatsapp-campaign-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--8a8fa8c9-4225-4a51-a790-5ffe68f740c2.lovable.app/api/public/hooks/whatsapp-campaign-tick',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_1xfyqIIcZWTseIifVLgYUQ_YQLjbl-x"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);