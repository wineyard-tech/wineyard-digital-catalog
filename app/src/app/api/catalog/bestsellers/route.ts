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

  // Fetch extra to account for items filtered out as services
  const { data: popular } = await (supabase as any)
    .from('product_popularity')
    .select('zoho_item_id')
    .order('order_count_30d', { ascending: false })
    .limit(20)

  if (!popular || popular.length === 0) return NextResponse.json({ items: [] })

  const ids = (popular as Array<{ zoho_item_id: string }>).map(p => p.zoho_item_id)

  const { data: rows } = await (supabase as any)
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', ids)
    .eq('status', 'active')
    .or('system_type.is.null,system_type.neq.service')

  if (!rows) return NextResponse.json({ items: [] })

  // Preserve popularity order, cap at 10
  const rowMap = Object.fromEntries(
    (rows as Record<string, unknown>[]).map(r => [r.zoho_item_id as string, r])
  )
  const items = ids
    .map(id => rowMap[id])
    .filter(Boolean)
    .slice(0, 10)
    .map(row => buildCatalogItem(row as Record<string, unknown>, pricebookRates, categoryIconMap))

  return NextResponse.json({ items })
}
