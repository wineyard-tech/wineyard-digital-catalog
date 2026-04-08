import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolvePricebookRates, buildCatalogItem, fetchCategoryIconMap } from '@/lib/pricing'

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session_token')?.value
  let zohoContactId: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) zohoContactId = session.zoho_contact_id
  }

  const supabase = createServiceClient()
  const [pricebookRates, categoryIconMap] = await Promise.all([
    resolvePricebookRates(supabase, zohoContactId),
    fetchCategoryIconMap(supabase),
  ])

  let recommendedIds: string[] = []

  // Try personalized recommendations if authenticated
  if (zohoContactId) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('line_items')
      .eq('zoho_contact_id', zohoContactId)
      .gte('date', since)

    if (orders && orders.length > 0) {
      const purchasedIds = new Set<string>()
      for (const order of orders) {
        const lineItems = order.line_items as Array<{ zoho_item_id: string }>
        for (const li of lineItems ?? []) {
          if (li.zoho_item_id) purchasedIds.add(li.zoho_item_id)
        }
      }

      if (purchasedIds.size > 0) {
        const { data: assocs } = await (supabase as any)
          .from('product_associations')
          .select('item_b_id, lift_score')
          .in('item_a_id', Array.from(purchasedIds))
          .eq('association_type', 'people_also_buy')
          .order('lift_score', { ascending: false, nullsFirst: false })
          .limit(30)

        if (assocs && assocs.length > 0) {
          const seen = new Set<string>()
          for (const a of assocs as Array<{ item_b_id: string }>) {
            if (!purchasedIds.has(a.item_b_id) && !seen.has(a.item_b_id)) {
              seen.add(a.item_b_id)
              recommendedIds.push(a.item_b_id)
              if (recommendedIds.length >= 10) break
            }
          }
        }
      }
    }
  }

  // Fall back to top 10 by 30-day order count if not enough personalized results
  if (recommendedIds.length < 3) {
    const { data: popular } = await (supabase as any)
      .from('product_popularity')
      .select('zoho_item_id')
      .order('order_count_30d', { ascending: false })
      .limit(15)

    if (popular) {
      recommendedIds = (popular as Array<{ zoho_item_id: string }>).map(p => p.zoho_item_id)
    }
  }

  if (recommendedIds.length === 0) return NextResponse.json({ items: [] })

  const { data: rows } = await (supabase as any)
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', recommendedIds.slice(0, 10))
    .eq('status', 'active')
    .or('system_type.is.null,system_type.neq.service')

  if (!rows) return NextResponse.json({ items: [] })

  // Preserve recommendation order
  const rowMap = Object.fromEntries(
    (rows as Record<string, unknown>[]).map(r => [r.zoho_item_id as string, r])
  )
  const items = recommendedIds
    .slice(0, 10)
    .map(id => rowMap[id])
    .filter(Boolean)
    .map(row => buildCatalogItem(row as Record<string, unknown>, pricebookRates, categoryIconMap))

  return NextResponse.json({ items })
}
