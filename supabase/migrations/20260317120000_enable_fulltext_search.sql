-- ─────────────────────────────────────────────────────────────────────────────
-- Full-text search: RPC functions + backfill
-- Column, indexes, and trigger already exist from 002/003/004/005 migrations.
-- This migration:
--   1. Corrects sku weight to 'A' (was 'C')
--   2. Adds search_items RPC
--   3. Adds get_search_facets RPC
--   4. Backfills existing rows
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix trigger function: sku promoted to weight A ─────────────────────────
CREATE OR REPLACE FUNCTION items_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.item_name,     '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.sku,           '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand,         '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.description,   '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Backfill existing rows ─────────────────────────────────────────────────
-- Touch updated_at so the BEFORE UPDATE trigger fires and rebuilds search_vector.
UPDATE items SET updated_at = NOW();

-- ── 3. search_items RPC ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_items(
  search_query    TEXT,
  brand_filter    TEXT    DEFAULT NULL,
  category_filter TEXT    DEFAULT NULL,
  min_price       DECIMAL DEFAULT NULL,
  max_price       DECIMAL DEFAULT NULL,
  in_stock_only   BOOLEAN DEFAULT FALSE,
  result_limit    INT     DEFAULT 50
)
RETURNS TABLE (
  zoho_item_id      TEXT,
  item_name         TEXT,
  sku               TEXT,
  brand             TEXT,
  category_name     TEXT,
  description       TEXT,
  base_rate         DECIMAL,
  available_stock   INTEGER,
  status            TEXT,
  image_urls        JSONB,
  rank              REAL
) AS $$
DECLARE
  ts_query tsquery;
BEGIN
  -- Build query: fall back to prefix search when websearch_to_tsquery returns NULL
  -- (e.g. single non-word characters or very short tokens)
  ts_query := websearch_to_tsquery('english', search_query);
  IF ts_query IS NULL THEN
    ts_query := to_tsquery('english', search_query || ':*');
  END IF;

  RETURN QUERY
  SELECT
    i.zoho_item_id,
    i.item_name,
    i.sku,
    i.brand,
    i.category_name,
    i.description,
    i.base_rate,
    i.available_stock,
    i.status,
    i.image_urls,
    ts_rank(i.search_vector, ts_query)::REAL AS rank
  FROM items i
  WHERE
    i.status = 'active'
    AND i.search_vector @@ ts_query
    AND (brand_filter    IS NULL OR i.brand         = brand_filter)
    AND (category_filter IS NULL OR i.category_name = category_filter)
    AND (min_price       IS NULL OR i.base_rate     >= min_price)
    AND (max_price       IS NULL OR i.base_rate     <= max_price)
    AND (in_stock_only = FALSE    OR i.available_stock > 0)
  ORDER BY
    ts_rank(i.search_vector, ts_query) DESC,
    i.item_name ASC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── 4. get_search_facets RPC ──────────────────────────────────────────────────
-- Returns one row per brand (with NULL category columns) followed by one row
-- per category (with NULL brand columns).  Callers split on which column is
-- non-null to build two facet lists.
CREATE OR REPLACE FUNCTION get_search_facets(
  search_query TEXT DEFAULT NULL
)
RETURNS TABLE (
  brand          TEXT,
  brand_count    BIGINT,
  category       TEXT,
  category_count BIGINT
) AS $$
DECLARE
  ts_query tsquery;
BEGIN
  IF search_query IS NOT NULL AND search_query <> '' THEN
    ts_query := websearch_to_tsquery('english', search_query);
  END IF;

  RETURN QUERY
  SELECT f.brand, f.brand_count, f.category, f.category_count
  FROM (
    WITH matched AS (
      SELECT i.brand, i.category_name
      FROM items i
      WHERE
        i.status = 'active'
        AND (ts_query IS NULL OR i.search_vector @@ ts_query)
    )
    -- Brand facets (category columns are NULL)
    SELECT
      m.brand            AS brand,
      COUNT(*)           AS brand_count,
      NULL::TEXT         AS category,
      NULL::BIGINT       AS category_count
    FROM matched m
    WHERE m.brand IS NOT NULL AND m.brand <> ''
    GROUP BY m.brand

    UNION ALL

    -- Category facets (brand columns are NULL)
    SELECT
      NULL::TEXT         AS brand,
      NULL::BIGINT       AS brand_count,
      m.category_name    AS category,
      COUNT(*)           AS category_count
    FROM matched m
    WHERE m.category_name IS NOT NULL AND m.category_name <> ''
    GROUP BY m.category_name
  ) AS f
  ORDER BY
    CASE WHEN f.brand IS NOT NULL THEN 0 ELSE 1 END,
    COALESCE(f.brand_count, f.category_count) DESC;

END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run manually after applying):
--
--   SELECT * FROM search_items('camera') LIMIT 5;
--   SELECT * FROM search_items('hikvision', 'Hikvision') LIMIT 5;
--   SELECT * FROM search_items('camera', NULL, NULL, 5000, 10000) LIMIT 5;
--   SELECT * FROM search_items('camera', NULL, NULL, NULL, NULL, TRUE) LIMIT 5;
--   SELECT * FROM get_search_facets('camera') LIMIT 20;
--   EXPLAIN ANALYZE SELECT * FROM search_items('camera');
-- ─────────────────────────────────────────────────────────────────────────────
