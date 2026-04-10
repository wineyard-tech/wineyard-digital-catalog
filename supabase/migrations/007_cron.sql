-- pg_cron schedules
-- NOTE: pg_cron and pg_net must be enabled in Supabase Dashboard before running this.
-- Dashboard → Database → Extensions → Enable pg_cron and pg_net

-- These will fail silently if pg_cron is not enabled. Enable it first.

-- Historical template. Current schedules: scripts/deploy-cron.sql and migration
-- 20260410120000_cron_sync_daily_weekly.sql (commented reference).

-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> after deployment
-- Run this manually in Supabase SQL editor after deploying Edge Functions:

/*
-- sync-items: daily at 04:00 AM IST (22:30 UTC)
SELECT cron.schedule('sync-items', '30 22 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-items',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

-- sync-contacts: daily at 04:05 AM IST (22:35 UTC) — 5 min after sync-items
SELECT cron.schedule('sync-contacts', '35 22 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-contacts',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

-- session-cleanup: daily at 03:00 AM IST (21:30 UTC) — runs before syncs
SELECT cron.schedule('session-cleanup', '30 21 * * *', $$
  SELECT cleanup_expired_sessions()
$$);

-- sync-pricebooks: see scripts/deploy-cron.sql (daily with other Zoho syncs).
*/

-- After running, verify: SELECT * FROM cron.job;
-- To update an existing schedule: SELECT cron.unschedule('sync-items'); then re-run the schedule call.
