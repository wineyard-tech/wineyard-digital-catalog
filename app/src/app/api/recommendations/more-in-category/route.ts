import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, getGuestSession } from '@/lib/auth'
import { resolvePriceByIds } from '@/lib/pricing'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const productId = searchParams.get('product_id')
  const category = searchParams.get('category')

  if (!productId || !category) {
    return NextResponse.json({ error: 'product_id and category are required' }, { status: 400 })
  }

  // ── Auth resolution ───────────────────────────────────────────────────────
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

  // ── Resolve category_id from the current product ──────────────────────────
  // product_popularity uses category_id, not category_name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: productRow } = await (supabase as any)
    .from('items')
    .select('category_id')
    .eq('zoho_item_id', productId)
    .maybeSingle()

  const categoryId: string | null = productRow?.category_id ?? null

  if (!categoryId) {
    return NextResponse.json({ items: [] })
  }

  // ── Query product_popularity filtered by category_id ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: popRows } = await (supabase as any)
    .from('product_popularity')
    .select('zoho_item_id')
    .eq('category_id', categoryId)
    .neq('zoho_item_id', productId)
    .order('order_count_30d', { ascending: false })
    .limit(8)

  const itemIds: string[] = (popRows ?? []).map(
    (r: { zoho_item_id: string }) => r.zoho_item_id
  )

  if (itemIds.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const items = await resolvePriceByIds(zohoContactId, itemIds)
  return NextResponse.json({ items })
}
