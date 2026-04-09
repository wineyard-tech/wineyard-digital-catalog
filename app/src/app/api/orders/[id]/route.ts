import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchCategoryIconMap } from '@/lib/pricing'
import { normalizeItemImageUrls } from '@/lib/catalog/product-image-urls'
import { getZohoInvoiceLineItems } from '@/lib/zoho'
import {
  mapRawInvoiceLinesToDetails,
  parseJsonbLineItems,
  type ItemThumb,
} from '@/lib/catalog/invoice-line-items'
import type { TransactionDetail } from '@/types/catalog'

// ── GET /api/orders/[id] — Transaction detail (invoice or sales order) ────────
// Query param: ?kind=invoice|order (defaults to 'order')

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
  const { searchParams } = new URL(request.url)
  const kind = searchParams.get('kind') === 'invoice' ? 'invoice' : 'order'

  const supabase = createServiceClient()

  if (kind === 'invoice') {
    const { data, error } = await supabase
      .from('invoices')
      .select('zoho_invoice_id, invoice_number, date, total, subtotal, tax_total, line_items')
      .eq('zoho_invoice_id', id)
      .eq('zoho_contact_id', session.zoho_contact_id)
      .maybeSingle()

    if (error) {
      console.error('[orders/id] invoice fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    let storedLineItems = parseJsonbLineItems(data.line_items)

    // line_items is empty when the row was synced from Zoho's list endpoint (which omits them).
    // Fetch the full detail from Zoho and write back to DB non-blocking so future loads are fast.
    if (storedLineItems.length === 0) {
      console.info('[orders/id] GET invoice hydrate from Zoho', {
        zoho_invoice_id: data.zoho_invoice_id,
      })
      const zohoItems = await getZohoInvoiceLineItems(data.zoho_invoice_id)
      if (zohoItems && zohoItems.length > 0) {
        storedLineItems = zohoItems
        after(async () => {
          const sb = createServiceClient()
          await sb.from('invoices').update({ line_items: zohoItems }).eq('zoho_invoice_id', data.zoho_invoice_id)
        })
      }
    }

    const zohoItemIds = storedLineItems
      .map((li) => {
        if (!li || typeof li !== 'object') return ''
        const r = li as { zoho_item_id?: string; item_id?: string }
        return r.zoho_item_id || r.item_id || ''
      })
      .filter(Boolean) as string[]

    const imageMap = new Map<string, ItemThumb>()
    if (zohoItemIds.length > 0) {
      const categoryIconMap = await fetchCategoryIconMap(supabase)
      const { data: itemRows } = await supabase
        .from('items')
        .select('zoho_item_id, image_urls, category_name')
        .in('zoho_item_id', zohoItemIds)
      for (const row of itemRows ?? []) {
        const image_urls = normalizeItemImageUrls(row.image_urls)
        const cn = (row.category_name as string | null) ?? null
        const category_icon_urls = cn ? categoryIconMap[cn] ?? null : null
        imageMap.set(row.zoho_item_id, { image_urls, category_icon_urls })
      }
    }

    const lineItems = mapRawInvoiceLinesToDetails(storedLineItems, imageMap)

    // Derive subtotal/tax_total from line_items when DB columns are 0 (Zoho list-synced rows)
    const computedSubtotal = lineItems.reduce((s, li) => s + li.line_total, 0)
    const subtotal = Number(data.subtotal) || computedSubtotal
    const taxTotal = Number(data.tax_total) || Math.round(subtotal * 0.18)

    const detail: TransactionDetail = {
      kind: 'invoice',
      id: data.zoho_invoice_id,
      doc_number: data.invoice_number,
      date: data.date ?? '',
      total: Number(data.total) || (subtotal),
      subtotal,
      tax_total: taxTotal,
      line_items: lineItems,
    }
    return NextResponse.json(detail)
  }

  /* PHASE2_SO_ARCHIVE_START
  // kind === 'order'
  const { data, error } = await supabase
    .from('sales_orders')
    .select('public_id, salesorder_number, date, created_at, total, subtotal, tax_total, line_items')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) {
    console.error('[orders/id] order fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const lineItems = Array.isArray(data.line_items)
    ? (data.line_items as LineItemDetail[])
    : []

  const detail: TransactionDetail = {
    kind: 'order',
    id: data.public_id as string,
    doc_number: data.salesorder_number,
    date: data.date ?? (data.created_at ? data.created_at.slice(0, 10) : ''),
    total: data.total,
    subtotal: data.subtotal ?? 0,
    tax_total: data.tax_total ?? 0,
    line_items: lineItems,
  }
  return NextResponse.json(detail)
  PHASE2_SO_ARCHIVE_END */

  // SO detail routes are not active in Phase 1
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
