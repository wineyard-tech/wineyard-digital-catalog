-- pg_cron schedules for sync-invoices and sync-estimates
--
-- Staggered 5-minute intervals after existing syncs to avoid concurrent Zoho API load:
--   22:30 UTC  sync-items    (04:00 AM IST)
--   22:35 UTC  sync-contacts (04:05 AM IST)
--   22:40 UTC  sync-invoices (04:10 AM IST)  ← new
--   22:45 UTC  sync-estimates (04:15 AM IST) ← new
--
-- All functions use last_modified_time >= yesterday 03:55 AM IST so the 5-minute
-- safety buffer ensures no records are missed at the boundary minute.
--
-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> after deployment.
-- Run this manually in the Supabase SQL editor after deploying the edge functions.

/*
-- sync-invoices: daily at 04:10 AM IST (22:40 UTC)
SELECT cron.schedule('sync-invoices', '40 22 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-invoices',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

-- sync-estimates: daily at 04:15 AM IST (22:45 UTC)
SELECT cron.schedule('sync-estimates', '45 22 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-estimates',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);
*/

-- After running, verify: SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
-- To update an existing schedule: SELECT cron.unschedule('sync-invoices'); then re-run.
