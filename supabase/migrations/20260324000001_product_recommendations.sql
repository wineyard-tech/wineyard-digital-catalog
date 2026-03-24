-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCT RECOMMENDATION TABLES
-- Schema matches staging (owbceumuadpclzwtwmzx). Tables already exist there;
-- this migration documents the schema and applies to new environments.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_associations (
  id                    BIGSERIAL PRIMARY KEY,
  item_a_id             TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  item_b_id             TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  association_type      TEXT NOT NULL DEFAULT 'frequently_bought_together',
  co_occurrence_count   INTEGER DEFAULT 0,
  lift_score            DECIMAL(10,6) DEFAULT 1.0,
  confidence_a_to_b     DECIMAL(10,6),
  confidence_b_to_a     DECIMAL(10,6),
  support               DECIMAL(10,6),
  time_window_days      INTEGER DEFAULT 30,
  estimate_supplemented BOOLEAN DEFAULT false,
  computed_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_a_id, item_b_id, association_type)
);

CREATE INDEX IF NOT EXISTS idx_product_associations_lookup
  ON product_associations (item_a_id, association_type, lift_score DESC);

CREATE TABLE IF NOT EXISTS product_popularity (
  zoho_item_id          TEXT PRIMARY KEY REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  order_count_7d        INTEGER DEFAULT 0,
  order_count_30d       INTEGER DEFAULT 0,
  order_count_90d       INTEGER DEFAULT 0,
  quantity_sold_30d     INTEGER DEFAULT 0,
  revenue_30d           DECIMAL(12,2) DEFAULT 0,
  repeat_purchase_rate  DECIMAL(5,4) DEFAULT 0,
  category_id           TEXT,
  category_rank         INTEGER,
  computed_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_popularity_category_orders
  ON product_popularity (category_id, order_count_30d DESC);
