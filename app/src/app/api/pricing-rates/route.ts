// GET /api/pricing-rates
//
// Returns the pricebook rate map for the current session (authenticated or guest).
// Used by PricingContext to cache rates client-side for the duration of a session.
//
// Response: { rates: Record<zoho_item_id, custom_rate>, pricebook_id: string | null }

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, getGuestSession } from '@/lib/auth'
import { resolvePricebookRates, GUEST_PRICEBOOK_ID } from '@/lib/pricing'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session_token')?.value
  const guestToken = request.nextUrl.searchParams.get('guest_token')

  let zohoContactId: string | null = null
  let pricebookId: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) {
      zohoContactId = session.zoho_contact_id
      pricebookId = session.pricebook_id
    }
  } else if (guestToken) {
    const guest = await getGuestSession(guestToken)
    if (!guest) {
      return NextResponse.json({ rates: {}, pricebook_id: null })
    }
    // Guest: will use GUEST_PRICEBOOK_ID inside resolvePricebookRates
    pricebookId = GUEST_PRICEBOOK_ID
  } else {
    // Anonymous with no token — also gets guest rates
    pricebookId = GUEST_PRICEBOOK_ID
  }

  const supabase = createServiceClient()
  const rates = await resolvePricebookRates(supabase, zohoContactId)

  return NextResponse.json(
    { rates, pricebook_id: pricebookId },
    {
      headers: {
        // Cache for 5 minutes — pricebook assignments rarely change mid-session.
        // The client PricingContext stores rates in memory for the full session,
        // so this HTTP cache only helps if the route is called multiple times.
        'Cache-Control': 'private, max-age=300',
      },
    }
  )
}
