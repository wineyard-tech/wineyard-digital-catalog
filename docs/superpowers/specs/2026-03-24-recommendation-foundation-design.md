# Recommendation Foundation — Schema Design

**Date:** 2026-03-24
**Status:** Approved

## Context

Wineyard Catalog serves B2B security-hardware buyers via WhatsApp + a catalog app. Orders and customers are synced from Zoho Books. This spec defines the database foundation for personalised catalog recommendations: system-type classification, pre-computed item/category associations, product popularity signals, and customer purchase profiles.

No recommendation logic is in scope here — only the schema that will be computed into by background jobs.

---

## Tables & Changes

### 1. `system_types` — Reference table (new)

A lookup table for all valid system type values. Seeded with initial values; long-term, the integrator will own this in Zoho and sync from there.

| Column | Type | Notes |
|---|---|---|
| `system_type_code` | `TEXT PRIMARY KEY` | Stable identifier, e.g. `analog_hd`, `ip_network` |
| `display_name` | `TEXT NOT NULL` | Human-readable label |
| `description` | `TEXT` | Optional notes |
| `status` | `TEXT DEFAULT 'active'` | `active` or `inactive` |
| `display_order` | `INTEGER DEFAULT 0` | Sort order for UI |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | |

**Seed data:** `analog_hd`, `ip_network`, `wifi`, `standalone_remote`, `fiber_optic`, `universal`, `service`

**Rationale:** Using a table (not a CHECK constraint) lets the integrator extend the type set via Zoho without a schema migration. It also enables syncing this classification from Zoho in the future.

---

### 2. `items` — Two new columns (ALTER)

| Column | Type | Notes |
|---|---|---|
| `system_type` | `TEXT REFERENCES system_types(system_type_code)` | FK, nullable — set by auto-classifier or manually |
| `system_type_source` | `TEXT DEFAULT 'auto'` CHECK `(system_type_source IN ('auto','manual'))` | Tracks origin. `manual` always wins; scripts must never overwrite it |

**Index:** `idx_items_system_type ON items(system_type)`

---

### 3. `product_associations` — Pre-computed SKU pairs (new)

Stores directional co-purchase pairs. A→B and B→A are stored as separate rows for query simplicity (no self-join needed to find "given item A, what else?"). Both confidence directions are stored on each row for consistency with `category_associations`.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `item_a_id` | `TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE` | |
| `item_b_id` | `TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE` | |
| `association_type` | `TEXT NOT NULL` CHECK `(association_type IN ('frequently_bought_together','people_also_buy'))` | |
| `co_occurrence_count` | `INTEGER NOT NULL DEFAULT 0` | Orders containing both A and B |
| `lift_score` | `DECIMAL(10,6)` | Statistical lift |
| `confidence_a_to_b` | `DECIMAL(10,6)` | P(B \| A) |
| `confidence_b_to_a` | `DECIMAL(10,6)` | P(A \| B) |
| `time_window_days` | `INTEGER NOT NULL` | Lookback window in days, e.g. `30`, `90` |
| `computed_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | When this row was last recomputed |

**Unique:** `(item_a_id, item_b_id, association_type, time_window_days)`

**Indexes:**
- `idx_product_associations_item_a ON product_associations(item_a_id)`
- `idx_product_associations_item_b ON product_associations(item_b_id)`
- `idx_product_associations_type ON product_associations(association_type)`
- `idx_product_associations_lookup ON product_associations(item_a_id, association_type, time_window_days)` — hot query path

---

### 4. `category_associations` — Category-level fallback pairs (new)

Same concept as `product_associations` but at the category level. Used when a SKU has insufficient order history for reliable association data. FKs to `categories(zoho_category_id)` — safe here because this is computed data (both categories guaranteed to exist when a row is written).

Mirrors `product_associations` structure fully: same `association_type` and `time_window_days` columns so ETL jobs can produce the same set of windows and types for both levels.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | |
| `category_a_id` | `TEXT NOT NULL REFERENCES categories(zoho_category_id) ON DELETE CASCADE` | |
| `category_b_id` | `TEXT NOT NULL REFERENCES categories(zoho_category_id) ON DELETE CASCADE` | |
| `association_type` | `TEXT NOT NULL` CHECK `(association_type IN ('frequently_bought_together','people_also_buy'))` | Same domain as `product_associations` |
| `co_occurrence_count` | `INTEGER NOT NULL DEFAULT 0` | |
| `lift_score` | `DECIMAL(10,6)` | |
| `confidence_a_to_b` | `DECIMAL(10,6)` | |
| `confidence_b_to_a` | `DECIMAL(10,6)` | |
| `time_window_days` | `INTEGER NOT NULL` | Same semantics as `product_associations.time_window_days` |
| `computed_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

**Unique:** `(category_a_id, category_b_id, association_type, time_window_days)`

**Indexes:**
- `idx_category_associations_cat_a ON category_associations(category_a_id)`
- `idx_category_associations_cat_b ON category_associations(category_b_id)`
- `idx_category_associations_lookup ON category_associations(category_a_id, association_type, time_window_days)` — hot query path (mirrors product_associations)

---

