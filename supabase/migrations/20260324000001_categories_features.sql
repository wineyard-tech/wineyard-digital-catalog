-- ─────────────────────────────────────────────────────────────────────────────
-- product_popularity: computed 30-day order count per item
-- Derives from sales_orders.line_items JSONB (CartItem format: {zoho_item_id, ...})
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW product_popularity AS
SELECT
  li->>'zoho_item_id'          AS zoho_item_id,
  COUNT(DISTINCT so.id)::int   AS order_count_30d
FROM sales_orders so
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(so.line_items) = 'array' THEN so.line_items ELSE '[]'::jsonb END
) AS li
WHERE so.created_at  >= NOW() - INTERVAL '30 days'
  AND so.status      NOT IN ('cancelled', 'void', 'draft')
  AND (li->>'zoho_item_id') IS NOT NULL
GROUP BY li->>'zoho_item_id';

-- ─────────────────────────────────────────────────────────────────────────────
-- category_associations: co-purchase affinity between category pairs
-- Populated externally (cron / admin script). lift = P(A∩B) / P(A)*P(B).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS category_associations (
  id                   BIGSERIAL PRIMARY KEY,
  category_a           TEXT NOT NULL REFERENCES categories(zoho_category_id) ON DELETE CASCADE,
  category_b           TEXT NOT NULL REFERENCES categories(zoho_category_id) ON DELETE CASCADE,
  co_occurrence_count  INTEGER     DEFAULT 0,
  lift                 DECIMAL(10,4) DEFAULT 1.0,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_a, category_b)
);

CREATE INDEX IF NOT EXISTS idx_category_assoc_a ON category_associations(category_a);
CREATE INDEX IF NOT EXISTS idx_category_assoc_b ON category_associations(category_b);
