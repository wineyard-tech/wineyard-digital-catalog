-- Fail-forward estimates: enum zoho_sync_status (PENDING/SYNCED/FAILED), nullable estimate_number

CREATE TYPE public.estimate_zoho_sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED');

COMMENT ON TYPE public.estimate_zoho_sync_status IS 'Zoho push lifecycle for public.estimates (app insert → PENDING; after Books create → SYNCED or FAILED)';

DROP INDEX IF EXISTS public.estimates_dedup_idx;

ALTER TABLE public.estimates
  ALTER COLUMN zoho_sync_status DROP DEFAULT;

ALTER TABLE public.estimates
  ALTER COLUMN zoho_sync_status TYPE public.estimate_zoho_sync_status
  USING (
    CASE lower(trim(zoho_sync_status::text))
      WHEN 'pending_zoho_sync' THEN 'PENDING'::public.estimate_zoho_sync_status
      WHEN 'failed' THEN 'FAILED'::public.estimate_zoho_sync_status
      WHEN 'synced' THEN 'SYNCED'::public.estimate_zoho_sync_status
      WHEN 'sent' THEN 'SYNCED'::public.estimate_zoho_sync_status
      ELSE 'SYNCED'::public.estimate_zoho_sync_status
    END
  );

ALTER TABLE public.estimates
  ALTER COLUMN zoho_sync_status SET DEFAULT 'PENDING'::public.estimate_zoho_sync_status;

ALTER TABLE public.estimates
  ALTER COLUMN estimate_number DROP DEFAULT;

ALTER TABLE public.estimates
  ALTER COLUMN estimate_number DROP NOT NULL;

CREATE INDEX IF NOT EXISTS estimates_dedup_idx
  ON public.estimates (zoho_contact_id, cart_hash, created_at DESC)
  WHERE (zoho_sync_status <> 'FAILED'::public.estimate_zoho_sync_status);

-- Label from wl cookie at enquiry submit — used by Edge Function for location WhatsApp templates
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS contact_location TEXT;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
