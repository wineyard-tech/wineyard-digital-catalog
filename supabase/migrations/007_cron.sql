-- pg_cron schedules
-- NOTE: pg_cron and pg_net must be enabled in Supabase Dashboard before running this.
-- Dashboard → Database → Extensions → Enable pg_cron and pg_net

-- These will fail silently if pg_cron is not enabled. Enable it first.

-- Items sync: 4x daily at ~8:30, 12:30, 16:30, 20:30 IST (3:00, 7:00, 11:00, 15:00 UTC)
-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> after deployment
-- Run this manually in Supabase SQL editor after deploying Edge Functions:

/*
SELECT cron.schedule('sync-items', '0 3,7,11,15 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-items',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('sync-contacts', '30 1 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-contacts',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('session-cleanup', '30 21 * * *', $$
  SELECT cleanup_expired_sessions()
$$);
*/

-- After running, verify: SELECT * FROM cron.job;
