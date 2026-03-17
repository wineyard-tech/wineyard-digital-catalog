-- Fix: wrap UNION ALL in subquery to avoid PL/pgSQL OUT-parameter name ambiguity
-- in the ORDER BY clause (column ref "brand" was ambiguous with RETURNS TABLE param)

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
      m.brand         AS brand,
      COUNT(*)        AS brand_count,
      NULL::TEXT      AS category,
      NULL::BIGINT    AS category_count
    FROM matched m
    WHERE m.brand IS NOT NULL AND m.brand <> ''
    GROUP BY m.brand

    UNION ALL

    -- Category facets (brand columns are NULL)
    SELECT
      NULL::TEXT      AS brand,
      NULL::BIGINT    AS brand_count,
      m.category_name AS category,
      COUNT(*)        AS category_count
    FROM matched m
    WHERE m.category_name IS NOT NULL AND m.category_name <> ''
    GROUP BY m.category_name
  ) AS f
  ORDER BY
    CASE WHEN f.brand IS NOT NULL THEN 0 ELSE 1 END,
    COALESCE(f.brand_count, f.category_count) DESC;

END;
$$ LANGUAGE plpgsql STABLE;
