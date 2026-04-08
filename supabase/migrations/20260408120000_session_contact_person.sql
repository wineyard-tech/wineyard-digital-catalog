-- Optional link to contact_persons for team-member logins (parent zoho_contact_id stays on session for all Zoho/API scope).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS zoho_contact_person_id text;

ALTER TABLE public.auth_requests
  ADD COLUMN IF NOT EXISTS zoho_contact_person_id text;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_zoho_contact_person_id_fkey;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_zoho_contact_person_id_fkey
  FOREIGN KEY (zoho_contact_person_id)
  REFERENCES public.contact_persons (zoho_contact_person_id)
  ON DELETE SET NULL;

ALTER TABLE public.auth_requests
  DROP CONSTRAINT IF EXISTS auth_requests_zoho_contact_person_id_fkey;

ALTER TABLE public.auth_requests
  ADD CONSTRAINT auth_requests_zoho_contact_person_id_fkey
  FOREIGN KEY (zoho_contact_person_id)
  REFERENCES public.contact_persons (zoho_contact_person_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_zoho_contact_person_id
  ON public.sessions (zoho_contact_person_id)
  WHERE zoho_contact_person_id IS NOT NULL;
