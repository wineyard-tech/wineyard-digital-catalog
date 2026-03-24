-- Product Popularity: table, refresh function, and pg_cron schedule
-- Refreshes daily at 04:30 AM IST (23:00 UTC) — after sync-contacts (22:35 UTC).
--
-- Basket deduplication strategy (3 sources):
--   Priority: invoice (3) > sales_order (2) > estimate (1)
--   1. Link-based: drop estimates explicitly linked to an invoice via estimate_number;
--      drop SOs whose source estimate is invoice-covered (EST → SO → INV chain).
--   2. Fuzzy: for remaining baskets, drop any basket dominated by a higher-priority
--      basket from the same customer, within 30 days, with ≥70% item overlap.
-- Estimate supplement rule:
--   Estimate-sourced baskets only contribute to order counts when the product has
--   fewer than 15 invoice baskets in the last 30 days. Capped at 0.5 weight.
-- Excludes items with system_type = 'service'.

-- ── 1. system_type column on items (idempotent — also in recommendation_foundation) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'system_type'
  ) THEN
    ALTER TABLE items ADD COLUMN system_type TEXT;
  END IF;
END $$;

-- ── 2. product_popularity table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_popularity (
  zoho_item_id          TEXT PRIMARY KEY REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  order_count_7d        INTEGER   NOT NULL DEFAULT 0,
  order_count_30d       INTEGER   NOT NULL DEFAULT 0,
  order_count_90d       INTEGER   NOT NULL DEFAULT 0,
  quantity_sold_30d     NUMERIC   NOT NULL DEFAULT 0,
  revenue_30d           NUMERIC   NOT NULL DEFAULT 0,
  repeat_purchase_rate  NUMERIC   NOT NULL DEFAULT 0 CHECK (repeat_purchase_rate BETWEEN 0 AND 1),
  category_id           TEXT,
  category_rank         INTEGER,           -- NULL when product has no category
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_popularity_trending
  ON product_popularity (order_count_30d DESC)
  WHERE order_count_30d > 0;

CREATE INDEX IF NOT EXISTS idx_product_popularity_category_rank
  ON product_popularity (category_id, category_rank)
  WHERE category_id IS NOT NULL;

-- Index to speed up the link-based dedup join on estimate_number
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_number
  ON invoices (estimate_number)
  WHERE estimate_number IS NOT NULL;

-- ── 3. refresh_product_popularity() ──────────────────────────────────────────
-- Sources: invoices, sales_orders, estimates — all deduplicated before counting.
-- Returns: { products_refreshed, duration_ms, computed_at }

CREATE OR REPLACE FUNCTION refresh_product_popularity()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_upserted int;
  v_start    timestamptz := clock_timestamp();
BEGIN
  WITH

  -- ── Step 1: Collect raw baskets from all 3 sources (90-day window) ─────────
  raw_baskets AS (
    SELECT
      'inv:' || id::text  AS basket_id,
      'invoice'           AS source,
      3                   AS priority,
      zoho_contact_id,
      COALESCE(created_at, date::timestamptz) AS created_at,
      estimate_number     AS linked_est_number,
      NULL::bigint        AS linked_so_id,
      line_items
    FROM invoices
    WHERE jsonb_array_length(line_items) > 0
      AND COALESCE(created_at, date::timestamptz) >= NOW() - INTERVAL '90 days'

    UNION ALL

    SELECT
      'so:' || id::text,
      'sales_order',
      2,
      zoho_contact_id,
      created_at,
      NULL,
      converted_from_estimate_id,
      line_items
    FROM sales_orders
    WHERE jsonb_array_length(line_items) > 0
      AND created_at >= NOW() - INTERVAL '90 days'

    UNION ALL

    SELECT
      'est:' || id::text,
      'estimate',
      1,
      zoho_contact_id,
      created_at,
      estimate_number,
      NULL,
      line_items
    FROM estimates
    WHERE jsonb_array_length(line_items) > 0
      AND created_at >= NOW() - INTERVAL '90 days'
  ),

  -- ── Step 2a: Estimates explicitly covered by an invoice ────────────────────
  -- Match: invoices.estimate_number = estimates.estimate_number
  inv_covered_est_numbers AS (
    SELECT DISTINCT estimate_number
    FROM invoices
    WHERE estimate_number IS NOT NULL
  ),

  -- ── Step 2b: SOs transitively covered via their source estimate ────────────
  -- Chain: EST → SO (via sales_orders.converted_from_estimate_id) and EST covered by INV
  inv_covered_so_ids AS (
    SELECT so.id AS so_id
    FROM sales_orders so
    JOIN estimates e ON e.id = so.converted_from_estimate_id
    WHERE e.estimate_number IN (SELECT estimate_number FROM inv_covered_est_numbers)
  ),

  -- ── Step 3: Link-based dedup — remove upstream docs with explicit coverage ─
  link_deduped AS (
    SELECT *
    FROM raw_baskets
    WHERE NOT (
      source = 'estimate'
      AND linked_est_number IN (SELECT estimate_number FROM inv_covered_est_numbers)
    )
    AND NOT (
      source = 'sales_order'
      AND linked_so_id IN (SELECT so_id FROM inv_covered_so_ids)
    )
  ),

  -- ── Step 4: Compute item-set per basket for fuzzy dedup ────────────────────
  -- Separated from line_items to avoid GROUP BY on JSONB
  basket_item_sets AS (
    SELECT
      ld.basket_id,
      ARRAY_AGG(DISTINCT li->>'zoho_item_id' ORDER BY li->>'zoho_item_id') AS item_ids,
      COUNT(DISTINCT li->>'zoho_item_id')::int                              AS item_count
    FROM link_deduped ld,
         jsonb_array_elements(ld.line_items) AS li
    WHERE li->>'zoho_item_id' IS NOT NULL
    GROUP BY ld.basket_id
  ),

  full_baskets AS (
    SELECT
      ld.basket_id, ld.source, ld.priority,
      ld.zoho_contact_id, ld.created_at, ld.line_items,
      bis.item_ids, bis.item_count
    FROM link_deduped ld
    JOIN basket_item_sets bis USING (basket_id)
  ),

  -- ── Step 5: Fuzzy dedup — drop baskets dominated by a higher-priority basket ─
  -- Dominated = same customer + within 30 days + higher priority source
  --             + item overlap ≥ 70% of the larger basket's items
  dominated_baskets AS (
    SELECT DISTINCT a.basket_id
    FROM full_baskets a
    JOIN full_baskets b
      ON  b.zoho_contact_id  = a.zoho_contact_id
      AND b.basket_id       != a.basket_id
      AND b.priority         > a.priority
      AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at)) / 86400) <= 30
    WHERE (
      SELECT COUNT(*) FROM UNNEST(a.item_ids) x WHERE x = ANY(b.item_ids)
    )::float / GREATEST(a.item_count, b.item_count) >= 0.7
  ),

  clean_baskets AS (
    SELECT * FROM full_baskets
    WHERE basket_id NOT IN (SELECT basket_id FROM dominated_baskets)
  ),

  -- ── Step 6: Expand clean baskets to item level ─────────────────────────────
  basket_items AS (
    SELECT
      b.basket_id,
      b.source,
      b.zoho_contact_id,
      b.created_at,
      li->>'zoho_item_id'          AS zoho_item_id,
      (li->>'quantity')::numeric   AS quantity,
      (li->>'line_total')::numeric AS line_total
    FROM clean_baskets b,
         jsonb_array_elements(b.line_items) AS li
    WHERE li->>'zoho_item_id' IS NOT NULL
  ),

  -- ── Step 7: Invoice-only 30d basket count per item ─────────────────────────
  -- This is the threshold for estimate supplement eligibility (< 15 = supplement)
  invoice_count_30d AS (
    SELECT
      zoho_item_id,
      COUNT(DISTINCT CASE WHEN source = 'invoice'
                          AND created_at >= NOW() - INTERVAL '30 days'
                          THEN basket_id END)::int AS inv_count
    FROM basket_items
    GROUP BY zoho_item_id
  ),

  -- ── Step 8: Per-customer basket counts per item (for repeat-purchase rate) ──
  customer_item_counts AS (
    SELECT
      zoho_item_id,
      zoho_contact_id,
      COUNT(DISTINCT basket_id) AS purchase_count
    FROM basket_items
    WHERE zoho_contact_id IS NOT NULL
    GROUP BY zoho_item_id, zoho_contact_id
  ),

  -- ── Step 9: Aggregate invoice+SO (authoritative) and estimate (supplemental) ─
  item_agg AS (
    SELECT
      bi.zoho_item_id,
      -- Authoritative counts (invoice + SO only)
      COUNT(DISTINCT CASE WHEN bi.source IN ('invoice','sales_order')
                          AND bi.created_at >= NOW() - INTERVAL '7 days'
                          THEN bi.basket_id END)::int                      AS inv_so_7d,
      COUNT(DISTINCT CASE WHEN bi.source IN ('invoice','sales_order')
                          AND bi.created_at >= NOW() - INTERVAL '30 days'
                          THEN bi.basket_id END)::int                      AS inv_so_30d,
      COUNT(DISTINCT CASE WHEN bi.source IN ('invoice','sales_order')
                          THEN bi.basket_id END)::int                      AS inv_so_90d,
      -- Supplemental estimate counts (raw, weight applied later)
      COUNT(DISTINCT CASE WHEN bi.source = 'estimate'
                          AND bi.created_at >= NOW() - INTERVAL '30 days'
                          THEN bi.basket_id END)::int                      AS est_30d,
      COUNT(DISTINCT CASE WHEN bi.source = 'estimate'
                          THEN bi.basket_id END)::int                      AS est_90d,
      -- Revenue and quantity (invoice+SO authoritative)
      SUM(CASE WHEN bi.source IN ('invoice','sales_order')
               AND bi.created_at >= NOW() - INTERVAL '30 days'
               THEN bi.quantity   ELSE 0 END)                              AS qty_inv_so_30d,
      SUM(CASE WHEN bi.source = 'estimate'
               AND bi.created_at >= NOW() - INTERVAL '30 days'
               THEN bi.quantity   ELSE 0 END)                              AS qty_est_30d,
      SUM(CASE WHEN bi.source IN ('invoice','sales_order')
               AND bi.created_at >= NOW() - INTERVAL '30 days'
               THEN bi.line_total ELSE 0 END)                              AS rev_inv_so_30d,
      SUM(CASE WHEN bi.source = 'estimate'
               AND bi.created_at >= NOW() - INTERVAL '30 days'
               THEN bi.line_total ELSE 0 END)                              AS rev_est_30d,
      ic.inv_count
    FROM basket_items bi
    JOIN invoice_count_30d ic USING (zoho_item_id)
    GROUP BY bi.zoho_item_id, ic.inv_count
  ),

  -- ── Step 10: Repeat-purchase rate ──────────────────────────────────────────
  -- Computed on the deduplicated basket set (all sources, 90d window)
  repeat_rates AS (
    SELECT
      zoho_item_id,
      CASE WHEN COUNT(*) = 0 THEN 0.0
           ELSE COUNT(CASE WHEN purchase_count > 1 THEN 1 END)::float / COUNT(*)
      END::numeric(5,4) AS repeat_purchase_rate
    FROM customer_item_counts
    GROUP BY zoho_item_id
  ),

  -- ── Step 11: Apply estimate supplement rule ─────────────────────────────────
  -- Estimates supplement only when invoice_count_30d < 15, capped at 0.5 weight.
  -- Category rank uses invoice+SO count only (pure signal, no estimate dilution).
  item_stats AS (
    SELECT
      a.zoho_item_id,
      -- 7d: invoice+SO only (most reliable trending signal, no estimate supplement)
      a.inv_so_7d                                                                              AS order_count_7d,
      -- 30d and 90d: supplement with estimates at 0.5 weight when inv_count < 15
      ROUND(a.inv_so_30d + CASE WHEN a.inv_count < 15 THEN a.est_30d * 0.5 ELSE 0 END)::int  AS order_count_30d,
      ROUND(a.inv_so_90d + CASE WHEN a.inv_count < 15 THEN a.est_90d * 0.5 ELSE 0 END)::int  AS order_count_90d,
      a.inv_so_30d                                                                             AS rank_count_30d,
      a.qty_inv_so_30d + CASE WHEN a.inv_count < 15 THEN a.qty_est_30d ELSE 0 END             AS quantity_sold_30d,
      a.rev_inv_so_30d + CASE WHEN a.inv_count < 15 THEN a.rev_est_30d ELSE 0 END             AS revenue_30d,
      COALESCE(r.repeat_purchase_rate, 0.0)                                                    AS repeat_purchase_rate
    FROM item_agg a
    LEFT JOIN repeat_rates r USING (zoho_item_id)
  ),

  -- ── Step 12: Join items for category; exclude service products; rank ────────
  product_data AS (
    SELECT s.*, i.category_id
    FROM item_stats s
    JOIN items i ON i.zoho_item_id = s.zoho_item_id
    WHERE (i.system_type IS DISTINCT FROM 'service')
      AND i.status = 'active'
  ),

  -- Rank within category by invoice+SO 30d count (rank 1 = most ordered)
  -- Products without a category get rank NULL
  ranked AS (
    SELECT
      *,
      RANK() OVER (PARTITION BY category_id ORDER BY rank_count_30d DESC)::int AS _cat_rank
    FROM product_data
  )

  INSERT INTO product_popularity (
    zoho_item_id,
    order_count_7d, order_count_30d, order_count_90d,
    quantity_sold_30d, revenue_30d, repeat_purchase_rate,
    category_id, category_rank, computed_at
  )
  SELECT
    zoho_item_id,
    order_count_7d, order_count_30d, order_count_90d,
    quantity_sold_30d, revenue_30d, repeat_purchase_rate,
    category_id,
    CASE WHEN category_id IS NOT NULL THEN _cat_rank END,
    NOW()
  FROM ranked
  ON CONFLICT (zoho_item_id) DO UPDATE SET
    order_count_7d       = EXCLUDED.order_count_7d,
    order_count_30d      = EXCLUDED.order_count_30d,
    order_count_90d      = EXCLUDED.order_count_90d,
    quantity_sold_30d    = EXCLUDED.quantity_sold_30d,
    revenue_30d          = EXCLUDED.revenue_30d,
    repeat_purchase_rate = EXCLUDED.repeat_purchase_rate,
    category_id          = EXCLUDED.category_id,
    category_rank        = EXCLUDED.category_rank,
    computed_at          = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'products_refreshed', v_upserted,
    'duration_ms',        EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::int,
    'computed_at',        NOW()
  );
END;
$$;

-- ── 4. pg_cron schedule ───────────────────────────────────────────────────────
-- 04:30 AM IST = 23:00 UTC (previous calendar day)
-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> after deploying the function.

/*
SELECT cron.schedule('refresh-product-popularity', '0 23 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/refresh-product-popularity',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);
*/

-- After running, verify: SELECT * FROM cron.job;
