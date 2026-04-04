-- Adds a dedicated boolean column to gate OTP login for contacts
-- that are registered in Zoho but haven't been granted catalog access.
-- Default false covers all existing rows; next sync run will populate correct values.

ALTER TABLE contacts
  ADD COLUMN online_catalogue_access BOOLEAN NOT NULL DEFAULT false;
