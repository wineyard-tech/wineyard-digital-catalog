-- Atomically bump page_views for an active guest session (called via service role from Next.js).
-- SECURITY DEFINER: runs as function owner so the update is reliable regardless of JWT / PostgREST role.
CREATE OR REPLACE FUNCTION public.increment_guest_page_views(session_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid;
BEGIN
  BEGIN
    v_token := session_token::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN;
  END;

  UPDATE guest_sessions
  SET page_views = COALESCE(page_views, 0) + 1
  WHERE token = v_token
    AND expires_at > NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_guest_page_views(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_guest_page_views(TEXT) TO service_role;
