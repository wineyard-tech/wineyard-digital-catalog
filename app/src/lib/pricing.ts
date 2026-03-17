import { createServiceClient } from './supabase/server'
import type { CatalogItem } from '../../../types/catalog'

export interface CatalogFilters {
  category?: string
  brand?: string
  q?: string
  page?: number
  sort?: string
}

/**
 * Fetches active catalog items with pricing resolved for the given contact.
 *
 * Implements the architecture §5 SQL join in two sequential DB queries:
 *   1. Fetch paginated items with optional filters
 *   2. If contact has a pricebook, fetch custom rates and overlay them
 *
 * Guest users (zohoContactId = null) always receive base_rate.
 */
export async function resolvePrice(
  zohoContactId: string | null,
  filters: CatalogFilters = {}
): Promise<{ items: CatalogItem[]; total: number }> {
  const supabase = createServiceClient()
  const page = filters.page ?? 1
  const pageSize = 30

  // ── Step 1: Query items with filters ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('items')
    .select(
      'zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls',
      { count: 'exact' }
    )
    .eq('status', 'active')

  if (filters.category) query = query.eq('category_name', filters.category)
  if (filters.brand) query = query.eq('brand', filters.brand)
  if (filters.q) {
    const q = (filters.q as string).replace(/[%_]/g, '\\$&') // escape LIKE wildcards
    query = query.or(`item_name.ilike.%${q}%,sku.ilike.${q}%,brand.ilike.%${q}%`)
  }

  // Sorting
  if (filters.sort === 'price_asc') {
    query = query.order('base_rate', { ascending: true })
  } else if (filters.sort === 'price_desc') {
    query = query.order('base_rate', { ascending: false })
  } else {
    query = query.order('item_name', { ascending: true })
  }

  // Pagination
  query = query.range((page - 1) * pageSize, page * pageSize - 1)

  const { data: rows, count, error } = await query
  if (error || !rows) return { items: [], total: 0 }

  // ── Step 2: Resolve pricebook rates (registered users only) ───────────────
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

  // ── Step 3: Shape CatalogItem[] ───────────────────────────────────────────
  const items: CatalogItem[] = (rows as Record<string, unknown>[]).map((row) => {
    const baseRate = Number(row.base_rate ?? 0)
    const customRate = pricebookRates[row.zoho_item_id as string]
    const finalPrice = customRate ?? baseRate
    const stock = Number(row.available_stock ?? 0)

    let imageUrl: string | null = null
    if (Array.isArray(row.image_urls) && row.image_urls.length > 0) {
      imageUrl = row.image_urls[0] as string
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
      stock_status:
        stock > 10 ? 'available' : stock > 0 ? 'limited' : 'out_of_stock',
      image_url: imageUrl,
      tax_percentage: 18,
      price_type: customRate != null ? 'custom' : 'base',
    }
  })

  return { items, total: count ?? 0 }
}
