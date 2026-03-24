# Recommendation Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single Supabase migration that adds a `system_types` reference table, two new columns on `items`, and four pre-computed recommendation tables (`product_associations`, `category_associations`, `product_popularity`, `customer_profiles`) with full indexes and RLS.

**Architecture:** All work is one SQL migration file. No TypeScript code is touched. "TDD" is implemented as SQL `DO $$` blocks and `SELECT` verification queries run after each section to confirm constraints and indexes are working before moving on.

**Tech Stack:** PostgreSQL 15 (Supabase), `supabase` CLI for local apply, existing `update_updated_at_column()` trigger function (already deployed in `004_functions.sql`).

**Spec:** `docs/superpowers/specs/2026-03-24-recommendation-foundation-design.md`

---

## Chunk 1: Migration file — tables and seed data

### Task 1: Create the migration file skeleton

**Files:**
- Create: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 1.1: Create the file with its header comment**

```sql
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
```

Save as `supabase/migrations/20260324000001_recommendation_foundation.sql`.

---

### Task 2: `system_types` table + seed data

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 2.1: Append `system_types` DDL and seed INSERT**

```sql
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
```

- [ ] **Step 2.2: Verify seed shape (run in Supabase SQL editor or `psql`)**

```sql
SELECT system_type_code, display_name FROM system_types ORDER BY display_order;
```

Expected: 7 rows in order — `analog_hd` through `service`.

