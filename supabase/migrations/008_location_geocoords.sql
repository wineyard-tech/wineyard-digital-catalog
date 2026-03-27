-- 008_location_geocoords.sql
-- Adds geocoordinate columns to locations table for nearest-warehouse routing.
-- Both nullable: warehouses without coords are excluded from routing until geocoded.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS latitude  DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
