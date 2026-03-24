import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
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

  // ── 3. Shape CatalogItem[] (base pricing, no pricebook) ───────────────────
  // Preserve the popularity order from step 1.
  const rowMap = new Map(
    (rows as Record<string, unknown>[]).map((r) => [r.zoho_item_id as string, r]),
  )

  const items = popularIds
    .map((id) => {
      const row = rowMap.get(id)
      if (!row) return null

      const baseRate = Number(row.base_rate ?? 0)
      const stock = Number(row.available_stock ?? 0)

      let imageUrl: string | null = null
      if (Array.isArray(row.image_urls) && (row.image_urls as unknown[]).length > 0) {
        imageUrl = (row.image_urls as string[])[0]
      }

      return {
        zoho_item_id: row.zoho_item_id as string,
        item_name: row.item_name as string,
        sku: row.sku as string,
        brand: (row.brand as string | null) ?? null,
        category_name: (row.category_name as string | null) ?? null,
        base_rate: baseRate,
        final_price: baseRate,
        available_stock: stock,
        stock_status: stock > 10 ? 'available' : stock > 0 ? 'limited' : 'out_of_stock',
        image_url: imageUrl,
        tax_percentage: 18,
        price_type: 'base',
      } satisfies CatalogItem
    })
    .filter((item): item is CatalogItem => item !== null)

  return NextResponse.json({ items })
}
