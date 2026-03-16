import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'

/** Build an @supabase/ssr client that reads cookies from the request. */
function buildSsrClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )
}

/** Validates that the request carries a valid Supabase Auth session. */
async function requireAdminUser(request: NextRequest) {
  try {
    const ssrClient = buildSsrClient(request)
    const { data: { user }, error } = await ssrClient.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

// ─── GET /api/admin — list estimates ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await requireAdminUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')
  const fromDate = searchParams.get('from_date')
  const toDate = searchParams.get('to_date')

  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('estimates')
    .select(`
      id,
      estimate_number,
      zoho_estimate_id,
      status,
      date,
      line_items,
      subtotal,
      tax_total,
      total,
      notes,
      whatsapp_sent,
      created_at,
      contacts (
        zoho_contact_id,
        contact_name,
        company_name,
        phone,
        email
      )
    `)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)

  const { data, error } = await query

  if (error) {
    console.error('[admin GET] query error:', error)
    return NextResponse.json({ error: 'Failed to fetch estimates' }, { status: 500 })
  }

  return NextResponse.json({ estimates: data ?? [] })
}

// PATCH is handled by /api/admin/[id]/route.ts
export async function PATCH() {
  return NextResponse.json(
    { error: 'Use PATCH /api/admin/{id} to update a specific estimate' },
    { status: 405 }
  )
}
