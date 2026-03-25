-- product_popularity table — compatible with develop branch's
-- 20260324000001_recommendation_foundation.sql schema.
-- Uses CREATE TABLE IF NOT EXISTS so it is a no-op when the
-- recommendation_foundation migration has already run.

CREATE TABLE IF NOT EXISTS product_popularity (
  zoho_item_id          TEXT PRIMARY KEY REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  order_count_7d        INTEGER       NOT NULL DEFAULT 0,
  order_count_30d       INTEGER       NOT NULL DEFAULT 0,
  order_count_90d       INTEGER       NOT NULL DEFAULT 0,
  quantity_sold_30d     INTEGER       NOT NULL DEFAULT 0,
  revenue_30d           DECIMAL(12,2) NOT NULL DEFAULT 0,
  repeat_purchase_rate  DECIMAL(5,4)  CHECK (repeat_purchase_rate BETWEEN 0 AND 1),
  category_id           TEXT,
  category_rank         INTEGER,
  computed_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_popularity_trending
  ON product_popularity(order_count_30d DESC) WHERE order_count_30d > 0;

-- Refresh function: upserts 7d / 30d / all-time order counts and 30d quantity
-- from sales_orders line_items JSONB. Safe to call repeatedly.
CREATE OR REPLACE FUNCTION refresh_product_popularity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO product_popularity (
    zoho_item_id,
    order_count_7d,
    order_count_30d,
    order_count_90d,
    quantity_sold_30d,
    computed_at
  )
  SELECT
    li->>'zoho_item_id'                                                                          AS zoho_item_id,
    COUNT(DISTINCT CASE WHEN so.created_at >= NOW() - INTERVAL '7 days'  THEN so.id END)::INTEGER AS order_count_7d,
    COUNT(DISTINCT CASE WHEN so.created_at >= NOW() - INTERVAL '30 days' THEN so.id END)::INTEGER AS order_count_30d,
    COUNT(DISTINCT CASE WHEN so.created_at >= NOW() - INTERVAL '90 days' THEN so.id END)::INTEGER AS order_count_90d,
    COALESCE(SUM(
      CASE WHEN so.created_at >= NOW() - INTERVAL '30 days'
           THEN (li->>'quantity')::INTEGER ELSE 0 END
    ), 0)::INTEGER                                                                               AS quantity_sold_30d,
    NOW()
  FROM sales_orders so,
    jsonb_array_elements(so.line_items) AS li
  WHERE so.zoho_sync_status != 'failed'
    AND (li->>'zoho_item_id') IS NOT NULL
  GROUP BY li->>'zoho_item_id'
  ON CONFLICT (zoho_item_id) DO UPDATE
    SET order_count_7d    = EXCLUDED.order_count_7d,
        order_count_30d   = EXCLUDED.order_count_30d,
        order_count_90d   = EXCLUDED.order_count_90d,
        quantity_sold_30d = EXCLUDED.quantity_sold_30d,
        computed_at       = NOW();
END;
$$;
