-- pg_cron schedule for compute-product-associations
-- Sunday 8:00 PM IST = 14:30 UTC = cron '30 14 * * 0'
-- Run manually in Supabase SQL editor after deploying the edge function.
-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before running.

/*
SELECT cron.schedule('compute-product-associations', '30 14 * * 0', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/compute-product-associations',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);
*/

-- Verify: SELECT * FROM cron.job WHERE jobname = 'compute-product-associations';
-- Remove: SELECT cron.unschedule('compute-product-associations');
