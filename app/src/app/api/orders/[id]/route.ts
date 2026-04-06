import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getZohoInvoiceLineItems } from '@/lib/zoho'
import type { TransactionDetail, LineItemDetail } from '@/types/catalog'

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

    // Webhook-synced invoices use Zoho's field names (item_id, name, item_total).
    // App-created line items use our canonical names (zoho_item_id, item_name, line_total).
    // Support both by aliasing, then enrich with image_url from the items table.
    type RawInvoiceLineItem = {
      zoho_item_id?: string; item_id?: string
      item_name?: string; name?: string; sku?: string
      quantity?: number | ''; rate?: number | ''
      tax_percentage?: number | ''; line_total?: number; item_total?: number | ''
    }

    let storedLineItems = Array.isArray(data.line_items) ? data.line_items : []

    // line_items is empty when the row was synced from Zoho's list endpoint (which omits them).
    // Fetch the full detail from Zoho and write back to DB non-blocking so future loads are fast.
    if (storedLineItems.length === 0) {
      const zohoItems = await getZohoInvoiceLineItems(data.zoho_invoice_id)
      if (zohoItems && zohoItems.length > 0) {
        storedLineItems = zohoItems
        after(async () => {
          const sb = createServiceClient()
          await sb.from('invoices').update({ line_items: zohoItems }).eq('zoho_invoice_id', data.zoho_invoice_id)
        })
      }
    }

    const rawLineItems = storedLineItems as RawInvoiceLineItem[]

    const zohoItemIds = rawLineItems
      .map((li) => li.zoho_item_id || li.item_id)
      .filter(Boolean) as string[]

    let imageMap = new Map<string, string | null>()
    if (zohoItemIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('items')
        .select('zoho_item_id, image_urls')
        .in('zoho_item_id', zohoItemIds)
      for (const row of itemRows ?? []) {
        const url = Array.isArray(row.image_urls) && row.image_urls.length > 0
          ? (row.image_urls[0] as string)
          : null
        imageMap.set(row.zoho_item_id, url)
      }
    }

    const lineItems: LineItemDetail[] = rawLineItems.map((li) => {
      const resolvedId = li.zoho_item_id || li.item_id || ''
      return {
        zoho_item_id: resolvedId,
        item_name: li.item_name || li.name || '',
        sku: li.sku || '',
        quantity: Number(li.quantity) || 0,
        rate: Number(li.rate) || 0,
        tax_percentage: Number(li.tax_percentage) || 0,
        line_total: Number(li.line_total ?? li.item_total) || 0,
        image_url: imageMap.get(resolvedId) ?? null,
      }
    })

    const detail: TransactionDetail = {
      kind: 'invoice',
      id: data.zoho_invoice_id,
      doc_number: data.invoice_number,
      date: data.date ?? '',
      total: data.total,
      subtotal: data.subtotal ?? 0,
      tax_total: data.tax_total ?? 0,
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
