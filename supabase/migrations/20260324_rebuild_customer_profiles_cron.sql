-- pg_cron schedule for rebuild-customer-profiles
-- Monday 8:00 AM IST = 02:30 UTC = cron '30 2 * * 1'
-- Runs after compute-product-associations (Sunday 8pm IST) has completed.
-- Run manually in Supabase SQL editor after deploying the edge function.
-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before running.

/*
SELECT cron.schedule('rebuild-customer-profiles', '30 2 * * 1', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/rebuild-customer-profiles',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);
*/

-- Verify: SELECT * FROM cron.job WHERE jobname = 'rebuild-customer-profiles';
-- Remove: SELECT cron.unschedule('rebuild-customer-profiles');
