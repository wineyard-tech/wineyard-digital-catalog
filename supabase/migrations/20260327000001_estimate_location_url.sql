-- Associate each estimate with the nearest warehouse at creation time.
-- Nullable: estimates created before this migration, or where user had no coords, remain null.
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(zoho_location_id),
  ADD COLUMN IF NOT EXISTS estimate_url TEXT;

COMMENT ON COLUMN estimates.location_id IS 'Nearest warehouse zoho_location_id resolved at creation via Haversine';
COMMENT ON COLUMN estimates.estimate_url IS 'Zoho Books public shareable estimate URL (fetched via GET /estimates/{id} after creation)';

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS location_url TEXT;