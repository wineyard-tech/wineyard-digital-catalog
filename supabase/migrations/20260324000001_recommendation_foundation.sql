-- ─────────────────────────────────────────────────────────────────────────────
-- 20260324000001_recommendation_foundation.sql
--
-- Foundation schema for personalised catalog recommendations.
-- Adds system classification, pre-computed association pairs, popularity
-- signals, and customer purchase profiles. No ETL logic — these tables are
-- populated by background jobs defined separately.
--
-- Spec: docs/superpowers/specs/2026-03-24-recommendation-foundation-design.md
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. system_types — reference table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_types (
  system_type_code  TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_types (system_type_code, display_name, display_order) VALUES
  ('analog_hd',         'Analog HD',          1),
  ('ip_network',        'IP Network',          2),
  ('wifi',              'Wi-Fi',               3),
  ('standalone_remote', 'Standalone / Remote', 4),
  ('fiber_optic',       'Fiber Optic',         5),
  ('universal',         'Universal',           6),
  ('service',           'Service',             7)
ON CONFLICT (system_type_code) DO NOTHING;

-- ── 2. items — add system classification columns ──────────────────────────────
-- system_type: FK to system_types; nullable until classified.
-- system_type_source: 'auto' = set by classifier script; 'manual' = human override.
--   Scripts MUST check this column before writing — never overwrite 'manual'.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS system_type        TEXT REFERENCES system_types(system_type_code),
  ADD COLUMN IF NOT EXISTS system_type_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (system_type_source IN ('auto', 'manual'));

-- ── 3. product_associations — pre-computed directional SKU pairs ──────────────
-- A→B and B→A stored as separate rows (no self-join at query time).
-- Both confidence columns stored on each row for symmetry with category_associations.
-- Unique key prevents duplicate computation runs from creating duplicate rows.

CREATE TABLE IF NOT EXISTS product_associations (
  id                  BIGSERIAL PRIMARY KEY,
  item_a_id           TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  item_b_id           TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  association_type    TEXT NOT NULL
    CHECK (association_type IN ('frequently_bought_together', 'people_also_buy')),
  co_occurrence_count INTEGER NOT NULL DEFAULT 0,
  lift_score          DECIMAL(10,6),
  confidence_a_to_b   DECIMAL(10,6),
  confidence_b_to_a   DECIMAL(10,6),
  time_window_days    INTEGER NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_a_id, item_b_id, association_type, time_window_days)
);

-- ── 4. category_associations — category-level fallback pairs ──────────────────
-- Used when a SKU has insufficient order history for SKU-level associations.
-- Mirrors product_associations structure fully so ETL produces the same
-- windows/types for both levels.
--
-- FK to categories(zoho_category_id): this intentionally differs from items.category_id
-- which is a soft TEXT reference (see 008_fk_constraints.sql for that rationale).
-- The soft-ref pattern on items is needed because incremental Zoho sync can import an
-- item before its category arrives. category_associations is written by a background job
-- that only runs after both categories exist — FK is safe here.

CREATE TABLE IF NOT EXISTS category_associations (
  id                  BIGSERIAL PRIMARY KEY,
  category_a_id       TEXT NOT NULL REFERENCES categories(zoho_category_id) ON DELETE CASCADE,
  category_b_id       TEXT NOT NULL REFERENCES categories(zoho_category_id) ON DELETE CASCADE,
  association_type    TEXT NOT NULL
    CHECK (association_type IN ('frequently_bought_together', 'people_also_buy')),
  co_occurrence_count INTEGER NOT NULL DEFAULT 0,
  lift_score          DECIMAL(10,6),
  confidence_a_to_b   DECIMAL(10,6),
  confidence_b_to_a   DECIMAL(10,6),
  time_window_days    INTEGER NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_a_id, category_b_id, association_type, time_window_days)
);

-- ── 5. product_popularity — per-product signals ───────────────────────────────
-- One row per product; PK is zoho_item_id (1:1 with items — no BIGSERIAL needed).
-- category_id is a soft TEXT reference matching items.category_id convention
-- (no FK, same rationale as documented in 008_fk_constraints.sql).
-- repeat_purchase_rate is constrained 0–1 even though it's ETL-populated,
-- so the schema is the source of truth for valid range.

