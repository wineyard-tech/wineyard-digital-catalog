-- ─────────────────────────────────────────────────────────────────────────────
-- classify_items_system_type()
--
-- Classifies items that have no system_type yet, using a 7-priority CASE
-- expression on item_name and category_name (case-insensitive, ILIKE).
--
-- Safe to re-run: only touches rows WHERE system_type IS NULL.
-- Items where Zoho provides system_type (non-NULL on sync arrival) or that
-- were manually classified are left untouched.
--
-- Sets system_type_source = 'auto' for every row it updates.
--
-- Returns: one row per system_type showing how many items were classified
-- in this invocation (0 rows if nothing was NULL before the call).
--
-- Usage:
--   SELECT * FROM classify_items_system_type();   -- manual / one-off
--   -- or from application code:
--   supabase.rpc('classify_items_system_type')
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION classify_items_system_type()
RETURNS TABLE (system_type TEXT, item_count BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_universal_with_category BIGINT := 0;
BEGIN
  -- ── Step 1: Classify all items with no system_type ──────────────────────────
  UPDATE items
  SET
    system_type        = CASE
      -- Priority 1: Service items (labour / configuration / maintenance)
      WHEN item_name ILIKE '%installation charges%'
        OR item_name ILIKE '%cabling charges%'
        OR item_name ILIKE '%wiring charges%'
        OR item_name ILIKE '%amc charges%'
        OR item_name ILIKE '%splicing charges%'
        OR item_name ILIKE '%configuration%'
        OR item_name ILIKE '%nvr / dvr config%'
        OR item_name ILIKE '%nvr/dvr config%'
        THEN 'service'

      -- Priority 2: Analog HD — DVR ecosystem accessories and cameras
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

      -- Priority 3: IP Network — wired NVR/camera/PoE ecosystem
      --   Excluded: anything mentioning wifi or 4g (handled by later priorities)
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

      -- Priority 4: Wi-Fi cameras and wireless networking gear
      WHEN category_name ILIKE '%wifi camera%'
        OR (item_name ILIKE '%wifi%' AND item_name ILIKE '%camera%')
        OR item_name ILIKE '%wireless bridge%'
        OR item_name ILIKE '%wifi router%'
        OR item_name ILIKE '%wifi dongle%'
        THEN 'wifi'

      -- Priority 5: Standalone / Remote — solar and 4G SIM products
      WHEN category_name ILIKE '%solar camera%'
        OR category_name ILIKE '%4g sim camera%'
        OR item_name ILIKE '%4g sim router%'
        OR item_name ILIKE '%4g/5g sim router%'
        OR item_name ILIKE '%solar%'
        THEN 'standalone_remote'

      -- Priority 6: Fiber Optic — fiber infrastructure and converters
      WHEN category_name ILIKE '%fiber optic products%'
        OR item_name ILIKE '%fiber optic%'
        OR item_name ILIKE '%media converter%'
        OR item_name ILIKE '%sfp module%'
        OR item_name ILIKE '%splicing tray%'
        THEN 'fiber_optic'

      -- Priority 7: Universal — catch-all for multi-system or uncategorised items
      ELSE 'universal'
    END,
    system_type_source = 'auto',
    updated_at         = NOW()
  WHERE items.system_type IS NULL;

  -- ── Step 2: Warn about universals that have a category (review candidates) ──
  --   These items matched no rule despite having a known category_name.
  --   A human or a rule extension should classify them more specifically.
  SELECT COUNT(*) INTO v_universal_with_category
  FROM items
  WHERE system_type        = 'universal'
    AND system_type_source = 'auto'
    AND category_name IS NOT NULL
    AND category_name      <> '';

  IF v_universal_with_category > 0 THEN
    RAISE NOTICE
      'classify_items_system_type: % item(s) fell through to ''universal'' but have a non-empty category_name — consider adding a classification rule or manually assigning system_type.',
      v_universal_with_category;
  END IF;

  -- ── Step 3: Return current auto-classification distribution ─────────────────
  RETURN QUERY
  SELECT i.system_type, COUNT(*)::BIGINT AS item_count
  FROM   items i
  WHERE  i.system_type        IS NOT NULL
    AND  i.system_type_source  = 'auto'
  GROUP  BY i.system_type
  ORDER  BY item_count DESC;
END;
$$;

-- Grant execute to the service role so it can be called via supabase.rpc()
GRANT EXECUTE ON FUNCTION classify_items_system_type() TO service_role;
