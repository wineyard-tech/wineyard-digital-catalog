-- Allow the same phone on an inactive contact and an active contact (dedupe by phone+status).
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_status_uidx
  ON public.contacts (phone, status);

-- Link invoices to originating Zoho estimate (same id space as estimates.zoho_estimate_id).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS zoho_estimate_id TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_zoho_estimate_id
  ON public.invoices (zoho_estimate_id)
  WHERE zoho_estimate_id IS NOT NULL;
