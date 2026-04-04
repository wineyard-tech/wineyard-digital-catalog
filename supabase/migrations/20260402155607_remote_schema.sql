


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."classify_items_system_type"() RETURNS TABLE("system_type" "text", "item_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_universal_with_category BIGINT := 0;
BEGIN
  UPDATE items
  SET
    system_type        = CASE
      WHEN item_name ILIKE '%installation charges%'
        OR item_name ILIKE '%cabling charges%'
        OR item_name ILIKE '%wiring charges%'
        OR item_name ILIKE '%amc charges%'
        OR item_name ILIKE '%splicing charges%'
        OR item_name ILIKE '%configuration%'
        OR item_name ILIKE '%nvr / dvr config%'
        OR item_name ILIKE '%nvr/dvr config%'
        THEN 'service'
      WHEN category_name ILIKE '%dvr%'
        OR category_name ILIKE '%hd camera%'
        OR category_name ILIKE '%smps%'
        OR item_name ILIKE '%bnc wire%'
        OR item_name ILIKE '%dc wire%'
        OR item_name ILIKE '%3+1 cable%'
        OR item_name ILIKE '%3+1 cctv cable%'
        OR item_name ILIKE '%video balun%'
        OR item_name ILIKE '%cmos battery for dvr%'
        THEN 'analog_hd'
      WHEN (
          category_name ILIKE '%nvr%'
          OR category_name ILIKE '%ip camera%'
          OR category_name ILIKE '%poe switch%'
          OR item_name ILIKE '%cat6%'
          OR item_name ILIKE '%rj45%'
          OR item_name ILIKE '%poe splitter%'
          OR item_name ILIKE '%network switch%'
        )
        AND item_name NOT ILIKE '%wifi%'
        AND item_name NOT ILIKE '%4g%'
        THEN 'ip_network'
      WHEN category_name ILIKE '%wifi camera%'
        OR (item_name ILIKE '%wifi%' AND item_name ILIKE '%camera%')
        OR item_name ILIKE '%wireless bridge%'
        OR item_name ILIKE '%wifi router%'
        OR item_name ILIKE '%wifi dongle%'
        THEN 'wifi'
      WHEN category_name ILIKE '%solar camera%'
        OR category_name ILIKE '%4g sim camera%'
        OR item_name ILIKE '%4g sim router%'
        OR item_name ILIKE '%4g/5g sim router%'
        OR item_name ILIKE '%solar%'
        THEN 'standalone_remote'
      WHEN category_name ILIKE '%fiber optic products%'
        OR item_name ILIKE '%fiber optic%'
        OR item_name ILIKE '%media converter%'
        OR item_name ILIKE '%sfp module%'
        OR item_name ILIKE '%splicing tray%'
        THEN 'fiber_optic'
      ELSE 'universal'
    END,
    system_type_source = 'auto',
    updated_at         = NOW()
  WHERE items.system_type IS NULL;

  SELECT COUNT(*) INTO v_universal_with_category
  FROM items i
  WHERE i.system_type        = 'universal'
    AND i.system_type_source = 'auto'
    AND i.category_name IS NOT NULL
    AND i.category_name      <> '';

  IF v_universal_with_category > 0 THEN
    RAISE NOTICE
      'classify_items_system_type: % item(s) fell through to ''universal'' but have a non-empty category_name — consider adding a classification rule or manually assigning system_type.',
      v_universal_with_category;
  END IF;

  RETURN QUERY
  SELECT i.system_type, COUNT(*)::BIGINT AS item_count
  FROM   items i
  WHERE  i.system_type        IS NOT NULL
    AND  i.system_type_source  = 'auto'
  GROUP  BY i.system_type
  ORDER  BY item_count DESC;
END;
$$;


ALTER FUNCTION "public"."classify_items_system_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_sessions"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_count INTEGER := 0; v_n INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE expires_at < NOW() OR last_activity_at < NOW() - INTERVAL '15 days';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  DELETE FROM auth_requests
  WHERE ref_expires_at < NOW() OR used = TRUE;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  DELETE FROM guest_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_estimate_to_salesorder"("p_estimate_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_so_id BIGINT;
BEGIN
  INSERT INTO sales_orders (
    zoho_contact_id, contact_phone, line_items,
    subtotal, tax_total, total, notes, converted_from_estimate_id, status
  )
  SELECT zoho_contact_id, contact_phone, line_items,
         subtotal, tax_total, total, notes, id, 'confirmed'
  FROM estimates WHERE id = p_estimate_id
  RETURNING id INTO v_so_id;

  UPDATE estimates
  SET status = 'converted', converted_to_salesorder_id = v_so_id, converted_at = NOW()
  WHERE id = p_estimate_id;

  RETURN v_so_id;
END;
$$;


ALTER FUNCTION "public"."convert_estimate_to_salesorder"("p_estimate_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_search_facets"("search_query" "text" DEFAULT NULL::"text") RETURNS TABLE("brand" "text", "brand_count" bigint, "category" "text", "category_count" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."get_search_facets"("search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."items_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.item_name,     '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.sku,           '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand,         '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.description,   '')), 'D');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."items_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_product_popularity"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_upserted int;
  v_start    timestamptz := clock_timestamp();
BEGIN
  WITH
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
  inv_covered_est_numbers AS (
    SELECT DISTINCT estimate_number
    FROM invoices
    WHERE estimate_number IS NOT NULL
  ),
  inv_covered_so_ids AS (
    SELECT so.id AS so_id
    FROM sales_orders so
    JOIN estimates e ON e.id = so.converted_from_estimate_id
    WHERE e.estimate_number IN (SELECT estimate_number FROM inv_covered_est_numbers)
  ),
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
  invoice_count_30d AS (
    SELECT
      zoho_item_id,
      COUNT(DISTINCT CASE WHEN source = 'invoice'
                          AND created_at >= NOW() - INTERVAL '30 days'
                          THEN basket_id END)::int AS inv_count
    FROM basket_items
    GROUP BY zoho_item_id
  ),
  customer_item_counts AS (
    SELECT
      zoho_item_id,
      zoho_contact_id,
      COUNT(DISTINCT basket_id) AS purchase_count
    FROM basket_items
    WHERE zoho_contact_id IS NOT NULL
    GROUP BY zoho_item_id, zoho_contact_id
  ),
  item_agg AS (
    SELECT
      bi.zoho_item_id,
      COUNT(DISTINCT CASE WHEN bi.source IN ('invoice','sales_order')
                          AND bi.created_at >= NOW() - INTERVAL '7 days'
                          THEN bi.basket_id END)::int                      AS inv_so_7d,
      COUNT(DISTINCT CASE WHEN bi.source IN ('invoice','sales_order')
                          AND bi.created_at >= NOW() - INTERVAL '30 days'
                          THEN bi.basket_id END)::int                      AS inv_so_30d,
      COUNT(DISTINCT CASE WHEN bi.source IN ('invoice','sales_order')
                          THEN bi.basket_id END)::int                      AS inv_so_90d,
      COUNT(DISTINCT CASE WHEN bi.source = 'estimate'
                          AND bi.created_at >= NOW() - INTERVAL '30 days'
                          THEN bi.basket_id END)::int                      AS est_30d,
      COUNT(DISTINCT CASE WHEN bi.source = 'estimate'
                          THEN bi.basket_id END)::int                      AS est_90d,
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
  repeat_rates AS (
    SELECT
      zoho_item_id,
      CASE WHEN COUNT(*) = 0 THEN 0.0
           ELSE COUNT(CASE WHEN purchase_count > 1 THEN 1 END)::float / COUNT(*)
      END::numeric(5,4) AS repeat_purchase_rate
    FROM customer_item_counts
    GROUP BY zoho_item_id
  ),
  item_stats AS (
    SELECT
      a.zoho_item_id,
      a.inv_so_7d                                                                              AS order_count_7d,
      ROUND(a.inv_so_30d + CASE WHEN a.inv_count < 15 THEN a.est_30d * 0.5 ELSE 0 END)::int  AS order_count_30d,
      ROUND(a.inv_so_90d + CASE WHEN a.inv_count < 15 THEN a.est_90d * 0.5 ELSE 0 END)::int  AS order_count_90d,
      a.inv_so_30d                                                                             AS rank_count_30d,
      a.qty_inv_so_30d + CASE WHEN a.inv_count < 15 THEN a.qty_est_30d ELSE 0 END             AS quantity_sold_30d,
      a.rev_inv_so_30d + CASE WHEN a.inv_count < 15 THEN a.rev_est_30d ELSE 0 END             AS revenue_30d,
      COALESCE(r.repeat_purchase_rate, 0.0)                                                    AS repeat_purchase_rate
    FROM item_agg a
    LEFT JOIN repeat_rates r USING (zoho_item_id)
  ),
  product_data AS (
    SELECT s.*, i.category_id
    FROM item_stats s
    JOIN items i ON i.zoho_item_id = s.zoho_item_id
    WHERE (i.system_type IS DISTINCT FROM 'service')
      AND i.status = 'active'
  ),
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


ALTER FUNCTION "public"."refresh_product_popularity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_items"("search_query" "text", "brand_filter" "text" DEFAULT NULL::"text", "category_filter" "text" DEFAULT NULL::"text", "min_price" numeric DEFAULT NULL::numeric, "max_price" numeric DEFAULT NULL::numeric, "in_stock_only" boolean DEFAULT false, "result_limit" integer DEFAULT 50) RETURNS TABLE("zoho_item_id" "text", "item_name" "text", "sku" "text", "brand" "text", "category_name" "text", "description" "text", "base_rate" numeric, "available_stock" integer, "status" "text", "image_urls" "jsonb", "rank" real)
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."search_items"("search_query" "text", "brand_filter" "text", "category_filter" "text", "min_price" numeric, "max_price" numeric, "in_stock_only" boolean, "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_guest_session_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_guest_session_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_session_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_session_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."auth_attempts" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "attempt_type" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auth_attempts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."auth_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."auth_attempts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."auth_attempts_id_seq" OWNED BY "public"."auth_attempts"."id";



CREATE TABLE IF NOT EXISTS "public"."auth_requests" (
    "id" bigint NOT NULL,
    "ref_id" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "zoho_contact_id" "text",
    "otp_code" "text" NOT NULL,
    "otp_expires_at" timestamp with time zone NOT NULL,
    "ref_expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auth_requests" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."auth_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."auth_requests_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."auth_requests_id_seq" OWNED BY "public"."auth_requests"."id";



CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" bigint NOT NULL,
    "brand_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "logo_url" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."brands_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."brands_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."brands_id_seq" OWNED BY "public"."brands"."id";



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "zoho_category_id" "text" NOT NULL,
    "category_name" "text" NOT NULL,
    "parent_category_id" "text",
    "status" "text" DEFAULT 'active'::"text",
    "display_order" integer DEFAULT 0,
    "icon_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_associations" (
    "id" bigint NOT NULL,
    "category_a_id" "text" NOT NULL,
    "category_b_id" "text" NOT NULL,
    "association_type" "text" NOT NULL,
    "co_occurrence_count" integer DEFAULT 0 NOT NULL,
    "lift_score" numeric(10,6),
    "confidence_a_to_b" numeric(10,6),
    "confidence_b_to_a" numeric(10,6),
    "time_window_days" integer NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_associations_association_type_check" CHECK (("association_type" = ANY (ARRAY['frequently_bought_together'::"text", 'people_also_buy'::"text"])))
);


ALTER TABLE "public"."category_associations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."category_associations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."category_associations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."category_associations_id_seq" OWNED BY "public"."category_associations"."id";



CREATE TABLE IF NOT EXISTS "public"."contact_persons" (
    "zoho_contact_person_id" "text" NOT NULL,
    "zoho_contact_id" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "mobile" "text",
    "is_primary" boolean DEFAULT false,
    "communication_preference" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "catalog_access" boolean DEFAULT false NOT NULL,
    "online_catalogue_access" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."contact_persons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "zoho_contact_id" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "company_name" "text",
    "contact_type" "text" DEFAULT 'customer'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "primary_contact_person_id" "text",
    "pricebook_id" "text",
    "phone" "text",
    "email" "text",
    "billing_address" "jsonb",
    "shipping_address" "jsonb",
    "payment_terms" integer,
    "payment_terms_label" "text",
    "currency_id" "text",
    "currency_code" "text" DEFAULT 'INR'::"text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "created_time" timestamp with time zone,
    "last_modified_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "online_catalogue_access" boolean DEFAULT false NOT NULL,
    "catalog_access" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_profiles" (
    "zoho_contact_id" "text" NOT NULL,
    "system_affinity" "text",
    "brand_affinity" "text",
    "buyer_tier" "text" DEFAULT 'low'::"text" NOT NULL,
    "last_order_date" "date",
    "order_count_90d" integer DEFAULT 0 NOT NULL,
    "is_repeat_buyer" boolean DEFAULT false NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_profiles_buyer_tier_check" CHECK (("buyer_tier" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))
);


ALTER TABLE "public"."customer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estimates" (
    "id" bigint NOT NULL,
    "zoho_estimate_id" "text",
    "estimate_number" "text",
    "zoho_contact_id" "text",
    "contact_phone" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "expiry_date" "date",
    "line_items" "jsonb" NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "tax_total" numeric(10,2) NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "notes" "text",
    "whatsapp_sent" boolean DEFAULT false,
    "whatsapp_sent_at" timestamp with time zone,
    "converted_to_salesorder_id" bigint,
    "converted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "public_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cart_hash" "text",
    "zoho_sync_status" "text" DEFAULT 'pending_zoho_sync'::"text" NOT NULL,
    "zoho_sync_attempts" integer DEFAULT 0 NOT NULL,
    "zoho_sync_error" "text",
    "app_whatsapp_sent" boolean DEFAULT false NOT NULL,
    "app_whatsapp_message_id" "text",
    "location_id" "text",
    "estimate_url" "text"
);


ALTER TABLE "public"."estimates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."estimates"."location_id" IS 'Nearest warehouse zoho_location_id resolved at creation via Haversine';



COMMENT ON COLUMN "public"."estimates"."estimate_url" IS 'Zoho Books public shareable estimate URL (fetched via GET /estimates/{id} after creation)';



CREATE SEQUENCE IF NOT EXISTS "public"."estimates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."estimates_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."estimates_id_seq" OWNED BY "public"."estimates"."id";



CREATE TABLE IF NOT EXISTS "public"."guest_sessions" (
    "id" bigint NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "page_views" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guest_sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."guest_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."guest_sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."guest_sessions_id_seq" OWNED BY "public"."guest_sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" bigint NOT NULL,
    "zoho_invoice_id" "text",
    "invoice_number" "text",
    "zoho_contact_id" "text",
    "customer_name" "text",
    "contact_phone" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "due_date" "date",
    "issued_date" "date",
    "payment_terms" integer,
    "payment_terms_label" "text",
    "currency_code" "text" DEFAULT 'INR'::"text" NOT NULL,
    "exchange_rate" numeric(10,6) DEFAULT 1.0 NOT NULL,
    "discount_type" "text" DEFAULT 'multi_discount'::"text",
    "is_discount_before_tax" boolean DEFAULT true,
    "entity_discount_percent" numeric(10,2) DEFAULT 0,
    "is_inclusive_tax" boolean DEFAULT true,
    "line_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "tax_total" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "balance" numeric(10,2) DEFAULT 0,
    "adjustment" numeric(10,2) DEFAULT 0,
    "adjustment_description" "text",
    "adjustment_account" "text",
    "notes" "text",
    "terms_and_conditions" "text",
    "purchase_order" "text",
    "place_of_supply" "text",
    "gst_treatment" "text",
    "gstin" "text",
    "invoice_type" "text" DEFAULT 'Invoice'::"text",
    "einvoice_status" "text",
    "branch_id" "text",
    "branch_name" "text",
    "accounts_receivable" "text",
    "tcs_amount" numeric(10,2) DEFAULT 0,
    "tds_amount" numeric(10,2) DEFAULT 0,
    "shipping_charge" numeric(10,2) DEFAULT 0,
    "estimate_number" "text",
    "zoho_sync_status" "text" DEFAULT 'synced'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoices_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."invoices_id_seq" OWNED BY "public"."invoices"."id";



CREATE TABLE IF NOT EXISTS "public"."item_locations" (
    "id" bigint NOT NULL,
    "zoho_item_id" "text" NOT NULL,
    "zoho_location_id" "text" NOT NULL,
    "location_name" "text" NOT NULL,
    "location_status" "text" DEFAULT 'active'::"text",
    "is_primary" boolean DEFAULT false,
    "stock_on_hand" integer DEFAULT 0,
    "available_stock" integer DEFAULT 0,
    "actual_available_stock" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."item_locations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."item_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."item_locations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."item_locations_id_seq" OWNED BY "public"."item_locations"."id";



CREATE TABLE IF NOT EXISTS "public"."items" (
    "zoho_item_id" "text" NOT NULL,
    "item_name" "text" NOT NULL,
    "sku" "text" NOT NULL,
    "category_id" "text",
    "category_name" "text",
    "brand" "text",
    "manufacturer" "text",
    "description" "text",
    "hsn_or_sac" "text",
    "unit" "text" DEFAULT 'pcs'::"text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "item_type" "text" DEFAULT 'inventory'::"text",
    "product_type" "text" DEFAULT 'goods'::"text",
    "base_rate" numeric(10,2),
    "purchase_rate" numeric(10,2),
    "is_taxable" boolean DEFAULT true,
    "tax_id" "text",
    "tax_name" "text",
    "tax_percentage" numeric(5,2) DEFAULT 18.00,
    "track_inventory" boolean DEFAULT true,
    "available_stock" integer DEFAULT 0,
    "actual_available_stock" integer DEFAULT 0,
    "reorder_level" integer,
    "upc" "text",
    "ean" "text",
    "part_number" "text",
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "search_vector" "tsvector",
    "created_time" timestamp with time zone,
    "last_modified_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "system_type" "text",
    "system_type_source" "text" DEFAULT 'auto'::"text" NOT NULL,
    CONSTRAINT "items_system_type_source_check" CHECK (("system_type_source" = ANY (ARRAY['auto'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "zoho_location_id" "text" NOT NULL,
    "location_name" "text" NOT NULL,
    "location_type" "text",
    "is_primary" boolean DEFAULT false,
    "status" "text" DEFAULT 'active'::"text",
    "address" "jsonb",
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "location_url" "text"
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_sessions" (
    "id" bigint NOT NULL,
    "phone" "text" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."otp_sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."otp_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."otp_sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."otp_sessions_id_seq" OWNED BY "public"."otp_sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."pricebook_catalog" (
    "zoho_pricebook_id" "text" NOT NULL,
    "pricebook_name" "text" NOT NULL,
    "currency_id" "text" DEFAULT 'INR'::"text",
    "is_active" boolean DEFAULT true,
    "synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pricebook_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricebook_items" (
    "id" bigint NOT NULL,
    "zoho_pricebook_id" "text" NOT NULL,
    "zoho_item_id" "text" NOT NULL,
    "custom_rate" numeric(10,2) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pricebook_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pricebook_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pricebook_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pricebook_items_id_seq" OWNED BY "public"."pricebook_items"."id";



CREATE TABLE IF NOT EXISTS "public"."product_associations" (
    "id" bigint NOT NULL,
    "item_a_id" "text" NOT NULL,
    "item_b_id" "text" NOT NULL,
    "association_type" "text" NOT NULL,
    "co_occurrence_count" integer DEFAULT 0 NOT NULL,
    "lift_score" numeric(10,6),
    "confidence_a_to_b" numeric(10,6),
    "confidence_b_to_a" numeric(10,6),
    "time_window_days" integer,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "support" numeric(10,6),
    "estimate_supplemented" boolean DEFAULT false NOT NULL,
    CONSTRAINT "product_associations_association_type_check" CHECK (("association_type" = ANY (ARRAY['frequently_bought_together'::"text", 'people_also_buy'::"text"])))
);


ALTER TABLE "public"."product_associations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."product_associations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."product_associations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."product_associations_id_seq" OWNED BY "public"."product_associations"."id";



CREATE TABLE IF NOT EXISTS "public"."product_popularity" (
    "zoho_item_id" "text" NOT NULL,
    "order_count_7d" integer DEFAULT 0 NOT NULL,
    "order_count_30d" integer DEFAULT 0 NOT NULL,
    "order_count_90d" integer DEFAULT 0 NOT NULL,
    "quantity_sold_30d" integer DEFAULT 0 NOT NULL,
    "revenue_30d" numeric(12,2) DEFAULT 0 NOT NULL,
    "repeat_purchase_rate" numeric(5,4),
    "category_id" "text",
    "category_rank" integer,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_popularity_repeat_purchase_rate_check" CHECK ((("repeat_purchase_rate" >= (0)::numeric) AND ("repeat_purchase_rate" <= (1)::numeric)))
);


ALTER TABLE "public"."product_popularity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_orders" (
    "id" bigint NOT NULL,
    "zoho_salesorder_id" "text",
    "salesorder_number" "text",
    "zoho_contact_id" "text",
    "contact_phone" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "shipment_date" "date",
    "line_items" "jsonb" NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "tax_total" numeric(10,2) NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "notes" "text",
    "customer_notes" "text",
    "converted_from_estimate_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "public_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zoho_sync_status" "text" DEFAULT 'pending_zoho_sync'::"text" NOT NULL,
    "zoho_sync_attempts" integer DEFAULT 0 NOT NULL,
    "zoho_sync_error" "text",
    "app_whatsapp_sent" boolean DEFAULT false NOT NULL,
    "app_whatsapp_message_id" "text",
    "cart_hash" "text"
);


ALTER TABLE "public"."sales_orders" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sales_orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sales_orders_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sales_orders_id_seq" OWNED BY "public"."sales_orders"."id";



CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" bigint NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zoho_contact_id" "text",
    "phone" "text" NOT NULL,
    "user_agent" "text",
    "ip_address" "inet",
    "expires_at" timestamp with time zone NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sessions_id_seq" OWNED BY "public"."sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."system_types" (
    "system_type_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_errors" (
    "id" bigint NOT NULL,
    "webhook_type" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "zoho_entity_id" "text",
    "error_message" "text" NOT NULL,
    "payload" "jsonb",
    "retry_count" integer DEFAULT 0,
    "resolved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook_errors" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."webhook_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."webhook_errors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."webhook_errors_id_seq" OWNED BY "public"."webhook_errors"."id";



CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" bigint NOT NULL,
    "webhook_type" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "zoho_entity_id" "text",
    "op" "text",
    "changed_count" integer,
    "changed_fields" "jsonb",
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "error_ref" bigint,
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."webhook_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."webhook_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."webhook_events_id_seq" OWNED BY "public"."webhook_events"."id";



CREATE TABLE IF NOT EXISTS "public"."zoho_tokens" (
    "id" integer DEFAULT 1 NOT NULL,
    "access_token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zoho_tokens" OWNER TO "postgres";


ALTER TABLE ONLY "public"."auth_attempts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_attempts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."auth_requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."auth_requests_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."brands" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."brands_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."category_associations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."category_associations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."estimates" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."estimates_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."guest_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."guest_sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."invoices" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."invoices_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."item_locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."item_locations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."otp_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."otp_sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pricebook_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pricebook_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."product_associations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."product_associations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sales_orders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sales_orders_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."webhook_errors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."webhook_errors_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."webhook_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."webhook_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."auth_attempts"
    ADD CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_requests"
    ADD CONSTRAINT "auth_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_requests"
    ADD CONSTRAINT "auth_requests_ref_id_key" UNIQUE ("ref_id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_brand_name_key" UNIQUE ("brand_name");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_category_name_key" UNIQUE ("category_name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("zoho_category_id");



ALTER TABLE ONLY "public"."category_associations"
    ADD CONSTRAINT "category_associations_category_a_id_category_b_id_associati_key" UNIQUE ("category_a_id", "category_b_id", "association_type", "time_window_days");



ALTER TABLE ONLY "public"."category_associations"
    ADD CONSTRAINT "category_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_persons"
    ADD CONSTRAINT "contact_persons_pkey" PRIMARY KEY ("zoho_contact_person_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("zoho_contact_id");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("zoho_contact_id");



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_estimate_number_key" UNIQUE ("estimate_number");



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_zoho_estimate_id_key" UNIQUE ("zoho_estimate_id");



ALTER TABLE ONLY "public"."guest_sessions"
    ADD CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_sessions"
    ADD CONSTRAINT "guest_sessions_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_zoho_invoice_id_key" UNIQUE ("zoho_invoice_id");



ALTER TABLE ONLY "public"."item_locations"
    ADD CONSTRAINT "item_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_locations"
    ADD CONSTRAINT "item_locations_zoho_item_id_zoho_location_id_key" UNIQUE ("zoho_item_id", "zoho_location_id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("zoho_item_id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("zoho_location_id");



ALTER TABLE ONLY "public"."otp_sessions"
    ADD CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricebook_catalog"
    ADD CONSTRAINT "pricebook_catalog_pkey" PRIMARY KEY ("zoho_pricebook_id");



ALTER TABLE ONLY "public"."pricebook_items"
    ADD CONSTRAINT "pricebook_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricebook_items"
    ADD CONSTRAINT "pricebook_items_zoho_pricebook_id_zoho_item_id_key" UNIQUE ("zoho_pricebook_id", "zoho_item_id");



ALTER TABLE ONLY "public"."product_associations"
    ADD CONSTRAINT "product_associations_item_a_id_item_b_id_association_type_t_key" UNIQUE ("item_a_id", "item_b_id", "association_type", "time_window_days");



ALTER TABLE ONLY "public"."product_associations"
    ADD CONSTRAINT "product_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_popularity"
    ADD CONSTRAINT "product_popularity_pkey" PRIMARY KEY ("zoho_item_id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_salesorder_number_key" UNIQUE ("salesorder_number");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_zoho_salesorder_id_key" UNIQUE ("zoho_salesorder_id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."system_types"
    ADD CONSTRAINT "system_types_pkey" PRIMARY KEY ("system_type_code");



ALTER TABLE ONLY "public"."webhook_errors"
    ADD CONSTRAINT "webhook_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zoho_tokens"
    ADD CONSTRAINT "zoho_tokens_pkey" PRIMARY KEY ("id");



CREATE INDEX "estimates_dedup_idx" ON "public"."estimates" USING "btree" ("zoho_contact_id", "cart_hash", "created_at" DESC) WHERE ("zoho_sync_status" <> 'failed'::"text");



CREATE UNIQUE INDEX "estimates_public_id_idx" ON "public"."estimates" USING "btree" ("public_id");



CREATE INDEX "idx_auth_attempts_phone_time" ON "public"."auth_attempts" USING "btree" ("phone", "created_at" DESC);



CREATE INDEX "idx_auth_requests_phone" ON "public"."auth_requests" USING "btree" ("phone", "created_at" DESC);



CREATE INDEX "idx_auth_requests_ref_id" ON "public"."auth_requests" USING "btree" ("ref_id") WHERE ("used" = false);



CREATE INDEX "idx_category_associations_cat_a" ON "public"."category_associations" USING "btree" ("category_a_id");



CREATE INDEX "idx_category_associations_cat_b" ON "public"."category_associations" USING "btree" ("category_b_id");



CREATE INDEX "idx_category_associations_lookup" ON "public"."category_associations" USING "btree" ("category_a_id", "association_type", "time_window_days");



CREATE INDEX "idx_contact_persons_contact" ON "public"."contact_persons" USING "btree" ("zoho_contact_id");



CREATE INDEX "idx_contact_persons_phone" ON "public"."contact_persons" USING "btree" ("phone");



CREATE INDEX "idx_contact_persons_status" ON "public"."contact_persons" USING "btree" ("status");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_phone" ON "public"."contacts" USING "btree" ("phone");



CREATE INDEX "idx_contacts_pricebook" ON "public"."contacts" USING "btree" ("pricebook_id");



CREATE INDEX "idx_contacts_status" ON "public"."contacts" USING "btree" ("status");



CREATE INDEX "idx_customer_profiles_buyer_tier" ON "public"."customer_profiles" USING "btree" ("buyer_tier");



CREATE INDEX "idx_customer_profiles_system_affinity" ON "public"."customer_profiles" USING "btree" ("system_affinity");



CREATE INDEX "idx_estimates_contact" ON "public"."estimates" USING "btree" ("zoho_contact_id");



CREATE INDEX "idx_estimates_date" ON "public"."estimates" USING "btree" ("date" DESC);



CREATE INDEX "idx_estimates_phone" ON "public"."estimates" USING "btree" ("contact_phone");



CREATE INDEX "idx_estimates_status" ON "public"."estimates" USING "btree" ("status");



CREATE INDEX "idx_guest_sessions_token" ON "public"."guest_sessions" USING "btree" ("token");



CREATE INDEX "idx_invoices_date" ON "public"."invoices" USING "btree" ("date" DESC);



CREATE INDEX "idx_invoices_estimate_number" ON "public"."invoices" USING "btree" ("estimate_number") WHERE ("estimate_number" IS NOT NULL);



CREATE INDEX "idx_invoices_invoice_number" ON "public"."invoices" USING "btree" ("invoice_number");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_invoices_zoho_contact_id" ON "public"."invoices" USING "btree" ("zoho_contact_id");



CREATE INDEX "idx_item_locations_item" ON "public"."item_locations" USING "btree" ("zoho_item_id");



CREATE INDEX "idx_item_locations_location" ON "public"."item_locations" USING "btree" ("zoho_location_id");



CREATE INDEX "idx_items_brand" ON "public"."items" USING "btree" ("brand");



CREATE INDEX "idx_items_category" ON "public"."items" USING "btree" ("category_id");



CREATE INDEX "idx_items_category_name" ON "public"."items" USING "btree" ("category_name");



CREATE INDEX "idx_items_search_vector" ON "public"."items" USING "gin" ("search_vector");



CREATE INDEX "idx_items_status" ON "public"."items" USING "btree" ("status");



CREATE INDEX "idx_items_stock" ON "public"."items" USING "btree" ("available_stock") WHERE ("available_stock" > 0);



CREATE INDEX "idx_items_system_type" ON "public"."items" USING "btree" ("system_type");



CREATE INDEX "idx_items_trgm_brand" ON "public"."items" USING "gin" ("brand" "public"."gin_trgm_ops");



CREATE INDEX "idx_items_trgm_name" ON "public"."items" USING "gin" ("item_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_items_trgm_sku" ON "public"."items" USING "gin" ("sku" "public"."gin_trgm_ops");



CREATE INDEX "idx_otp_sessions_phone_active" ON "public"."otp_sessions" USING "btree" ("phone", "expires_at") WHERE ("verified" = false);



CREATE INDEX "idx_pricebook_items_item" ON "public"."pricebook_items" USING "btree" ("zoho_item_id");



CREATE INDEX "idx_pricebook_items_pricebook" ON "public"."pricebook_items" USING "btree" ("zoho_pricebook_id");



CREATE INDEX "idx_product_associations_item_a" ON "public"."product_associations" USING "btree" ("item_a_id");



CREATE INDEX "idx_product_associations_item_b" ON "public"."product_associations" USING "btree" ("item_b_id");



CREATE INDEX "idx_product_associations_lookup" ON "public"."product_associations" USING "btree" ("item_a_id", "association_type", "time_window_days");



CREATE INDEX "idx_product_associations_type" ON "public"."product_associations" USING "btree" ("association_type");



CREATE INDEX "idx_product_popularity_category_rank" ON "public"."product_popularity" USING "btree" ("category_id", "category_rank");



CREATE INDEX "idx_product_popularity_trending" ON "public"."product_popularity" USING "btree" ("order_count_30d" DESC) WHERE ("order_count_30d" > 0);



CREATE INDEX "idx_salesorders_contact" ON "public"."sales_orders" USING "btree" ("zoho_contact_id");



CREATE INDEX "idx_salesorders_date" ON "public"."sales_orders" USING "btree" ("date" DESC);



CREATE INDEX "idx_salesorders_status" ON "public"."sales_orders" USING "btree" ("status");



CREATE INDEX "idx_sessions_contact" ON "public"."sessions" USING "btree" ("zoho_contact_id");



CREATE INDEX "idx_sessions_expires" ON "public"."sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_sessions_token" ON "public"."sessions" USING "btree" ("token");



CREATE INDEX "idx_webhook_errors_created" ON "public"."webhook_errors" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_webhook_errors_resolved" ON "public"."webhook_errors" USING "btree" ("resolved");



CREATE INDEX "idx_webhook_errors_type" ON "public"."webhook_errors" USING "btree" ("webhook_type");



CREATE INDEX "idx_webhook_events_changed_fields" ON "public"."webhook_events" USING "gin" ("changed_fields");



CREATE INDEX "idx_webhook_events_entity" ON "public"."webhook_events" USING "btree" ("zoho_entity_id", "webhook_type");



CREATE INDEX "idx_webhook_events_type_created" ON "public"."webhook_events" USING "btree" ("webhook_type", "created_at" DESC);



CREATE INDEX "sales_orders_dedup_idx" ON "public"."sales_orders" USING "btree" ("zoho_contact_id", "cart_hash", "created_at" DESC) WHERE ("zoho_sync_status" <> 'failed'::"text");



CREATE UNIQUE INDEX "sales_orders_public_id_idx" ON "public"."sales_orders" USING "btree" ("public_id");



CREATE OR REPLACE TRIGGER "brands_updated_at" BEFORE UPDATE ON "public"."brands" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "contact_persons_updated_at" BEFORE UPDATE ON "public"."contact_persons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "estimates_updated_at" BEFORE UPDATE ON "public"."estimates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "guest_sessions_expiry_trigger" BEFORE INSERT ON "public"."guest_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_guest_session_expiry"();



CREATE OR REPLACE TRIGGER "invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "item_locations_updated_at" BEFORE UPDATE ON "public"."item_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "items_search_vector_trigger" BEFORE INSERT OR UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."items_search_vector_update"();



CREATE OR REPLACE TRIGGER "items_updated_at" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "sales_orders_updated_at" BEFORE UPDATE ON "public"."sales_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "sessions_expiry_trigger" BEFORE INSERT ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_session_expiry"();



CREATE OR REPLACE TRIGGER "system_types_updated_at" BEFORE UPDATE ON "public"."system_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."auth_requests"
    ADD CONSTRAINT "auth_requests_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("zoho_category_id");



ALTER TABLE ONLY "public"."category_associations"
    ADD CONSTRAINT "category_associations_category_a_id_fkey" FOREIGN KEY ("category_a_id") REFERENCES "public"."categories"("zoho_category_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_associations"
    ADD CONSTRAINT "category_associations_category_b_id_fkey" FOREIGN KEY ("category_b_id") REFERENCES "public"."categories"("zoho_category_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_persons"
    ADD CONSTRAINT "contact_persons_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_system_affinity_fkey" FOREIGN KEY ("system_affinity") REFERENCES "public"."system_types"("system_type_code");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("zoho_location_id");



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id");



ALTER TABLE ONLY "public"."item_locations"
    ADD CONSTRAINT "item_locations_zoho_item_id_fkey" FOREIGN KEY ("zoho_item_id") REFERENCES "public"."items"("zoho_item_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_system_type_fkey" FOREIGN KEY ("system_type") REFERENCES "public"."system_types"("system_type_code");



ALTER TABLE ONLY "public"."pricebook_items"
    ADD CONSTRAINT "pricebook_items_zoho_item_id_fkey" FOREIGN KEY ("zoho_item_id") REFERENCES "public"."items"("zoho_item_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricebook_items"
    ADD CONSTRAINT "pricebook_items_zoho_pricebook_id_fkey" FOREIGN KEY ("zoho_pricebook_id") REFERENCES "public"."pricebook_catalog"("zoho_pricebook_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_associations"
    ADD CONSTRAINT "product_associations_item_a_id_fkey" FOREIGN KEY ("item_a_id") REFERENCES "public"."items"("zoho_item_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_associations"
    ADD CONSTRAINT "product_associations_item_b_id_fkey" FOREIGN KEY ("item_b_id") REFERENCES "public"."items"("zoho_item_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_popularity"
    ADD CONSTRAINT "product_popularity_zoho_item_id_fkey" FOREIGN KEY ("zoho_item_id") REFERENCES "public"."items"("zoho_item_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_converted_from_estimate_id_fkey" FOREIGN KEY ("converted_from_estimate_id") REFERENCES "public"."estimates"("id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_zoho_contact_id_fkey" FOREIGN KEY ("zoho_contact_id") REFERENCES "public"."contacts"("zoho_contact_id") ON DELETE CASCADE;



CREATE POLICY "Public can read active items" ON "public"."items" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "Public can read brands" ON "public"."brands" FOR SELECT USING (true);



CREATE POLICY "Public can read categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Public can read system_types" ON "public"."system_types" FOR SELECT USING (true);



CREATE POLICY "Service role full access on invoices" ON "public"."invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on webhook_events" ON "public"."webhook_events" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."auth_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_associations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_persons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estimates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricebook_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricebook_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_associations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_popularity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zoho_tokens" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."classify_items_system_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."classify_items_system_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."classify_items_system_type"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_estimate_to_salesorder"("p_estimate_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_estimate_to_salesorder"("p_estimate_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_estimate_to_salesorder"("p_estimate_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_search_facets"("search_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_search_facets"("search_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_search_facets"("search_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."items_search_vector_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."items_search_vector_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."items_search_vector_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_product_popularity"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_product_popularity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_product_popularity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_items"("search_query" "text", "brand_filter" "text", "category_filter" "text", "min_price" numeric, "max_price" numeric, "in_stock_only" boolean, "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_items"("search_query" "text", "brand_filter" "text", "category_filter" "text", "min_price" numeric, "max_price" numeric, "in_stock_only" boolean, "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_items"("search_query" "text", "brand_filter" "text", "category_filter" "text", "min_price" numeric, "max_price" numeric, "in_stock_only" boolean, "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_guest_session_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_guest_session_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_guest_session_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_session_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_session_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_session_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."auth_attempts" TO "anon";
GRANT ALL ON TABLE "public"."auth_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."auth_requests" TO "anon";
GRANT ALL ON TABLE "public"."auth_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."auth_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."auth_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."auth_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON SEQUENCE "public"."brands_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."brands_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."brands_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."category_associations" TO "anon";
GRANT ALL ON TABLE "public"."category_associations" TO "authenticated";
GRANT ALL ON TABLE "public"."category_associations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."category_associations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."category_associations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."category_associations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contact_persons" TO "anon";
GRANT ALL ON TABLE "public"."contact_persons" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_persons" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."customer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."customer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."estimates" TO "anon";
GRANT ALL ON TABLE "public"."estimates" TO "authenticated";
GRANT ALL ON TABLE "public"."estimates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."estimates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."estimates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."estimates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."guest_sessions" TO "anon";
GRANT ALL ON TABLE "public"."guest_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."guest_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."guest_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."guest_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invoices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."item_locations" TO "anon";
GRANT ALL ON TABLE "public"."item_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."item_locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."item_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."item_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."item_locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."otp_sessions" TO "anon";
GRANT ALL ON TABLE "public"."otp_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."otp_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."otp_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."otp_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."otp_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pricebook_catalog" TO "anon";
GRANT ALL ON TABLE "public"."pricebook_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."pricebook_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."pricebook_items" TO "anon";
GRANT ALL ON TABLE "public"."pricebook_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pricebook_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pricebook_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pricebook_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pricebook_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_associations" TO "anon";
GRANT ALL ON TABLE "public"."product_associations" TO "authenticated";
GRANT ALL ON TABLE "public"."product_associations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_associations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_associations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_associations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_popularity" TO "anon";
GRANT ALL ON TABLE "public"."product_popularity" TO "authenticated";
GRANT ALL ON TABLE "public"."product_popularity" TO "service_role";



GRANT ALL ON TABLE "public"."sales_orders" TO "anon";
GRANT ALL ON TABLE "public"."sales_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sales_orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_types" TO "anon";
GRANT ALL ON TABLE "public"."system_types" TO "authenticated";
GRANT ALL ON TABLE "public"."system_types" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_errors" TO "anon";
GRANT ALL ON TABLE "public"."webhook_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_errors" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhook_errors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhook_errors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhook_errors_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhook_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhook_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhook_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_tokens" TO "anon";
GRANT ALL ON TABLE "public"."zoho_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_tokens" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


