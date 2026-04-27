-- Zoho Books contact field `gst_no` — cached locally for catalog estimates and login backfill.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS gst_no TEXT;