> Note: The `updated_at` trigger for `system_types` is defined in **Task 9** using `DROP TRIGGER IF EXISTS … / CREATE TRIGGER` for safe re-runs. This is the preferred pattern for all new migrations in this project. The existing `005_triggers.sql` triggers use plain `CREATE TRIGGER` (they predate this convention and don't need to be changed). It reuses the existing `update_updated_at_column()` function from `004_functions.sql`.

---

### Task 3: Add `system_type` columns to `items`

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 3.1: Append ALTER TABLE**

```sql
-- ── 2. items — add system classification columns ──────────────────────────────
-- system_type: FK to system_types; nullable until classified.
-- system_type_source: 'auto' = set by classifier script; 'manual' = human override.
--   Scripts MUST check this column before writing — never overwrite 'manual'.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS system_type        TEXT REFERENCES system_types(system_type_code),
  ADD COLUMN IF NOT EXISTS system_type_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (system_type_source IN ('auto', 'manual'));
```

- [ ] **Step 3.2: Verify CHECK constraint rejects bad values**

```sql
DO $$
DECLARE v_id TEXT := '__test_check_' || gen_random_uuid()::text || '__';
BEGIN
  BEGIN
    -- Unique suffix on both id and sku avoids UNIQUE constraint collision on retried runs.
    INSERT INTO items (zoho_item_id, item_name, sku, system_type_source)
    VALUES (v_id, 'Test', v_id, 'bad_value');
    RAISE EXCEPTION 'CHECK constraint did not fire — migration error';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: system_type_source CHECK constraint works';
  END;
END;
$$;
```

- [ ] **Step 3.3: Verify FK rejects unknown system type**

```sql
DO $$
DECLARE v_id TEXT := '__test_fk_' || gen_random_uuid()::text || '__';
BEGIN
  BEGIN
    INSERT INTO items (zoho_item_id, item_name, sku, system_type)
    VALUES (v_id, 'Test', v_id, 'nonexistent_type');
    RAISE EXCEPTION 'FK constraint did not fire — migration error';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK: system_type FK constraint works';
  END;
END;
$$;
```

---

### Task 4: `product_associations` table

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 4.1: Append DDL**

```sql
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
```

- [ ] **Step 4.2: Verify product_associations key columns exist**

```sql
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'product_associations'
    AND column_name IN ('confidence_a_to_b', 'confidence_b_to_a', 'time_window_days');
  IF v_count < 3 THEN
    RAISE EXCEPTION 'product_associations missing expected columns (found % of 3)', v_count;
  END IF;
  RAISE NOTICE 'OK: product_associations columns verified';
END;
$$;
```

---

### Task 5: `category_associations` table

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 5.1: Append DDL**

```sql
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
```

- [ ] **Step 5.2: Verify category_associations has all 10 columns**

```sql
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'category_associations'
    AND column_name IN (
      'id', 'category_a_id', 'category_b_id', 'association_type',
      'co_occurrence_count', 'lift_score', 'confidence_a_to_b', 'confidence_b_to_a',
      'time_window_days', 'computed_at'
    );
  IF v_count < 10 THEN
    RAISE EXCEPTION 'category_associations missing expected columns (found % of 10)', v_count;
  END IF;
  RAISE NOTICE 'OK: category_associations structure verified';
END;
$$;
```

---

## Chunk 2: Remaining tables, indexes, trigger, RLS, and final verification

### Task 6: `product_popularity` table

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 6.1: Append DDL**

```sql
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
```

- [ ] **Step 6.2: Verify repeat_purchase_rate CHECK**

```sql
DO $$
DECLARE
  v_item TEXT;
BEGIN
  -- Pick an item that has no existing product_popularity row to avoid PK conflict
  SELECT i.zoho_item_id INTO v_item
  FROM items i
  LEFT JOIN product_popularity pp ON pp.zoho_item_id = i.zoho_item_id
  WHERE pp.zoho_item_id IS NULL
  LIMIT 1;

  IF v_item IS NULL THEN
    RAISE NOTICE 'SKIP: no eligible item found. CHECK syntax validated at parse time.';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO product_popularity (zoho_item_id, repeat_purchase_rate)
    VALUES (v_item, 1.5);
    -- If we somehow reach here, clean up before raising
    DELETE FROM product_popularity WHERE zoho_item_id = v_item;
    RAISE EXCEPTION 'CHECK constraint on repeat_purchase_rate did not fire';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: repeat_purchase_rate CHECK constraint works';
  END;
END;
$$;
```

---

### Task 7: `customer_profiles` table

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 7.1: Append DDL**

```sql
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
```

- [ ] **Step 7.2: Verify buyer_tier CHECK**

```sql
DO $$
DECLARE
  v_contact TEXT;
BEGIN
  -- Pick a contact with no existing customer_profiles row to avoid PK conflict
  SELECT c.zoho_contact_id INTO v_contact
  FROM contacts c
  LEFT JOIN customer_profiles cp ON cp.zoho_contact_id = c.zoho_contact_id
  WHERE cp.zoho_contact_id IS NULL
  LIMIT 1;

  IF v_contact IS NULL THEN
    RAISE NOTICE 'SKIP: no eligible contact found. CHECK syntax validated at parse time.';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO customer_profiles (zoho_contact_id, buyer_tier)
    VALUES (v_contact, 'super_high');
    DELETE FROM customer_profiles WHERE zoho_contact_id = v_contact;
    RAISE EXCEPTION 'CHECK constraint on buyer_tier did not fire';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: buyer_tier CHECK constraint works';
  END;
END;
$$;
```

---

### Task 8: All indexes

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 8.1: Append all indexes**

```sql
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
```

- [ ] **Step 8.2: Verify index count**

```sql
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND (
      indexname = 'idx_items_system_type'
      OR indexname LIKE 'idx_product_associations_%'
      OR indexname LIKE 'idx_category_associations_%'
      OR indexname LIKE 'idx_product_popularity_%'
      OR indexname LIKE 'idx_customer_profiles_%'
    );
  IF v_count <> 12 THEN
    RAISE EXCEPTION 'Expected 12 recommendation indexes, found %', v_count;
  END IF;
  RAISE NOTICE 'OK: all 12 indexes present';
END;
$$;
```

---

### Task 9: Trigger on `system_types` + RLS

**Files:**
- Modify: `supabase/migrations/20260324000001_recommendation_foundation.sql`

- [ ] **Step 9.1: Append trigger (idempotent pattern for Postgres 15)**

```sql
-- ── 8. Trigger — system_types updated_at ─────────────────────────────────────
-- CREATE TRIGGER IF NOT EXISTS requires Postgres 16+; Supabase defaults to 15.
-- Use DROP/CREATE pattern for safe re-runs.
-- Only system_types gets this trigger. The four ETL tables (product_associations,
-- category_associations, product_popularity, customer_profiles) use computed_at /
-- refreshed_at and are always fully replaced by jobs — no trigger needed.

DROP TRIGGER IF EXISTS system_types_updated_at ON system_types;
CREATE TRIGGER system_types_updated_at
  BEFORE UPDATE ON system_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 9.2: Append RLS**

```sql
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
```

- [ ] **Step 9.3: Verify trigger exists**

```sql
-- Verify the trigger is registered (more reliable than a timestamp comparison,
-- which can produce false positives inside explicit transaction blocks where
-- NOW() is stable for the whole transaction).
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'system_types'
    AND t.tgname  = 'system_types_updated_at';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'system_types_updated_at trigger not found (count: %)', v_count;
  END IF;
  RAISE NOTICE 'OK: system_types_updated_at trigger registered';
END;
$$;
```

- [ ] **Step 9.4: Verify RLS policies**

```sql
DO $$
DECLARE v_count INTEGER;
BEGIN
  -- Exactly 1 policy should exist: system_types public read.
  -- The four ETL tables have no policy (service-role-only access).
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'system_types'
    AND policyname = 'Public can read system_types'
    AND cmd        = 'SELECT';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'system_types RLS policy missing (found %)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('product_associations', 'category_associations',
                      'product_popularity', 'customer_profiles');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ETL tables should have no policies; found % unexpected polic(ies)', v_count;
  END IF;

  RAISE NOTICE 'OK: RLS policies verified';
