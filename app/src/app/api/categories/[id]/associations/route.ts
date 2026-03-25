import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth'
import type { CatalogItem } from '@/types/catalog'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = createServiceClient()

  // ── Get source category name ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cat } = await (supabase as any)
    .from('categories')
    .select('category_name')
    .eq('zoho_category_id', id)
    .single()

  if (!cat) return NextResponse.json({ products: [], category_name: null })

  // ── Fetch associated category pairs, ordered by lift descending ───────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assoc } = await (supabase as any)
    .from('category_associations')
    .select('category_a, category_b, lift')
    .or(`category_a.eq.${id},category_b.eq.${id}`)
    .order('lift', { ascending: false })
    .limit(6)

  if (!assoc?.length) {
    return NextResponse.json({ products: [], category_name: cat.category_name })
  }

  // ── Resolve the other side of each pair ───────────────────────────────────
  const otherIds: string[] = assoc.map(
    (a: { category_a: string; category_b: string }) =>
      a.category_a === id ? a.category_b : a.category_a
  )

  // ── Look up category names for the associated IDs ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assocCats } = await (supabase as any)
    .from('categories')
    .select('zoho_category_id, category_name')
    .in('zoho_category_id', otherIds)

  const catNameMap = new Map<string, string>(
    (assocCats ?? []).map((c: { zoho_category_id: string; category_name: string }) => [
      c.zoho_category_id,
      c.category_name,
    ])
  )

  // ── Fetch items from associated categories (batched) ──────────────────────
  const assocCatNames = otherIds
    .map((cId) => catNameMap.get(cId))
    .filter((n): n is string => !!n)

  if (!assocCatNames.length) {
    return NextResponse.json({ products: [], category_name: cat.category_name })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allRows } = await (supabase as any)
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .eq('status', 'active')
    .in('category_name', assocCatNames)

  if (!allRows?.length) {
    return NextResponse.json({ products: [], category_name: cat.category_name })
  }

  // ── Fetch popularity to pick top products per associated category ─────────
  const itemIds = (allRows as { zoho_item_id: string }[]).map((r) => r.zoho_item_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: popRows } = await (supabase as any)
    .from('product_popularity')
    .select('zoho_item_id, order_count_30d')
    .in('zoho_item_id', itemIds)

  const popMap = new Map<string, number>(
    (popRows ?? []).map((p: { zoho_item_id: string; order_count_30d: number }) => [
      p.zoho_item_id,
      p.order_count_30d,
    ])
  )

  // ── Resolve pricebook rates ───────────────────────────────────────────────
  const sessionToken = request.cookies.get('session_token')?.value
  let zohoContactId: string | null = null
  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) zohoContactId = session.zoho_contact_id
  }

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

  // ── Group by associated category, sort by popularity, pick top 2 each ─────
  const byCategory = new Map<string, Record<string, unknown>[]>()
  for (const row of allRows as Record<string, unknown>[]) {
    const catName = row.category_name as string
    if (!byCategory.has(catName)) byCategory.set(catName, [])
    byCategory.get(catName)!.push(row)
  }

  // Sort each group by popularity
  for (const [catName, catRows] of byCategory) {
    catRows.sort(
      (a, b) =>
        (popMap.get(b.zoho_item_id as string) ?? 0) -
        (popMap.get(a.zoho_item_id as string) ?? 0)
    )
    byCategory.set(catName, catRows.slice(0, 2))
  }

  // Flatten in association order (highest lift first), cap at 6 products total
  const products: CatalogItem[] = []
  for (const catName of assocCatNames) {
    const catRows = byCategory.get(catName) ?? []
    for (const row of catRows) {
      if (products.length >= 6) break
      const baseRate = Number(row.base_rate ?? 0)
      const customRate = pricebookRates[row.zoho_item_id as string]
      const finalPrice = customRate ?? baseRate
      const stock = Number(row.available_stock ?? 0)
      let imageUrl: string | null = null
      if (Array.isArray(row.image_urls) && row.image_urls.length > 0) {
        imageUrl = row.image_urls[0] as string
      }
      products.push({
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
      })
    }
    if (products.length >= 6) break
  }

  return NextResponse.json({ products, category_name: cat.category_name })
}
