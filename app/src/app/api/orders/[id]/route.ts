import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
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

    const lineItems = Array.isArray(data.line_items)
      ? (data.line_items as LineItemDetail[])
      : []

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
