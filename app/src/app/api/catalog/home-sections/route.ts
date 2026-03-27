import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolvePricebookRates, buildCatalogItem } from '@/lib/pricing'
import type { CatalogItem } from '@/types/catalog'

export interface HomeSection {
  category: string
  items: CatalogItem[]
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('session_token')?.value
  let zohoContactId: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) zohoContactId = session.zoho_contact_id
  }

  const supabase = createServiceClient()
  const pricebookRates = await resolvePricebookRates(supabase, zohoContactId)

  // Fetch popularity data for all items (enough to cover all categories)
  const { data: popularRows } = await (supabase as any)
    .from('product_popularity')
    .select('zoho_item_id, order_count_30d')
    .order('order_count_30d', { ascending: false })
    .limit(300)

  if (!popularRows || popularRows.length === 0) return NextResponse.json({ sections: [] })

  const popularIds = (popularRows as Array<{ zoho_item_id: string; order_count_30d: number }>)
    .map(p => p.zoho_item_id)
  const popularityMap = Object.fromEntries(
    (popularRows as Array<{ zoho_item_id: string; order_count_30d: number }>)
      .map(p => [p.zoho_item_id, p.order_count_30d])
  )

  // Fetch item details for all popular items, excluding services and uncategorised
  const { data: itemRows } = await (supabase as any)
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', popularIds)
    .eq('status', 'active')
    .or('system_type.is.null,system_type.neq.service')
    .not('category_name', 'is', null)

  if (!itemRows || itemRows.length === 0) return NextResponse.json({ sections: [] })

  // Group by category, sort each group by 30d order count
  const categoryMap = new Map<string, Array<Record<string, unknown> & { _pop: number }>>()
  for (const row of itemRows as Record<string, unknown>[]) {
    const cat = row.category_name as string
    if (!cat) continue
    const pop = popularityMap[row.zoho_item_id as string] ?? 0
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push({ ...row, _pop: pop })
  }

  // Rank categories by total 30d order count; require at least 3 products
  const sections: HomeSection[] = Array.from(categoryMap.entries())
    .filter(([, items]) => items.length >= 3)
    .map(([category, items]) => ({
      category,
      totalOrders: items.reduce((sum, i) => sum + i._pop, 0),
      items: items
        .sort((a, b) => b._pop - a._pop)
        .slice(0, 5)
        .map(row => buildCatalogItem(row, pricebookRates)),
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .map(({ category, items }) => ({ category, items }))

  return NextResponse.json({ sections })
}