CREATE TABLE IF NOT EXISTS product_popularity (
  zoho_item_id          TEXT PRIMARY KEY REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  order_count_7d        INTEGER      NOT NULL DEFAULT 0,
  order_count_30d       INTEGER      NOT NULL DEFAULT 0,
  order_count_90d       INTEGER      NOT NULL DEFAULT 0,
  quantity_sold_30d     INTEGER      NOT NULL DEFAULT 0,
  revenue_30d           DECIMAL(12,2) NOT NULL DEFAULT 0,
  repeat_purchase_rate  DECIMAL(5,4)  CHECK (repeat_purchase_rate BETWEEN 0 AND 1),
  category_id           TEXT,
  category_rank         INTEGER,
  computed_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 6. customer_profiles — per-customer purchase summary ─────────────────────
-- One row per contact; keyed by zoho_contact_id (1:1 with contacts).
-- system_affinity FKs to system_types — same domain as items.system_type.
-- brand_affinity is a soft TEXT reference (no FK to brands), matching the
-- soft-reference pattern used for items.brand.
-- refreshed_at is owned by the ETL job — no updated_at trigger needed.

CREATE TABLE IF NOT EXISTS customer_profiles (
  zoho_contact_id   TEXT PRIMARY KEY REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE,
  system_affinity   TEXT REFERENCES system_types(system_type_code),
  brand_affinity    TEXT,
  buyer_tier        TEXT NOT NULL DEFAULT 'low'
    CHECK (buyer_tier IN ('high', 'medium', 'low')),
  last_order_date   DATE,
  order_count_90d   INTEGER NOT NULL DEFAULT 0,
  is_repeat_buyer   BOOLEAN NOT NULL DEFAULT false,
  refreshed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. Indexes ───────────────────────────────────────────────────────────────

-- items — new system_type column
CREATE INDEX IF NOT EXISTS idx_items_system_type
  ON items(system_type);

-- product_associations — item_a is the hot lookup; lookup index covers the full filter
CREATE INDEX IF NOT EXISTS idx_product_associations_item_a
  ON product_associations(item_a_id);
CREATE INDEX IF NOT EXISTS idx_product_associations_item_b
  ON product_associations(item_b_id);
CREATE INDEX IF NOT EXISTS idx_product_associations_type
  ON product_associations(association_type);
CREATE INDEX IF NOT EXISTS idx_product_associations_lookup
  ON product_associations(item_a_id, association_type, time_window_days);

-- category_associations — mirrors product_associations index pattern
CREATE INDEX IF NOT EXISTS idx_category_associations_cat_a
  ON category_associations(category_a_id);
CREATE INDEX IF NOT EXISTS idx_category_associations_cat_b
  ON category_associations(category_b_id);
CREATE INDEX IF NOT EXISTS idx_category_associations_lookup
  ON category_associations(category_a_id, association_type, time_window_days);

-- product_popularity — partial index avoids scanning zero-count rows for trending
CREATE INDEX IF NOT EXISTS idx_product_popularity_trending
  ON product_popularity(order_count_30d DESC) WHERE order_count_30d > 0;
CREATE INDEX IF NOT EXISTS idx_product_popularity_category_rank
  ON product_popularity(category_id, category_rank);

-- customer_profiles — used to filter recommendations by affinity and tier
CREATE INDEX IF NOT EXISTS idx_customer_profiles_system_affinity
  ON customer_profiles(system_affinity);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_buyer_tier
  ON customer_profiles(buyer_tier);

-- ── 8. Trigger — system_types updated_at ─────────────────────────────────────
-- DROP/CREATE pattern for safe re-runs (preferred for new migrations; existing
-- 005_triggers.sql uses plain CREATE TRIGGER — no need to change those).
-- Only system_types gets this trigger. The four ETL tables (product_associations,
-- category_associations, product_popularity, customer_profiles) use computed_at /
-- refreshed_at and are always fully replaced by jobs — no trigger needed.

DROP TRIGGER IF EXISTS system_types_updated_at ON system_types;
CREATE TRIGGER system_types_updated_at
  BEFORE UPDATE ON system_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 9. Row Level Security ─────────────────────────────────────────────────────
-- Service role (used by all API routes) bypasses RLS automatically.
-- Anon key is blocked from all new tables except system_types (reference data).

ALTER TABLE system_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_associations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_popularity    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles     ENABLE ROW LEVEL SECURITY;

-- system_types: safe to read publicly — it's a classification reference list
CREATE POLICY "Public can read system_types"
  ON system_types FOR SELECT USING (true);

-- No policy on the four ETL tables = service role only (anon is blocked by RLS with no matching policy)
