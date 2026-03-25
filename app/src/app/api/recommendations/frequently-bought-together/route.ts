import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, getGuestSession } from '@/lib/auth'
import { resolvePriceByIds, resolvePrice } from '@/lib/pricing'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const productId = searchParams.get('product_id')
  if (!productId) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  // ── Auth resolution (mirrors /api/catalog) ────────────────────────────────
  const sessionToken = request.cookies.get('session_token')?.value
  const guestToken = searchParams.get('guest_token')

  let zohoContactId: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) zohoContactId = session.zoho_contact_id
  } else if (guestToken) {
    const guest = await getGuestSession(guestToken)
    if (!guest) {
      return NextResponse.json({ error: 'Invalid or expired guest token' }, { status: 401 })
    }
  }

  const supabase = createServiceClient()

  // ── Query product_associations ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assocRows } = await (supabase as any)
    .from('product_associations')
    .select('item_b_id')
    .eq('item_a_id', productId)
    .eq('association_type', 'frequently_bought_together')
    .order('lift_score', { ascending: false })
    .limit(6)

  const assocIds: string[] = (assocRows ?? []).map(
    (r: { item_b_id: string }) => r.item_b_id
  )

  // ── Fallback: category products from product_popularity ───────────────────
  if (assocIds.length < 2) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: productRow } = await (supabase as any)
      .from('items')
      .select('category_name, category_id')
      .eq('zoho_item_id', productId)
      .maybeSingle()

    const categoryId: string | null = productRow?.category_id ?? null
    const categoryName: string | null = productRow?.category_name ?? null

    if (categoryId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: popRows } = await (supabase as any)
        .from('product_popularity')
        .select('zoho_item_id')
        .eq('category_id', categoryId)
        .neq('zoho_item_id', productId)
        .order('order_count_30d', { ascending: false })
        .limit(6)

      const popIds: string[] = (popRows ?? []).map(
        (r: { zoho_item_id: string }) => r.zoho_item_id
      )

      if (popIds.length > 0) {
        const items = await resolvePriceByIds(zohoContactId, popIds)
        return NextResponse.json({ items, source: 'popularity_fallback' })
      }
    }

    // Final fallback: top items in same category via catalog logic
    if (categoryName) {
      const { items } = await resolvePrice(zohoContactId, { category: categoryName })
      const filtered = items.filter((i) => i.zoho_item_id !== productId).slice(0, 6)
      return NextResponse.json({ items: filtered, source: 'catalog_fallback' })
    }

    return NextResponse.json({ items: [], source: 'none' })
  }

  // ── Fetch items with pricing for association hits ─────────────────────────
  const items = await resolvePriceByIds(zohoContactId, assocIds)
  return NextResponse.json({ items, source: 'associations' })
}
