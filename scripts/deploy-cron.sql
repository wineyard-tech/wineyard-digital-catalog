-- deploy-cron.sql
-- Run this in the Supabase SQL editor AFTER deploying Edge Functions to production.
--
-- Prerequisites:
--   1. pg_cron and pg_net extensions enabled in Supabase Dashboard
--      (Database → Extensions → search "cron" and "net" → Enable both)
--   2. Edge Functions deployed:
--      supabase functions deploy sync-items
--      supabase functions deploy sync-contacts
--      supabase functions deploy session-cleanup
--
-- Replace these placeholders before running:
--   <PROJECT_REF>      — Supabase project ref slug (e.g. abcdefghijklmnop)
--                        Find it: Supabase Dashboard → Settings → General → Reference ID
--   <SERVICE_ROLE_KEY> — Service role secret key
--                        Find it: Supabase Dashboard → Settings → API → service_role (secret)
--
-- To verify after running: SELECT jobid, jobname, schedule, active FROM cron.job;
-- To remove a job:         SELECT cron.unschedule('job-name');

-- ── sync-items: every 6 hours ─────────────────────────────────────────────────
-- Fetches all active items from Zoho Books, upserts into items/categories/brands
SELECT cron.schedule('sync-items', '0 */6 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-items',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

-- ── sync-contacts: every 24 hours ────────────────────────────────────────────
-- Refreshes contact status, pricebook assignments, and phone numbers from Zoho
SELECT cron.schedule('sync-contacts', '30 1 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-contacts',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

-- ── session-cleanup: every 15 minutes ────────────────────────────────────────
-- Deletes expired sessions, auth_requests, and guest_sessions
SELECT cron.schedule('session-cleanup', '*/15 * * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/session-cleanup',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);
