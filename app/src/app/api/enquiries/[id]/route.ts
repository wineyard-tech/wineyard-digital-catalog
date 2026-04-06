import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getZohoEstimateLineItems } from '@/lib/zoho'
import type { EnquiryDetail, EnquiryLineItemDetail } from '@/types/catalog'

// ── GET /api/enquiries/[id] — Estimate detail with live stock availability ────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data: estimate, error } = await supabase
    .from('estimates')
    .select('public_id, estimate_number, date, created_at, total, subtotal, tax_total, line_items, status, estimate_url, zoho_estimate_id')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) {
    console.error('[enquiries/id] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch enquiry' }, { status: 500 })
  }
  if (!estimate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Webhook-synced line items use Zoho's field names (item_id, name, item_total).
  // App-created line items use our canonical names (zoho_item_id, item_name, line_total).
  // quantity/rate may be '' (empty string) from Zoho — coerce with Number().
  type RawLineItem = { zoho_item_id?: string; item_id?: string; item_name?: string; name?: string; sku?: string; quantity?: number | ''; rate?: number | ''; tax_percentage?: number | ''; line_total?: number; item_total?: number | '' }

  let storedLineItems = Array.isArray(estimate.line_items) ? estimate.line_items : []

  // line_items is empty when the row was synced from Zoho's list endpoint (which omits them).
  // Fetch the full detail from Zoho and write back to DB non-blocking so future loads are fast.
  const zohoEstimateId = (estimate as unknown as { zoho_estimate_id?: string | null }).zoho_estimate_id
  if (storedLineItems.length === 0 && zohoEstimateId) {
    const zohoItems = await getZohoEstimateLineItems(zohoEstimateId)
    if (zohoItems && zohoItems.length > 0) {
      storedLineItems = zohoItems
      after(async () => {
        const sb = createServiceClient()
        await sb.from('estimates').update({ line_items: zohoItems }).eq('public_id', id)
      })
    }
  }

  const rawLineItems = storedLineItems as RawLineItem[]

  // Enrich line items with live stock data from items table
  const zohoItemIds = rawLineItems.map((li) => li.zoho_item_id || li.item_id).filter(Boolean) as string[]

  let stockMap = new Map<string, { available_stock: number | null; image_url: string | null; item_name: string | null; sku: string | null }>()

  if (zohoItemIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('items')
      .select('zoho_item_id, available_stock, image_urls, item_name, sku')
      .in('zoho_item_id', zohoItemIds)

    for (const row of itemRows ?? []) {
      const imageUrl = Array.isArray(row.image_urls) && row.image_urls.length > 0
        ? (row.image_urls[0] as string)
        : null
      stockMap.set(row.zoho_item_id, {
        available_stock: row.available_stock ?? null,
        image_url: imageUrl,
        item_name: row.item_name ?? null,
        sku: row.sku ?? null,
      })
    }
  }

  const lineItems: EnquiryLineItemDetail[] = rawLineItems.map((li) => {
    const resolvedId = li.zoho_item_id || li.item_id || ''
    const stock = stockMap.get(resolvedId)
    const available_stock = stock?.available_stock ?? null

    let stock_status: EnquiryLineItemDetail['stock_status'] = 'unknown'
    if (available_stock !== null) {
      if (available_stock <= 0) stock_status = 'out_of_stock'
      else if (available_stock < 10) stock_status = 'limited'
      else stock_status = 'available'
    }

    const qty = Number(li.quantity) || 0
    const rawRate = Number(li.rate) || 0
    const lineTotal = Number(li.line_total ?? li.item_total) || 0
    // Derive rate from line_total when Zoho stores rate as '' (empty string)
    const rate = rawRate || (qty > 0 ? lineTotal / qty : 0)
    return {
      zoho_item_id: resolvedId,
      // Zoho webhook payloads use 'name' not 'item_name'; fall back to items table as authoritative source
      item_name: li.item_name || li.name || stock?.item_name || '',
      sku: li.sku || stock?.sku || '',
      quantity: qty,
      rate,
      tax_percentage: Number(li.tax_percentage) || 0,
      line_total: lineTotal || (qty * rate),
      image_url: stock?.image_url ?? null,
      available_stock,
      stock_status,
    }
  })

  // Derive subtotal from line_items when DB column is 0 (Zoho list-synced or old records)
  const computedSubtotal = lineItems.reduce((s, li) => s + li.line_total, 0)
  const subtotalNum = Number(estimate.subtotal ?? 0) || computedSubtotal
  // Derive tax_total from subtotal for old records where it was stored as 0.
  // All new estimates have tax_total = round(subtotal × 0.18) written at creation time.
  const storedTaxTotal = Number(estimate.tax_total ?? 0)
  const taxTotal = storedTaxTotal > 0 ? storedTaxTotal : Math.round(subtotalNum * 0.18)

  const detail: EnquiryDetail = {
    id: estimate.public_id as string,
    doc_number: estimate.estimate_number,
    date: estimate.date ?? estimate.created_at?.slice(0, 10) ?? '',
    // PostgREST returns DECIMAL columns as strings — coerce to number for fmt()
    total: subtotalNum,   // Total = Subtotal; tax is decorative, not added to total
    subtotal: subtotalNum,
    tax_total: taxTotal,
    status: estimate.status as string,
    estimate_id: estimate.public_id as string,
    estimate_url: (estimate as unknown as { estimate_url?: string | null }).estimate_url ?? null,
    line_items: lineItems,
  }

  return NextResponse.json(detail)
}
