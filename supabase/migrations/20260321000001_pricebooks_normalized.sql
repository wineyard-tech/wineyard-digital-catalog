-- ─────────────────────────────────────────────────────────────────────────────
-- Normalize pricebooks: split flat `pricebooks` table into:
--   pricebook_catalog  — one row per pricebook (metadata)
--   pricebook_items    — one row per (pricebook × item) price override
--
-- The old `pricebooks` table stored pricebook_name in every price row.
-- This migration creates the normalized tables, migrates existing data,
-- then drops the old table.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Pricebook metadata (one row per pricebook)
CREATE TABLE IF NOT EXISTS pricebook_catalog (
  zoho_pricebook_id   TEXT PRIMARY KEY,
  pricebook_name      TEXT NOT NULL,
  currency_id         TEXT DEFAULT 'INR',
  is_active           BOOLEAN DEFAULT true,
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Per-item price overrides per pricebook
CREATE TABLE IF NOT EXISTS pricebook_items (
  id                  BIGSERIAL PRIMARY KEY,
  zoho_pricebook_id   TEXT NOT NULL REFERENCES pricebook_catalog(zoho_pricebook_id) ON DELETE CASCADE,
  zoho_item_id        TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  custom_rate         DECIMAL(10,2) NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zoho_pricebook_id, zoho_item_id)
);

-- 3. Migrate existing data from the old flat `pricebooks` table (if it exists)
--    Wrapped in a DO block so this migration is safe to run on a clean DB
--    where the old `pricebooks` table was never created.
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pricebooks'
  ) THEN
    INSERT INTO pricebook_catalog (zoho_pricebook_id, pricebook_name, created_at, updated_at)
    SELECT DISTINCT
      zoho_pricebook_id,
      pricebook_name,
      MIN(created_at),
      MAX(updated_at)
    FROM pricebooks
    GROUP BY zoho_pricebook_id, pricebook_name
    ON CONFLICT (zoho_pricebook_id) DO NOTHING;

    INSERT INTO pricebook_items (zoho_pricebook_id, zoho_item_id, custom_rate, updated_at)
    SELECT zoho_pricebook_id, zoho_item_id, custom_rate, updated_at
    FROM pricebooks
    ON CONFLICT (zoho_pricebook_id, zoho_item_id) DO NOTHING;
  END IF;
END
$$;

-- 4. Drop old table (after data migration, no-op if it never existed)
DROP TABLE IF EXISTS pricebooks;

-- 5. Indexes for fast pricebook price lookups
CREATE INDEX IF NOT EXISTS idx_pricebook_items_pricebook
  ON pricebook_items(zoho_pricebook_id);

CREATE INDEX IF NOT EXISTS idx_pricebook_items_item
  ON pricebook_items(zoho_item_id);

-- 6. RLS — service role only (same pattern as contacts/sessions)
ALTER TABLE pricebook_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricebook_items    ENABLE ROW LEVEL SECURITY;

-- No public policies: Next.js API routes use SERVICE_ROLE_KEY and bypass RLS.
-- Direct anon key access returns nothing.
