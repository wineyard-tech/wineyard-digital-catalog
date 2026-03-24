import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import type { CatalogItem } from '@/types/catalog'

/**
 * GET /api/recommendations?ids=id1,id2,id3
 *
 * Returns up to 4 CatalogItem suggestions for the "Complete your Order" strip.
 *
 * Strategy:
 *   1. Query product_associations (item_a_id IN cart, order by lift_score DESC).
 *      Deduplicate item_b_id, exclude cart items. Take up to 4.
 *   2. If fewer than 2 found, fall back:
 *      a. Determine cart's category_ids from items table.
 *      b. Query category_associations (category_a_id IN cart_categories,
 *         order by lift_score DESC) → related category_ids.
 *      c. Fetch active items from those categories, optionally filtered by
 *         dominant system_type. Exclude cart items. Fill up to 4 total.
 *   3. Resolve pricebook pricing for authenticated callers.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const idsParam = searchParams.get('ids')
  if (!idsParam) return NextResponse.json({ items: [] })

  const cartIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (cartIds.length === 0) return NextResponse.json({ items: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any

  // ── Resolve caller for pricebook pricing ──────────────────────────────────
  const sessionToken = request.cookies.get('session_token')?.value
  let zohoContactId: string | null = null
  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) zohoContactId = session.zoho_contact_id
  }

  // ── Fetch cart item metadata ───────────────────────────────────────────────
  const { data: cartMeta } = await supabase
    .from('items')
    .select('zoho_item_id, system_type, category_id, category_name')
    .in('zoho_item_id', cartIds)

  if (!cartMeta || cartMeta.length === 0) return NextResponse.json({ items: [] })

  // Dominant system_type (mode, excluding universal / service)
  const stCounts: Record<string, number> = {}
  for (const row of cartMeta as { system_type: string | null }[]) {
    const st = row.system_type?.toLowerCase()
    if (st && st !== 'universal' && st !== 'service') {
      stCounts[st] = (stCounts[st] ?? 0) + 1
    }
  }
  const dominantSystemType =
    Object.entries(stCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // ── Step 1: product_associations lookup ───────────────────────────────────
  const { data: assocRows } = await supabase
    .from('product_associations')
    .select('item_b_id, lift_score')
    .in('item_a_id', cartIds)
    .order('lift_score', { ascending: false })
    .limit(20)

  const seen = new Set<string>(cartIds)
  const suggestionIds: string[] = []

  for (const row of (assocRows ?? []) as { item_b_id: string }[]) {
    if (!seen.has(row.item_b_id)) {
      seen.add(row.item_b_id)
      suggestionIds.push(row.item_b_id)
    }
    if (suggestionIds.length >= 4) break
  }

  // ── Step 2: category_associations fallback ────────────────────────────────
  if (suggestionIds.length < 2) {
    const cartCategoryIds = [
      ...new Set(
        (cartMeta as { category_id: string | null }[])
          .map((r) => r.category_id)
          .filter((c): c is string => Boolean(c))
      ),
    ]

    if (cartCategoryIds.length > 0) {
      // Find related categories ordered by lift
      const { data: catAssocRows } = await supabase
        .from('category_associations')
        .select('category_b_id, lift_score')
        .in('category_a_id', cartCategoryIds)
        .order('lift_score', { ascending: false })
        .limit(10)

      const relatedCategoryIds = [
        ...new Set(
          (catAssocRows ?? [])
            .map((r: { category_b_id: string }) => r.category_b_id)
            .filter((id: string) => !cartCategoryIds.includes(id))
        ),
      ]

      if (relatedCategoryIds.length > 0) {
        let itemQuery = supabase
          .from('items')
          .select('zoho_item_id')
          .in('category_id', relatedCategoryIds)
          .eq('status', 'active')
          .neq('stock_status', 'out_of_stock')
          .order('available_stock', { ascending: false })
          .limit(20)

        if (dominantSystemType) {
          itemQuery = itemQuery.eq('system_type', dominantSystemType)
        }

        const { data: fallbackItems } = await itemQuery

        for (const row of (fallbackItems ?? []) as { zoho_item_id: string }[]) {
          if (!seen.has(row.zoho_item_id)) {
            seen.add(row.zoho_item_id)
            suggestionIds.push(row.zoho_item_id)
          }
          if (suggestionIds.length >= 4) break
        }

        // If system_type filter produced too few, retry without it
        if (suggestionIds.length < 2 && dominantSystemType) {
          const { data: broadItems } = await supabase
            .from('items')
            .select('zoho_item_id')
            .in('category_id', relatedCategoryIds)
            .eq('status', 'active')
            .neq('stock_status', 'out_of_stock')
            .order('available_stock', { ascending: false })
            .limit(20)

          for (const row of (broadItems ?? []) as { zoho_item_id: string }[]) {
            if (!seen.has(row.zoho_item_id)) {
              seen.add(row.zoho_item_id)
              suggestionIds.push(row.zoho_item_id)
            }
            if (suggestionIds.length >= 4) break
          }
        }
      }
    }
  }

  if (suggestionIds.length === 0) return NextResponse.json({ items: [] })

  // ── Fetch full item details ────────────────────────────────────────────────
  const { data: itemRows } = await supabase
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', suggestionIds)
    .eq('status', 'active')

  if (!itemRows || itemRows.length === 0) return NextResponse.json({ items: [] })

  // ── Resolve pricebook rates ────────────────────────────────────────────────
  let pricebookRates: Record<string, number> = {}
  if (zohoContactId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('pricebook_id')
      .eq('zoho_contact_id', zohoContactId)
      .maybeSingle()

    if (contact?.pricebook_id) {
      const { data: pbRows } = await supabase
        .from('pricebooks')
        .select('zoho_item_id, custom_rate')
        .eq('zoho_pricebook_id', contact.pricebook_id)
        .in('zoho_item_id', suggestionIds)

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

  // ── Shape CatalogItem[] preserving suggestion order ────────────────────────
  const itemMap = Object.fromEntries(
    (itemRows as Record<string, unknown>[]).map((r) => [r.zoho_item_id as string, r])
  )

  const items: CatalogItem[] = suggestionIds
    .filter((id) => itemMap[id])
    .slice(0, 4)
    .map((id) => {
      const row = itemMap[id]
      const baseRate = Number(row.base_rate ?? 0)
      const customRate = pricebookRates[id]
      const finalPrice = customRate ?? baseRate
      const stock = Number(row.available_stock ?? 0)
      let imageUrl: string | null = null
      if (Array.isArray(row.image_urls) && (row.image_urls as unknown[]).length > 0) {
        imageUrl = (row.image_urls as string[])[0]
      }
      return {
        zoho_item_id: id,
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
      }
    })

  return NextResponse.json({ items })
}
