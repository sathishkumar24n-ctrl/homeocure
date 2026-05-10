CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-follow-up-reminders') THEN
    PERFORM cron.unschedule('whatsapp-follow-up-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'whatsapp-follow-up-reminders',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c5202617-96be-4936-8b58-0e57b9e34e40.lovable.app/api/public/hooks/follow-up-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpempueHlscGVubnJsbHNwb2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzU0MDAsImV4cCI6MjA5MzkxMTQwMH0.e7Y-G4r_FAK_EYtAuS094rlonXeWc2yXeh_crvfSMBc"}'::jsonb,
    body := '{"daysAhead":1}'::jsonb
  );
  $$
);