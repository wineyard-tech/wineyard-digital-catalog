-- product_associations table
-- Stores precomputed market-basket analysis results.
-- Populated weekly by the compute-product-associations edge function.
-- Always stored with item_id_a < item_id_b (alphabetic) to prevent duplicate pairs.

CREATE TABLE IF NOT EXISTS product_associations (
  id                  BIGSERIAL PRIMARY KEY,
  item_id_a           TEXT        NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  item_id_b           TEXT        NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  association_type    TEXT        NOT NULL CHECK (association_type IN ('frequently_bought_together', 'people_also_buy')),
  co_occurrence_count     INTEGER     NOT NULL,
  -- Metrics populated for frequently_bought_together only
  support                 DECIMAL(10, 6),
  confidence_a_to_b       DECIMAL(10, 6),
  confidence_b_to_a       DECIMAL(10, 6),
  lift                    DECIMAL(10, 4),
  -- True when estimate baskets were used to supplement invoice co-occurrences to reach threshold.
  -- Indicates lower confidence signal; confidence values are already capped at 0.5 in this case.
  estimate_supplemented   BOOLEAN     NOT NULL DEFAULT FALSE,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Canonical ordering: item_id_a must be lexicographically less than item_id_b
  CONSTRAINT chk_canonical_order CHECK (item_id_a < item_id_b),
  CONSTRAINT uq_product_association UNIQUE (item_id_a, item_id_b, association_type)
);

-- Lookup by either item in a pair (both directions)
CREATE INDEX idx_product_assoc_a      ON product_associations (item_id_a, association_type);
CREATE INDEX idx_product_assoc_b      ON product_associations (item_id_b, association_type);
CREATE INDEX idx_product_assoc_lift   ON product_associations (lift DESC) WHERE association_type = 'frequently_bought_together';
CREATE INDEX idx_product_assoc_cooc   ON product_associations (co_occurrence_count DESC);

COMMENT ON TABLE product_associations IS
  'Precomputed product affinity pairs. Refreshed weekly Sunday 8pm IST by compute-product-associations edge function.';
