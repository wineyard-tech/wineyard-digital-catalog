// api/auth/refresh/route.ts
// POST — validates existing session cookie, extends expiry by 15 days,
// re-fetches latest contact metadata from contacts table.
// Also used on app load to check if user is already logged in.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireSession, setSessionCookie } from '@/lib/auth'
import { AuthError } from '@/lib/auth'

const SESSION_DAYS = 15

export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const token = request.cookies.get('session_token')?.value!
  const supabase = createServiceClient()

  // Extend session expiry
  const newExpiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('sessions')
    .update({ expires_at: newExpiry, last_activity_at: new Date().toISOString() })
    .eq('token', token)

  if (error) {
    console.error('[refresh] session update error:', error)
    return NextResponse.json({ error: 'Could not refresh session.' }, { status: 500 })
  }

  // Re-fetch latest contact details (name/company may have changed via Zoho sync)
  const { data: contact } = await supabase
    .from('contacts')
    .select('contact_name, company_name, pricebook_id')
    .eq('phone', session.phone)
    .maybeSingle()

  const response = NextResponse.json(
    {
      success: true,
      user: {
        zoho_contact_id: session.zoho_contact_id,
        contact_name: contact?.contact_name ?? session.contact_name,
        company_name: contact?.company_name ?? null,
        phone: session.phone,
        pricebook_id: contact?.pricebook_id ?? session.pricebook_id,
      },
    },
    { status: 200 },
  )

  setSessionCookie(response, token)
  return response
}
