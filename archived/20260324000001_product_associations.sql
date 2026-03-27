-- ─────────────────────────────────────────────────────────────────────────────
-- Product & Category Associations — schema already exists in staging.
-- This migration is a safe no-op; kept for documentation and local dev parity.
--
-- Actual staging schema (verified 2026-03-24):
--
-- items.system_type TEXT (already present)
--
-- product_associations:
--   id, item_a_id TEXT, item_b_id TEXT, association_type TEXT,
--   co_occurrence_count INT, lift_score NUMERIC, confidence_a_to_b NUMERIC,
--   confidence_b_to_a NUMERIC, time_window_days INT, computed_at TIMESTAMPTZ,
--   support NUMERIC, estimate_supplemented BOOLEAN
--
-- category_associations:
--   id, category_a_id TEXT, category_b_id TEXT, association_type TEXT,
--   co_occurrence_count INT, lift_score NUMERIC, confidence_a_to_b NUMERIC,
--   confidence_b_to_a NUMERIC, time_window_days INT, computed_at TIMESTAMPTZ
-- ─────────────────────────────────────────────────────────────────────────────

-- system_type on items (no-op if already present)
ALTER TABLE items ADD COLUMN IF NOT EXISTS system_type TEXT;

-- Indexes for recommendation query performance
CREATE INDEX IF NOT EXISTS idx_items_system_type
  ON items (system_type) WHERE system_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_assoc_a_lift
  ON product_associations (item_a_id, lift_score DESC);

CREATE INDEX IF NOT EXISTS idx_category_assoc_a_lift
  ON category_associations (category_a_id, lift_score DESC);
