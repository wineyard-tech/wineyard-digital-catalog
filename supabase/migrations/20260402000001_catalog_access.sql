-- Adds catalog_access boolean to contacts and contact_persons.
-- This is a new Zoho custom field (cf_catalog_access) that controls per-contact
-- and per-contact-person catalog access independently of online_catalogue_access.
-- Default false covers all existing rows; next sync run will populate correct values.

ALTER TABLE contacts
  ADD COLUMN catalog_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contact_persons
  ADD COLUMN catalog_access BOOLEAN NOT NULL DEFAULT false;
