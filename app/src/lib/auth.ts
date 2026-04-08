import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServiceClient } from './supabase/server'
import type { SessionPayload, GuestPayload } from '@/types/catalog'

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Validates a session token against the sessions table.
 * Returns SessionPayload (contact info) or null if invalid/expired.
 */
export async function getSession(token: string): Promise<SessionPayload | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('sessions')
    .select(`
      zoho_contact_id,
      phone,
      zoho_contact_person_id,
      contacts (
        contact_name,
        company_name,
        pricebook_id
      ),
      contact_persons (
        first_name,
        last_name
      )
    `)
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null

  // Update activity timestamp (fire and forget)
  supabase
    .from('sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('token', token)
    .then(() => {})

  // Supabase types nested FK joins as arrays; the FK is 1:1 so take first element
  const rawContacts = data.contacts as unknown
  const contact = (
    Array.isArray(rawContacts) ? rawContacts[0] : rawContacts
  ) as { contact_name: string; company_name: string | null; pricebook_id: string | null } | null

  const rawPersons = data.contact_persons as unknown
  const personRow = (
    Array.isArray(rawPersons) ? rawPersons[0] : rawPersons
  ) as { first_name: string | null; last_name: string | null } | null

  const personNameParts = [personRow?.first_name, personRow?.last_name].filter(Boolean).join(' ').trim()
  const contact_person_name =
    data.zoho_contact_person_id && personNameParts.length > 0
      ? personNameParts
      : data.zoho_contact_person_id
        ? 'Team member'
        : null

  return {
    zoho_contact_id: data.zoho_contact_id ?? '',
    contact_name: contact?.contact_name ?? '',
    company_name: contact?.company_name ?? null,
    contact_person_name,
    zoho_contact_person_id: data.zoho_contact_person_id ?? null,
    phone: data.phone,
    pricebook_id: contact?.pricebook_id ?? null,
  }
}

/**
 * Reads session_token cookie and validates it.
 * Throws AuthError(401) if missing or invalid.
 */
export async function requireSession(request: NextRequest): Promise<SessionPayload> {
  const token = request.cookies.get('session_token')?.value
  if (!token) throw new AuthError(401, 'No session token')

  const session = await getSession(token)
  if (!session) throw new AuthError(401, 'Invalid or expired session')

  return session
}

/**
 * Validates a guest token against the guest_sessions table.
 * Returns GuestPayload or null if invalid/expired.
 */
export async function getGuestSession(token: string): Promise<GuestPayload | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('guest_sessions')
    .select('token, expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null

  return { token: data.token, expires_at: data.expires_at }
}

/**
 * Sets the session_token cookie on a response.
 * HttpOnly + Secure + SameSite=Lax + 30-day Max-Age.
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    path: '/',
  })
}
