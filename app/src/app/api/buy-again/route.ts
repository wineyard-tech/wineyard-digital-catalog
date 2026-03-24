import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { CatalogItem, CartItem } from '@/types/catalog'

export interface PurchasedProduct extends CatalogItem {
  last_purchased_at: string
  total_qty: number
  order_count: number
}

// ── GET /api/buy-again ────────────────────────────────────────────────────────
// Returns the authenticated user's previously purchased products, deduplicated
// and aggregated across all their orders.
//
// Response shapes:
//   { has_orders: true,  products: PurchasedProduct[] }
//   { has_orders: false, products: [], bestsellers: CatalogItem[] }
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const supabase = createServiceClient()

  // ── 1. Fetch last 50 orders with full line_items ───────────────────────────
  const { data: orders, error: ordersError } = await supabase
    .from('sales_orders')
    .select('line_items, created_at')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .neq('zoho_sync_status', 'failed')
    .order('created_at', { ascending: false })
    .limit(50)

  if (ordersError) {
    console.error('[buy-again] orders fetch error:', ordersError)
    return NextResponse.json({ error: 'Failed to load order history' }, { status: 500 })
  }

  // ── 2. Aggregate products across all orders ────────────────────────────────
  // Track per-product: latest order date, cumulative qty, and order count.
  const productMap = new Map<string, { last_purchased_at: string; total_qty: number; order_count: number }>()

  for (const order of orders ?? []) {
    const lineItems = Array.isArray(order.line_items) ? (order.line_items as CartItem[]) : []
    for (const item of lineItems) {
      if (!item.zoho_item_id) continue
      const existing = productMap.get(item.zoho_item_id)
      if (existing) {
        if (order.created_at > existing.last_purchased_at) {
          existing.last_purchased_at = order.created_at
        }
        existing.total_qty += item.quantity
        existing.order_count++
      } else {
        productMap.set(item.zoho_item_id, {
          last_purchased_at: order.created_at,
          total_qty: item.quantity,
          order_count: 1,
        })
      }
    }
  }

  // ── 3. No order history → return bestsellers ───────────────────────────────
  if (productMap.size === 0) {
    const pricebookRates = await resolvePricebookRates(supabase, session.zoho_contact_id)
    const bestsellers = await getBestsellers(supabase, pricebookRates)
    return NextResponse.json({ has_orders: false, products: [], bestsellers })
  }

  // ── 4. Fetch current catalog data for purchased item IDs ──────────────────
  const itemIds = Array.from(productMap.keys())
  const { data: rows } = await supabase
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', itemIds)
    .eq('status', 'active')

  // ── 5. Resolve pricebook rates ─────────────────────────────────────────────
  const pricebookRates = await resolvePricebookRates(supabase, session.zoho_contact_id)

  // ── 6. Shape PurchasedProduct[] ───────────────────────────────────────────
  const products: PurchasedProduct[] = (rows ?? []).map((row) => {
    const baseRate = Number(row.base_rate ?? 0)
    const customRate = pricebookRates[row.zoho_item_id as string]
    const finalPrice = customRate ?? baseRate
    const stock = Number(row.available_stock ?? 0)
    const stats = productMap.get(row.zoho_item_id as string)!

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
      final_price: finalPrice,
      available_stock: stock,
      stock_status: stock > 10 ? 'available' : stock > 0 ? 'limited' : 'out_of_stock',
      image_url: imageUrl,
      tax_percentage: 18,
      price_type: customRate != null ? 'custom' : 'base',
      last_purchased_at: stats.last_purchased_at,
      total_qty: stats.total_qty,
      order_count: stats.order_count,
    }
  })

  // Default sort: most recently purchased first
  products.sort((a, b) => b.last_purchased_at.localeCompare(a.last_purchased_at))

  return NextResponse.json({ has_orders: true, products })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createServiceClient>

async function resolvePricebookRates(
  supabase: SupabaseClient,
  zohoContactId: string,
): Promise<Record<string, number>> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('pricebook_id')
    .eq('zoho_contact_id', zohoContactId)
    .maybeSingle()

  if (!contact?.pricebook_id) return {}

  const { data: pbRows } = await supabase
    .from('pricebooks')
    .select('zoho_item_id, custom_rate')
    .eq('zoho_pricebook_id', contact.pricebook_id)

  if (!pbRows) return {}
  return Object.fromEntries(
    (pbRows as { zoho_item_id: string; custom_rate: number }[]).map((p) => [
      p.zoho_item_id,
      Number(p.custom_rate),
    ]),
  )
}

async function getBestsellers(
  supabase: SupabaseClient,
  pricebookRates: Record<string, number>,
): Promise<CatalogItem[]> {
  const { data: popularRows } = await supabase
    .from('product_popularity')
    .select('zoho_item_id')
    .order('order_count_30d', { ascending: false })
    .limit(10)

  if (!popularRows || popularRows.length === 0) return []

  const popularIds = (popularRows as { zoho_item_id: string }[]).map((r) => r.zoho_item_id)

  const { data: rows } = await supabase
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .in('zoho_item_id', popularIds)
    .eq('status', 'active')
    .neq('item_type', 'service')

  if (!rows) return []

  return (rows as Record<string, unknown>[]).map((row) => {
    const baseRate = Number(row.base_rate ?? 0)
    const customRate = pricebookRates[row.zoho_item_id as string]
    const finalPrice = customRate ?? baseRate
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
      final_price: finalPrice,
      available_stock: stock,
      stock_status: stock > 10 ? 'available' : stock > 0 ? 'limited' : 'out_of_stock',
      image_url: imageUrl,
      tax_percentage: 18,
      price_type: customRate != null ? 'custom' : 'base',
    }
  })
}
