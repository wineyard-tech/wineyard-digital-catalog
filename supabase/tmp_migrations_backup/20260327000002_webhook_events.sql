-- webhook_events — lightweight audit trail for every inbound Zoho webhook.
--
-- Captures one row per webhook received, including the delta (which fields
-- changed and old/new values) and final status. Unlike webhook_errors (which
-- stores full raw payloads for failed events only), this table is intentionally
-- compact so it can be retained long-term without storage concerns.
--
-- Queryable use-cases:
--   - "Show all contact webhooks where pricebook_id changed"
--     SELECT * FROM webhook_events WHERE webhook_type='contacts' AND changed_fields ? 'pricebook_id';
--   - "Find webhooks where Zoho sent unchanged data (possible stale delivery)"
--     SELECT * FROM webhook_events WHERE op='update' AND changed_count=0;
--   - "Success rate by webhook type in the last 7 days"
--     SELECT webhook_type, status, count(*) FROM webhook_events WHERE created_at > now()-interval '7d' GROUP BY 1,2;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              BIGSERIAL    PRIMARY KEY,
  webhook_type    TEXT         NOT NULL,  -- 'items' | 'contacts' | 'pricebooks' | 'estimates' | 'invoices'
  event_type      TEXT         NOT NULL,  -- 'created' | 'updated' | 'deleted'
  zoho_entity_id  TEXT,                   -- item_id, contact_id, estimate_id, etc.
  op              TEXT,                   -- 'insert' | 'update' | 'soft-delete'
  changed_count   INTEGER,                -- number of watched fields that changed (0 = stale delivery)
  changed_fields  JSONB,                  -- { "field": { "from": old, "to": new }, ... }
  status          TEXT         NOT NULL DEFAULT 'success',  -- 'success' | 'error'
  error_ref       BIGINT,                 -- FK to webhook_errors.id when status='error'
  duration_ms     INTEGER,                -- total handler execution time
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_webhook_events_type_created
  ON public.webhook_events (webhook_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_entity
  ON public.webhook_events (zoho_entity_id, webhook_type);

-- GIN index on changed_fields enables fast JSONB key-existence queries:
--   WHERE changed_fields ? 'pricebook_id'
CREATE INDEX IF NOT EXISTS idx_webhook_events_changed_fields
  ON public.webhook_events USING GIN (changed_fields);

-- RLS: service role full access (same pattern as webhook_errors)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on webhook_events"
  ON public.webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
