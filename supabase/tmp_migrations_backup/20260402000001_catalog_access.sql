-- Adds catalog_access to contacts + contact_persons (new Zoho cf_catalog_access field).
-- Adds online_catalogue_access to contact_persons — the same field that already exists
-- on contacts (cf_online_catalogue_access) and is used for login verification.
-- contact_persons can carry their own value of this flag independently.
-- Default false covers all existing rows; next sync run will populate correct values.

ALTER TABLE contacts
  ADD COLUMN catalog_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contact_persons
  ADD COLUMN catalog_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contact_persons
  ADD COLUMN online_catalogue_access BOOLEAN NOT NULL DEFAULT false;
