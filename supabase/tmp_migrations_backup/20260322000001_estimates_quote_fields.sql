-- Add quote workflow fields to estimates table
-- public_id: UUID for deep links (non-enumerable, safe to expose in URLs)
-- cart_hash: SHA-256 of sorted line_items for duplicate detection
-- zoho_sync_status: separate lifecycle from 'status' (tracks Zoho sync state)
-- zoho_sync_attempts / zoho_sync_error: retry telemetry
-- app_whatsapp_sent / app_whatsapp_message_id: tracks our own WA send (separate from legacy whatsapp_sent)

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS public_id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS cart_hash              TEXT,
  ADD COLUMN IF NOT EXISTS zoho_sync_status       TEXT         NOT NULL DEFAULT 'pending_zoho_sync',
  ADD COLUMN IF NOT EXISTS zoho_sync_attempts     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoho_sync_error        TEXT,
  ADD COLUMN IF NOT EXISTS app_whatsapp_sent      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS app_whatsapp_message_id TEXT;

-- Unique index on public_id for fast deep-link lookups
CREATE UNIQUE INDEX IF NOT EXISTS estimates_public_id_idx
  ON estimates (public_id);

-- Composite index for duplicate-cart detection query:
-- WHERE zoho_contact_id = $1 AND cart_hash = $2 AND created_at > now() - interval '24 hours'
CREATE INDEX IF NOT EXISTS estimates_dedup_idx
  ON estimates (zoho_contact_id, cart_hash, created_at DESC)
  WHERE zoho_sync_status <> 'failed';
