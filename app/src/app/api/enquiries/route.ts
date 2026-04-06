import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { EnquiryListItem } from '@/types/catalog'

// ── GET /api/enquiries — Paginated customer estimates list ────────────────────

const LIST_LIMIT = 20

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const supabase = createServiceClient()

  // Fetch LIST_LIMIT + 1 rows to determine has_more without an extra count query.
  // .range(from, to) is inclusive on both ends, so range(0, 20) = 21 rows.
  const { data, error } = await supabase
    .from('estimates')
    .select('public_id, estimate_number, date, created_at, total, line_items, status')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + LIST_LIMIT) // inclusive → LIST_LIMIT+1 rows max

  if (error) {
    console.error('[enquiries] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch enquiries' }, { status: 500 })
  }

  const rows = data ?? []
  const has_more = rows.length > LIST_LIMIT
  const page = rows.slice(0, LIST_LIMIT)

  const items: EnquiryListItem[] = page.map((row) => {
    const lineItems = Array.isArray(row.line_items) ? row.line_items as { quantity: number }[] : []
    return {
      id: row.public_id as string,
      doc_number: row.estimate_number,
      date: row.date ?? row.created_at?.slice(0, 10) ?? '',
      total: row.total,
      item_count: lineItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
      status: row.status as string,
    }
  })

  return NextResponse.json({
    items,
    has_more,
    next_offset: offset + LIST_LIMIT,
  })
}
