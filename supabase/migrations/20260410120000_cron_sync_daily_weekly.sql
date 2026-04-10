-- Canonical pg_cron definitions for Zoho syncs + recommendation edge functions.
-- This file documents the intended schedules; apply by running scripts/deploy-cron.sql
-- in the SQL editor with <PROJECT_REF> and <SERVICE_ROLE_KEY> replaced.
--
-- Daily ~5:00 AM IST (staggered): sync-items, sync-pricebooks, sync-contacts,
--   sync-invoices, sync-estimates — incremental window = T−24h5m (getLastModifiedFilter).
-- Weekly Sunday ~6:00 AM IST (staggered): refresh-product-popularity,
--   compute-product-associations, rebuild-customer-profiles.
-- session-cleanup: daily 03:00 AM IST via cleanup_expired_sessions() RPC.
--
-- pg_cron uses UTC. Sunday 05:00 IST = Saturday 23:30 UTC → weekly jobs use DOW 6.

/*
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'sync-items',
  'sync-pricebooks',
  'sync-contacts',
  'sync-invoices',
  'sync-estimates',
  'refresh-product-popularity',
  'compute-product-associations',
  'rebuild-customer-profiles',
  'session-cleanup'
);

SELECT cron.schedule('session-cleanup', '30 21 * * *', $$
  SELECT cleanup_expired_sessions()
$$);

SELECT cron.schedule('sync-items', '30 23 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-items',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('sync-pricebooks', '35 23 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-pricebooks',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('sync-contacts', '40 23 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-contacts',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('sync-invoices', '45 23 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-invoices',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('sync-estimates', '50 23 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-estimates',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('refresh-product-popularity', '30 0 * * 6', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-product-popularity',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('compute-product-associations', '35 0 * * 6', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/compute-product-associations',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('rebuild-customer-profiles', '40 0 * * 6', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/rebuild-customer-profiles',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);
*/
