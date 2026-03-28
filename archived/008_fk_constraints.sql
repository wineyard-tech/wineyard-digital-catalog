-- ─────────────────────────────────────────────────────────────────────────────
-- 008_fk_constraints.sql
-- Adds missing FK and unique constraints discovered after initial schema creation.
-- ─────────────────────────────────────────────────────────────────────────────

-- item_locations.zoho_location_id → locations(zoho_location_id)
-- Enforces referential integrity for warehouse stock rows.
-- IMPORTANT: run initial_sync { "entity": "locations" } before this migration
-- so existing item_location rows are not orphaned.
-- Wrapped in DO block: ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS
-- guard in Postgres. This makes the migration safe to run on staging where
-- the constraint may already exist from a prior direct SQL apply.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_item_locations_location'
      AND table_name = 'item_locations'
  ) THEN
    ALTER TABLE item_locations
      ADD CONSTRAINT fk_item_locations_location
      FOREIGN KEY (zoho_location_id) REFERENCES locations(zoho_location_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOT added (documented reasons):
--
-- items.category_id → categories(zoho_category_id)
--   Unsafe for incremental sync: a modified item can reference a category that
--   is not yet in the categories table when only changed items are fetched.
--   category_id is kept as a soft TEXT reference.
--
-- contacts.primary_contact_person_id → contact_persons(zoho_contact_person_id)
--   Circular dependency: contact_persons already has FK → contacts.
--   Adding the reverse FK creates a cycle. The sync would need a 3-step upsert
--   (insert contact without person id → insert persons → update contact with id).
--   Kept as a soft TEXT reference.
--
-- contacts.pricebook_id → pricebooks(zoho_pricebook_id)
--   pricebooks table has composite PK (id BIGSERIAL); zoho_pricebook_id is not
--   unique by itself (one pricebook has N item-price rows). No valid FK target.
--   Kept as a soft TEXT reference.
-- ─────────────────────────────────────────────────────────────────────────────
