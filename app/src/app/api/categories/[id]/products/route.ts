import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import type { CatalogItem } from '@/types/catalog'
import { buildCatalogItem } from '@/lib/pricing'
import { normalizeCategoryIconUrls } from '@/lib/catalog/product-image-urls'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = createServiceClient()

  // ── Resolve category name from zoho_category_id ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cat } = await (supabase as any)
    .from('categories')
    .select('category_name, icon_url, icon_urls')
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

  const categoryIconUrls = normalizeCategoryIconUrls(cat.icon_urls, cat.icon_url)
  const categoryIconMap: Record<string, string[]> = categoryIconUrls
    ? { [cat.category_name]: categoryIconUrls }
    : {}

  // ── Shape CatalogItem[] with popularity attached ──────────────────────────
  const items: (CatalogItem & { order_count_30d: number })[] = (rows as Record<string, unknown>[]).map(
    (row) => {
      const base = buildCatalogItem(row, pricebookRates, categoryIconMap)
      return {
        ...base,
        order_count_30d: popMap.get(row.zoho_item_id as string) ?? 0,
      }
    }
  )

  // Sort by 30-day order count descending (most popular first)
  items.sort((a, b) => b.order_count_30d - a.order_count_30d)

  return NextResponse.json({ items, category_name: cat.category_name })
}
