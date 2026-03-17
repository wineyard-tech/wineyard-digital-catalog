import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, getGuestSession } from '@/lib/auth'
import { resolvePrice } from '@/lib/pricing'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // ── Determine caller identity ─────────────────────────────────────────────
  const sessionToken = request.cookies.get('session_token')?.value
  const guestToken = searchParams.get('guest_token')

  let zohoContactId: string | null = null
  let isAuthenticated = false

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) {
      zohoContactId = session.zoho_contact_id
      isAuthenticated = true
    }
  } else if (guestToken) {
    const guest = await getGuestSession(guestToken)
    if (!guest) {
      return NextResponse.json({ error: 'Invalid or expired guest token' }, { status: 401 })
    }
    // Guest — zohoContactId stays null; pricing always returns base_rate
  } else {
    // Anonymous access — no session or guest token.
    // zohoContactId stays null; resolvePrice returns base_rate for all items.
  }

  // ── Parse query params ────────────────────────────────────────────────────
  const filters = {
    category: searchParams.get('category') ?? undefined,
    brand: searchParams.get('brand') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
    sort: searchParams.get('sort') ?? undefined,
  }

  // ── Resolve items with pricing ────────────────────────────────────────────
  const { items, total } = await resolvePrice(zohoContactId, filters)
  const pageSize = 20

  return NextResponse.json({
    items,
    total,
    page: filters.page,
    hasMore: filters.page * pageSize < total,
    is_authenticated: isAuthenticated,
  })
}
