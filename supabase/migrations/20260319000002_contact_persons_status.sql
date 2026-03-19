-- Add soft-delete support to contact_persons.
-- Persons removed from a Zoho contact update are now marked inactive
-- rather than hard-deleted, preserving audit history.

ALTER TABLE contact_persons
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_contact_persons_status ON contact_persons(status);
