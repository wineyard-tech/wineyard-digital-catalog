import { createServiceClient } from './supabase/server'
import type { CatalogItem } from '@/types/catalog'

export interface CatalogFilters {
  category?: string
  brand?: string
  q?: string
  page?: number
  sort?: string
}

// The "General Pricebook" — used for guest / anonymous users.
// Matches the Zoho pricebook_id for the general public price list.
export const GUEST_PRICEBOOK_ID = '2251466000000142119'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Resolves the effective pricebook_id for a given contact (or guest).
 *
 * Rules:
 *   - Authenticated with pricebook_id  → their assigned pricebook
 *   - Authenticated without pricebook_id → null  (base_rate used)
 *   - Guest / anonymous (null contactId) → GUEST_PRICEBOOK_ID
 */
async function resolveEffectivePricebookId(
  supabase: ServiceClient,
  zohoContactId: string | null
): Promise<string | null> {
  if (!zohoContactId) {
    // Guest: always use General Pricebook
    return GUEST_PRICEBOOK_ID
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('pricebook_id')
    .eq('zoho_contact_id', zohoContactId)
    .maybeSingle()

  // Authenticated user with an assigned pricebook
  if (contact?.pricebook_id) return contact.pricebook_id

  // Authenticated user with no pricebook → fall through to base_rate
  return null
}

/**
 * Fetches price override rates for a pricebook.
 * Returns a map of { zoho_item_id → custom_rate }.
 * Empty map means "use base_rate for all items".
 */
async function fetchPricebookRates(
  supabase: ServiceClient,
  pricebookId: string
): Promise<Record<string, number>> {
  const { data: pbRows } = await supabase
    .from('pricebook_items')
    .select('zoho_item_id, custom_rate')
    .eq('zoho_pricebook_id', pricebookId)

  if (!pbRows || pbRows.length === 0) return {}

  return Object.fromEntries(
    (pbRows as { zoho_item_id: string; custom_rate: number }[]).map(p => [
      p.zoho_item_id,
      Number(p.custom_rate),
    ])
  )
}

/**
 * Fetches pricebook override rates for a contact (or guest).
 * Returns an empty map only for authenticated users with no pricebook assigned.
 *
 * @param zohoContactId - null means guest/anonymous → uses GUEST_PRICEBOOK_ID
 */
export async function resolvePricebookRates(
  supabase: ServiceClient,
  zohoContactId: string | null
): Promise<Record<string, number>> {
  const pricebookId = await resolveEffectivePricebookId(supabase, zohoContactId)
  if (!pricebookId) return {}
  return fetchPricebookRates(supabase, pricebookId)
}

/**
 * Shapes a raw items row into a CatalogItem, applying pricebook rates where available.
 * Falls back to base_rate when the pricebook has no entry for this item.
 * categoryIconMap: category_name → icon_url, used as fallback when item has no image.
 */
export function buildCatalogItem(
  row: Record<string, unknown>,
  pricebookRates: Record<string, number>,
  categoryIconMap: Record<string, string> = {}
): CatalogItem {
  const baseRate = Number(row.base_rate ?? 0)
  const customRate = pricebookRates[row.zoho_item_id as string]
  const finalPrice = customRate ?? baseRate
  const stock = Number(row.available_stock ?? 0)
  const categoryName = (row.category_name as string | null) ?? null

  let imageUrl: string | null = null
  if (Array.isArray(row.image_urls) && row.image_urls.length > 0) {
    imageUrl = row.image_urls[0] as string
  }

  return {
    zoho_item_id: row.zoho_item_id as string,
    item_name: row.item_name as string,
    sku: row.sku as string,
    brand: (row.brand as string | null) ?? null,
    category_name: categoryName,
    base_rate: baseRate,
    final_price: finalPrice,
    available_stock: stock,
    stock_status: stock > 10 ? 'available' : stock > 0 ? 'limited' : 'out_of_stock',
    image_url: imageUrl,
    category_icon_url: (categoryName && categoryIconMap[categoryName]) ? categoryIconMap[categoryName] : null,
    tax_percentage: 18,
    price_type: customRate != null ? 'custom' : 'base',
  }
}

/**
 * Fetches category_name → icon_url map for all categories.
 * Categories table is tiny (<30 rows) so fetching all is cheaper than per-item joins.
 */
export async function fetchCategoryIconMap(supabase: ServiceClient): Promise<Record<string, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('categories')
    .select('category_name, icon_url')
  if (!data) return {}
  return Object.fromEntries(
    (data as { category_name: string; icon_url: string | null }[])
      .filter(r => r.icon_url)
      .map(r => [r.category_name, r.icon_url!])
  )
}

/**
 * Fetches active catalog items with pricing resolved for the given contact.
 *
 * Pricing rules (in order):
 *   1. Guest (null contactId)      → General Pricebook rates; fallback base_rate
 *   2. Auth'd + pricebook assigned → That pricebook's rates; fallback base_rate
 *   3. Auth'd + no pricebook       → base_rate for all items
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
    const q = (filters.q as string).replace(/[%_]/g, '\\$&')
    query = query.or(`item_name.ilike.%${q}%,sku.ilike.${q}%,brand.ilike.%${q}%`)
  }

  if (filters.sort === 'price_asc') {
    query = query.order('base_rate', { ascending: true })
  } else if (filters.sort === 'price_desc') {
    query = query.order('base_rate', { ascending: false })
  } else {
    query = query.order('item_name', { ascending: true })
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1)

  const { data: rows, count, error } = await query
  if (error || !rows) return { items: [], total: 0 }

  // ── Step 2: Resolve pricebook rates + category icon map ───────────────────
  const [pricebookRates, categoryIconMap] = await Promise.all([
    resolvePricebookRates(supabase, zohoContactId),
    fetchCategoryIconMap(supabase),
  ])

  // ── Step 3: Shape CatalogItem[] ───────────────────────────────────────────
  const items: CatalogItem[] = (rows as Record<string, unknown>[]).map(row =>
    buildCatalogItem(row, pricebookRates, categoryIconMap)
  )

  return { items, total: count ?? 0 }
}

/**
 * Fetches a specific set of items by ID with pricing resolved.
 * Preserves the order of the supplied itemIds array.
 */
export async function resolvePriceByIds(
  zohoContactId: string | null,
  itemIds: string[]
): Promise<CatalogItem[]> {
  if (itemIds.length === 0) return []
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from('items')
    .select('zoho_item_id, item_name, sku, brand, category_name, base_rate, available_stock, image_urls')
    .eq('status', 'active')
    .in('zoho_item_id', itemIds)

  if (error || !rows) return []

  // ── Step 2: Resolve pricebook rates + category icon map ───────────────────
  const [pricebookRates, categoryIconMap] = await Promise.all([
    resolvePricebookRates(supabase, zohoContactId),
    fetchCategoryIconMap(supabase),
  ])

  // ── Step 3: Shape CatalogItem[], preserving the itemIds order ────────────
  const rowMap = new Map<string, Record<string, unknown>>()
  for (const row of rows as Record<string, unknown>[]) {
    rowMap.set(row.zoho_item_id as string, row)
  }

  return itemIds
    .map((id) => rowMap.get(id))
    .filter((row): row is Record<string, unknown> => row !== undefined)
    .map((row) => buildCatalogItem(row, pricebookRates, categoryIconMap))
}