### 5. `product_popularity` — Per-product signals (new)

One row per product, keyed directly by `zoho_item_id` (1:1 with items, so the FK is the PK — no BIGSERIAL needed). Updated regularly by a background job.

| Column | Type | Notes |
|---|---|---|
| `zoho_item_id` | `TEXT PRIMARY KEY REFERENCES items(zoho_item_id) ON DELETE CASCADE` | |
| `order_count_7d` | `INTEGER NOT NULL DEFAULT 0` | |
| `order_count_30d` | `INTEGER NOT NULL DEFAULT 0` | |
| `order_count_90d` | `INTEGER NOT NULL DEFAULT 0` | |
| `quantity_sold_30d` | `INTEGER NOT NULL DEFAULT 0` | Total units across all orders |
| `revenue_30d` | `DECIMAL(12,2) NOT NULL DEFAULT 0` | |
| `repeat_purchase_rate` | `DECIMAL(5,4)` | 0.0–1.0; fraction of buyers who bought >1× |
| `category_id` | `TEXT` | Soft reference to `items.category_id` (no FK — same intentional omission as on `items` itself). Stored here so rank-within-category queries are self-contained without joining to `items` |
| `category_rank` | `INTEGER` | Rank within `category_id` by 30d order count; nullable until computed |
| `computed_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

**Indexes:**
- `idx_product_popularity_trending ON product_popularity(order_count_30d DESC) WHERE order_count_30d > 0` — partial index for trending queries
- `idx_product_popularity_category_rank ON product_popularity(category_id, category_rank)` — composite for rank-within-category queries

---

### 6. `customer_profiles` — Per-customer purchase summary (new)

One row per contact, keyed by `zoho_contact_id`. Refreshed weekly by a background job. `system_affinity` FKs to `system_types` so it shares the same domain as `items.system_type`.

| Column | Type | Notes |
|---|---|---|
| `zoho_contact_id` | `TEXT PRIMARY KEY REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE` | |
| `system_affinity` | `TEXT REFERENCES system_types(system_type_code)` | Dominant system type in their order history; nullable |
| `brand_affinity` | `TEXT` | Most-purchased brand; nullable if no clear preference |
| `buyer_tier` | `TEXT NOT NULL DEFAULT 'low'` CHECK `(buyer_tier IN ('high','medium','low'))` | Based on order frequency in last 90d |
| `last_order_date` | `DATE` | |
| `order_count_90d` | `INTEGER NOT NULL DEFAULT 0` | |
| `is_repeat_buyer` | `BOOLEAN NOT NULL DEFAULT false` | |
| `refreshed_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

**Indexes:**
- `idx_customer_profiles_system_affinity ON customer_profiles(system_affinity)`
- `idx_customer_profiles_buyer_tier ON customer_profiles(buyer_tier)`

---

## RLS

All new tables (`system_types`, `product_associations`, `category_associations`, `product_popularity`, `customer_profiles`) will have RLS enabled. `system_types` gets a public-read policy (it's reference data, safe to expose). The four others are service-role-only (no public policy), consistent with transactional/application tables.

---

## Migration File

Single timestamped file: `supabase/migrations/20260324000001_recommendation_foundation.sql`

All DDL must use `IF NOT EXISTS` guards (project-wide convention). Sections in order:
1. `CREATE TABLE IF NOT EXISTS system_types` + seed `INSERT … ON CONFLICT DO NOTHING`
2. `ALTER TABLE items ADD COLUMN IF NOT EXISTS` (system_type, system_type_source)
3. `CREATE TABLE IF NOT EXISTS product_associations`
4. `CREATE TABLE IF NOT EXISTS category_associations`
5. `CREATE TABLE IF NOT EXISTS product_popularity`
6. `CREATE TABLE IF NOT EXISTS customer_profiles`
7. All indexes (`CREATE INDEX IF NOT EXISTS`)
8. Trigger on `system_types` — reuse existing `update_updated_at_column()` function from `005_triggers.sql`
9. RLS (`ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policies)

**`brand_affinity` FK note:** `customer_profiles.brand_affinity` is a soft TEXT reference, consistent with `items.brand` which also has no FK to `brands`. The `brands` table exists but `items` does not constrain against it, so we follow the same pattern here.

**`computed_at` vs `updated_at` on association tables:** `product_associations` and `category_associations` use `computed_at` (not `updated_at`) as these tables are always fully replaced by ETL — not updated in place. No trigger needed on these. Similarly, `customer_profiles` uses `refreshed_at` — no trigger needed there either. `system_types` is the only new table with `updated_at` and gets a trigger.

**Trigger idempotency:** `CREATE TRIGGER IF NOT EXISTS` was added in Postgres 16; Supabase defaults to Postgres 15. The `system_types` trigger must be written as `DROP TRIGGER IF EXISTS system_types_updated_at ON system_types; CREATE TRIGGER system_types_updated_at …` to be safe on re-runs.

---

## What This Does NOT Include

- The computation/ETL logic (background jobs that populate these tables)
- API endpoints or Edge Functions to serve recommendations
- Any UI changes
- Zoho sync for `system_types` (future integrator work)
