import type { CartItem } from '@/types/catalog'
import { createServiceClient } from '@/lib/supabase/server'
import { resolvePricebookRatesForItemIds } from '@/lib/pricing'

type ServiceClient = ReturnType<typeof createServiceClient>

const MAX_LINE_QTY = 99_999
const TAX_RATE = 0.18

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type EnquiryPricingErrorCode = 'empty' | 'invalid_item' | 'inactive_item' | 'bad_quantity'

/**
 * Rebuilds cart line items from DB + pricebook. Ignores client-supplied rate/line_total.
 * Call after requireSession so zoho_contact_id is trusted.
 */
export async function buildServerEnquiryLineItems(
  supabase: ServiceClient,
  zohoContactId: string,
  clientItems: CartItem[]
): Promise<
  | { ok: true; items: CartItem[]; subtotal: number; tax: number }
  | { ok: false; error: EnquiryPricingErrorCode; message: string }
> {
  if (!clientItems.length) {
    return { ok: false, error: 'empty', message: 'Cart is empty' }
  }

  const ids = [...new Set(clientItems.map((i) => i.zoho_item_id).filter(Boolean))]
  if (ids.length !== clientItems.length) {
    return { ok: false, error: 'invalid_item', message: 'Invalid cart items' }
  }

  const { data: rows, error } = await supabase
    .from('items')
    .select('zoho_item_id, item_name, sku, base_rate, status')
    .in('zoho_item_id', ids)
    .eq('status', 'active')

  if (error || !rows?.length) {
    return { ok: false, error: 'inactive_item', message: 'One or more items are unavailable' }
  }

  const rowMap = new Map(
    (rows as { zoho_item_id: string; item_name: string; sku: string; base_rate: number | string }[]).map((r) => [
      r.zoho_item_id,
      r,
    ])
  )

  if (rowMap.size !== ids.length) {
    return { ok: false, error: 'inactive_item', message: 'One or more items are unavailable' }
  }

  const pricebookRates = await resolvePricebookRatesForItemIds(supabase, zohoContactId, ids)
  const out: CartItem[] = []
  let subtotal = 0

  for (const line of clientItems) {
    const row = rowMap.get(line.zoho_item_id)
    if (!row) {
      return { ok: false, error: 'inactive_item', message: 'One or more items are unavailable' }
    }

    const qty = Number(line.quantity)
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_LINE_QTY || !Number.isInteger(qty)) {
      return { ok: false, error: 'bad_quantity', message: 'Invalid quantity for one or more items' }
    }

    const baseRate = Number(row.base_rate ?? 0)
    const custom = pricebookRates[line.zoho_item_id]
    const rate = roundMoney(custom ?? baseRate)
    const lineTotal = roundMoney(rate * qty)
    subtotal += lineTotal

    out.push({
      zoho_item_id: line.zoho_item_id,
      item_name: row.item_name,
      sku: row.sku ?? '',
      quantity: qty,
      rate,
      tax_percentage: 18,
      line_total: lineTotal,
      image_url: line.image_url ?? null,
    })
  }

  const tax = roundMoney(subtotal * TAX_RATE)
  subtotal = roundMoney(subtotal)

  return { ok: true, items: out, subtotal, tax }
}
