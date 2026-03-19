-- Audit table for webhook processing failures.
-- Logs every exception from items-webhook and contacts-webhook so ops can
-- investigate without relying on ephemeral Edge Function logs (which expire).
-- resolved=false rows indicate unprocessed errors and can be alarmed on.

CREATE TABLE IF NOT EXISTS webhook_errors (
  id              BIGSERIAL PRIMARY KEY,
  webhook_type    TEXT        NOT NULL,  -- 'items' | 'contacts'
  event_type      TEXT        NOT NULL,  -- 'created' | 'updated' | 'deleted'
  zoho_entity_id  TEXT,                  -- item_id or contact_id (null if parse failed)
  error_message   TEXT        NOT NULL,
  payload         JSONB,                 -- full raw payload for replay/debug
  retry_count     INTEGER     DEFAULT 0,
  resolved        BOOLEAN     DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_errors_resolved ON webhook_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_type     ON webhook_errors(webhook_type);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_created  ON webhook_errors(created_at DESC);
