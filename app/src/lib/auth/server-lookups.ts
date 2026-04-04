import { createServiceClient } from '@/lib/supabase/server'

/** Canonical UUID string shape accepted for `guest_sessions.token` (matches Postgres uuid text input). */
const GUEST_TOKEN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isGuestSessionTokenUuidString(token: string): boolean {
  return GUEST_TOKEN_UUID_RE.test(token.trim())
}

/**
 * Validates WhatsApp deep-link ref_id (service role — not exposed to browser).
 */
export async function validateWhatsAppAuthRef(ref_id: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('auth_requests')
    .select('id')
    .eq('ref_id', ref_id)
    .eq('used', false)
    .gt('ref_expires_at', new Date().toISOString())
    .maybeSingle()

  return Boolean(data)
}

/**
 * Validates guest catalog token (service role).
 */
export async function validateGuestSessionToken(token: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('guest_sessions')
    .select('id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return Boolean(data)
}

export function incrementGuestPageViewsFireAndForget(token: string): void {
  if (!isGuestSessionTokenUuidString(token)) return

  const supabase = createServiceClient()
  void supabase
    .rpc('increment_guest_page_views', { session_token: token })
    .then(({ error }) => {
      if (error) console.error('[increment_guest_page_views]', error.message)
    })
}