END;
$$;
```

---

### Task 10: Apply migration locally and run full verification

- [ ] **Step 10.1: Start Supabase local (if not already running)**

```bash
supabase start
```

Expected: all services healthy.

- [ ] **Step 10.2: Apply the migration**

**Safe (preserves existing data — use for staging or any env with real data):**
```bash
supabase migration up
```

**Clean slate (destroys all data — local dev only):**
```bash
supabase db reset
```

Expected output: no errors, migration `20260324000001_recommendation_foundation` listed as applied.

- [ ] **Step 10.3: Confirm all 5 new tables exist**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'system_types', 'product_associations', 'category_associations',
    'product_popularity', 'customer_profiles'
  )
ORDER BY table_name;
-- Expected: 5 rows
```

- [ ] **Step 10.4: Confirm items has the new columns**

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'items'
  AND column_name IN ('system_type', 'system_type_source')
ORDER BY column_name;
-- Expected: 2 rows
--   system_type:        text, nullable, no default
--   system_type_source: text, not null, default 'auto'
```

- [ ] **Step 10.5: Confirm seed data**

```sql
SELECT COUNT(*) FROM system_types;
-- Expected: 7
```

- [ ] **Step 10.6: Confirm index count**

```sql
SELECT COUNT(*) FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_items_system_type',
    'idx_product_associations_item_a',
    'idx_product_associations_item_b',
    'idx_product_associations_type',
    'idx_product_associations_lookup',
    'idx_category_associations_cat_a',
    'idx_category_associations_cat_b',
    'idx_category_associations_lookup',
    'idx_product_popularity_trending',
    'idx_product_popularity_category_rank',
    'idx_customer_profiles_system_affinity',
    'idx_customer_profiles_buyer_tier'
  );
-- Expected: 12
```

- [ ] **Step 10.7: If any step fails**

- Check `supabase db reset` output for the error line
- Most likely causes: FK target table hasn't been created yet (check migration order), or a syntax error in the SQL
- Fix in the migration file, then re-run `supabase db reset`

---

### Task 11: Commit

- [ ] **Step 11.1: Stage and commit**

```bash
git add supabase/migrations/20260324000001_recommendation_foundation.sql
git commit -m "feat: recommendation foundation schema — system_types, associations, popularity, customer profiles"
```

- [ ] **Step 11.2: Push and open PR**

```bash
git push -u origin claude/heuristic-boyd
gh pr create \
  --title "feat: recommendation foundation schema" \
  --body "Adds the database foundation for personalised catalog recommendations.

## Changes
- \`system_types\` reference table (seeded with 7 types; designed for future Zoho sync)
- \`items.system_type\` FK + \`items.system_type_source\` guard column (\`manual\` always wins)
- \`product_associations\` — pre-computed directional SKU pairs with lift, confidence, time window
- \`category_associations\` — same structure, category-level fallback
- \`product_popularity\` — per-product 7/30/90d order counts, revenue, repeat rate, category rank
- \`customer_profiles\` — per-customer system affinity, brand affinity, buyer tier
- 12 indexes covering all FK and hot query columns
- RLS: \`system_types\` public-read; all ETL tables service-role only

## No ETL or API changes
Background jobs and API endpoints are defined separately.

Spec: \`docs/superpowers/specs/2026-03-24-recommendation-foundation-design.md\`"
```
