import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import type { CatalogItem } from '@/types/catalog'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = createServiceClient()

  // ── Resolve category name from zoho_category_id ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cat } = await (supabase as any)
    .from('categories')
    .select('category_name')
    .eq('zoho_category_id', id)
    .single()

  if (!cat) return NextResponse.json({ items: [], category_name: null }, { status: 404 })

  // ── Determine caller identity for pricing ─────────────────────────────────
  const sessionToken = request.cookies.get('session_token')?.value
  let zohoContactId: string | null = null
  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) zohoContactId = session.zoho_contact_id
  }

  // ── Fetch all active items in this category ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .eq('status', 'active')
    .eq('category_name', cat.category_name)

  if (!rows?.length) {
    return NextResponse.json({ items: [], category_name: cat.category_name })
  }

  // ── Fetch 30-day popularity for all items ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: popRows } = await (supabase as any)
    .from('product_popularity')
    .select('zoho_item_id, order_count_30d')

  const popMap = new Map<string, number>(
    (popRows ?? []).map((p: { zoho_item_id: string; order_count_30d: number }) => [
      p.zoho_item_id,
      p.order_count_30d,
    ])
  )

  // ── Resolve pricebook rates (authenticated users) ─────────────────────────
  let pricebookRates: Record<string, number> = {}
  if (zohoContactId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact } = await (supabase as any)
      .from('contacts')
      .select('pricebook_id')
      .eq('zoho_contact_id', zohoContactId)
      .maybeSingle()

    if (contact?.pricebook_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pbRows } = await (supabase as any)
        .from('pricebooks')
        .select('zoho_item_id, custom_rate')
        .eq('zoho_pricebook_id', contact.pricebook_id)

      if (pbRows) {
        pricebookRates = Object.fromEntries(
          (pbRows as { zoho_item_id: string; custom_rate: number }[]).map((p) => [
            p.zoho_item_id,
            Number(p.custom_rate),
          ])
        )
      }
    }
  }

  // ── Shape CatalogItem[] with popularity attached ──────────────────────────
  const items = (rows as Record<string, unknown>[]).map((row) => {
    const baseRate = Number(row.base_rate ?? 0)
    const customRate = pricebookRates[row.zoho_item_id as string]
    const finalPrice = customRate ?? baseRate
    const stock = Number(row.available_stock ?? 0)
    let imageUrl: string | null = null
    if (Array.isArray(row.image_urls) && row.image_urls.length > 0) {
      imageUrl = row.image_urls[0] as string
    }

    const item: CatalogItem & { order_count_30d: number } = {
      zoho_item_id: row.zoho_item_id as string,
      item_name: row.item_name as string,
      sku: row.sku as string,
      brand: (row.brand as string | null) ?? null,
      category_name: (row.category_name as string | null) ?? null,
      base_rate: baseRate,
      final_price: finalPrice,
      available_stock: stock,
      stock_status: stock > 10 ? 'available' : stock > 0 ? 'limited' : 'out_of_stock',
      image_url: imageUrl,
      tax_percentage: 18,
      price_type: customRate != null ? 'custom' : 'base',
      order_count_30d: popMap.get(row.zoho_item_id as string) ?? 0,
    }
    return item
  })

  // Sort by 30-day order count descending (most popular first)
  items.sort((a, b) => b.order_count_30d - a.order_count_30d)

  return NextResponse.json({ items, category_name: cat.category_name })
}
