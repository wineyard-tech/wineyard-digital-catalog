import type { LineItemDetail } from '@/types/catalog'
import { pickProductImageVariant, PRODUCT_IMAGE_W400 } from '@/lib/catalog/product-image-urls'

/** Normalize JSONB / API payloads to a line-item array. */
export function parseJsonbLineItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Zoho Books line rows use quantity (often string), sometimes billed_quantity, etc.
 */
export function lineItemQuantity(row: unknown): number {
  if (!row || typeof row !== 'object') return 0
  const r = row as Record<string, unknown>
  const keys = ['quantity', 'billed_quantity', 'quantity_ordered'] as const
  for (const k of keys) {
    const n = Number(r[k])
    if (!Number.isNaN(n) && n !== 0) return n
  }
  for (const k of keys) {
    const n = Number(r[k])
    if (!Number.isNaN(n)) return n
  }
  return 0
}

/** Sum quantities for list cards; falls back to row count when qty is missing (legacy rows). */
export function sumInvoiceLineItemQuantities(lineItemsJson: unknown): number {
  const rows = parseJsonbLineItems(lineItemsJson)
  if (rows.length === 0) return 0
  const qtySum: number = rows.reduce((s: number, row) => s + lineItemQuantity(row), 0)
  return qtySum > 0 ? qtySum : rows.length
}

export interface ItemThumb {
  image_urls: string[] | null
  category_icon_urls: string[] | null
}

type RawInvoiceLineItem = {
  zoho_item_id?: string
  item_id?: string
  line_item_id?: string
  item_name?: string
  name?: string
  description?: string
  sku?: string
  quantity?: number | string
  billed_quantity?: number | string
  rate?: number | string
  tax_percentage?: number | string
  line_total?: number
  item_total?: number | string
}

/**
 * Map stored or Zoho-fetched invoice line rows to catalog line details.
 */
export function mapRawInvoiceLinesToDetails(
  raw: unknown[],
  imageMap: Map<string, ItemThumb>
): LineItemDetail[] {
  return raw.map((row) => {
    const li = row as RawInvoiceLineItem
    const resolvedId = String(li.zoho_item_id || li.item_id || li.line_item_id || '')
    const qty = lineItemQuantity(row)
    const rawRate = Number(li.rate)
    const rate = Number.isFinite(rawRate) ? rawRate : 0
    const lineTotalRaw = li.line_total ?? li.item_total
    const lineTotalNum = Number(lineTotalRaw)
    const lineTotal = Number.isFinite(lineTotalNum) ? lineTotalNum : 0
    const derivedRate = rate > 0 ? rate : qty > 0 ? lineTotal / qty : 0
    const thumb = resolvedId ? imageMap.get(resolvedId) : undefined
    const image_urls = thumb?.image_urls ?? null
    const category_icon_urls = thumb?.category_icon_urls ?? null
    const image_url =
      pickProductImageVariant(image_urls, category_icon_urls, PRODUCT_IMAGE_W400) ?? null
    return {
      zoho_item_id: resolvedId,
      item_name: String(li.item_name || li.name || li.description || 'Item'),
      sku: String(li.sku ?? ''),
      quantity: qty,
      rate: derivedRate,
      tax_percentage: Number(li.tax_percentage) || 0,
      line_total: lineTotal > 0 ? lineTotal : qty * derivedRate,
      image_urls,
      category_icon_urls,
      image_url,
      category_icon_url:
        pickProductImageVariant(null, category_icon_urls, PRODUCT_IMAGE_W400) ?? null,
    }
  })
}
