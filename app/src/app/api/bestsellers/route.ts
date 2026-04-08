import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildCatalogItem, fetchCategoryIconMap } from '@/lib/pricing'
import type { CatalogItem } from '@/types/catalog'

// ── GET /api/bestsellers ───────────────────────────────────────────────────────
// Public — no auth required.
// Returns up to 12 active products ordered by 30-day order count from
// product_popularity. Excludes service-type items.
// Always returns base_rate pricing (no pricebook resolution for public endpoint).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = createServiceClient()

  // ── 1. Top product IDs by 30-day order count ──────────────────────────────
  const { data: popularRows, error } = await supabase
    .from('product_popularity')
    .select('zoho_item_id')
    .order('order_count_30d', { ascending: false })
    .limit(12)

  if (error || !popularRows || popularRows.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const popularIds = (popularRows as { zoho_item_id: string }[]).map((r) => r.zoho_item_id)

  // ── 2. Fetch current item data ─────────────────────────────────────────────
  const { data: rows } = await supabase
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', popularIds)
    .eq('status', 'active')
    .neq('item_type', 'service')

  if (!rows || rows.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const categoryIconMap = await fetchCategoryIconMap(supabase)

  // ── 3. Shape CatalogItem[] (base pricing, no pricebook) ───────────────────
  // Preserve the popularity order from step 1.
  const rowMap = new Map(
    (rows as Record<string, unknown>[]).map((r) => [r.zoho_item_id as string, r]),
  )

  const items = popularIds
    .map((id) => {
      const row = rowMap.get(id)
      if (!row) return null
      return buildCatalogItem(row, {}, categoryIconMap)
    })
    .filter((item) => item !== null) as CatalogItem[]

  return NextResponse.json({ items })
}
