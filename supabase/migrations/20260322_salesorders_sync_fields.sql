-- Add sync tracking fields to sales_orders, mirroring the estimates pattern.
-- public_id: UUID for deep links and client-safe references
-- zoho_sync_status: lifecycle tracking separate from 'status'
-- zoho_sync_attempts / zoho_sync_error: retry telemetry
-- app_whatsapp_sent / app_whatsapp_message_id: tracks WA order confirmation

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS public_id               UUID         NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS zoho_sync_status        TEXT         NOT NULL DEFAULT 'pending_zoho_sync',
  ADD COLUMN IF NOT EXISTS zoho_sync_attempts      INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoho_sync_error         TEXT,
  ADD COLUMN IF NOT EXISTS app_whatsapp_sent       BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS app_whatsapp_message_id TEXT;

-- Unique index for deep-link and API lookups by public_id
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_public_id_idx
  ON sales_orders (public_id);

-- Index for deduplication query:
-- WHERE zoho_contact_id = $1 AND cart_hash = $2 AND created_at > now() - interval '1 hour'
-- (cart_hash added below since it was not in the original table)
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS cart_hash TEXT;

CREATE INDEX IF NOT EXISTS sales_orders_dedup_idx
  ON sales_orders (zoho_contact_id, cart_hash, created_at DESC)
  WHERE zoho_sync_status <> 'failed';
