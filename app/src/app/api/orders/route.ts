import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// PHASE2_SO_ARCHIVE: import { createHash } from 'crypto'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
// PHASE2_SO_ARCHIVE: import { createSalesOrder, markEstimateAccepted } from '@/lib/zoho'
// PHASE2_SO_ARCHIVE: import { sendOrderConfirmation, sendAdminAlert } from '@/lib/whatsapp'
// PHASE2_SO_ARCHIVE: import type { OrderRequest } from '@/types/catalog'
import type { CartItem } from '@/types/catalog'

/* PHASE2_SO_ARCHIVE_START
function buildCartHash(items: CartItem[]): string {
  const sorted = [...items].sort((a, b) => a.zoho_item_id.localeCompare(b.zoho_item_id))
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

async function withOneRetry<T>(fn: () => Promise<T>, delayMs = 2000): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((r) => setTimeout(r, delayMs))
    return fn()
  }
}
PHASE2_SO_ARCHIVE_END */

// ── POST /api/orders — Sales order creation disabled (Phase 1) ────────────────

export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: 'Sales order creation is not available' }, { status: 405 })
}

/* PHASE2_SO_ARCHIVE_START
export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  let body: OrderRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  const subtotal = body.items.reduce((sum, item) => sum + item.line_total, 0)
  const tax = Math.round(subtotal * 0.18 * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100
  const cartHash = buildCartHash(body.items)

  const supabase = createServiceClient()

  // ── Duplicate order detection: same cart within last 1 hour ───────────────
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('sales_orders')
    .select('id, public_id, salesorder_number, zoho_sync_status')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .eq('cart_hash', cartHash)
    .neq('zoho_sync_status', 'failed')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      salesorder_number: existing.salesorder_number,
      order_id: existing.public_id,
      whatsapp_sent: false,
      sync_pending: existing.zoho_sync_status === 'pending_zoho_sync',
    })
  }

  // ── Resolve originating estimate (if converting from a quote) ─────────────
  let estimateRow: {
    id: number
    estimate_number: string
    zoho_estimate_id: string | null
  } | null = null

  if (body.estimate_id) {
    const { data } = await supabase
      .from('estimates')
      .select('id, estimate_number, zoho_estimate_id')
      .eq('public_id', body.estimate_id)
      .eq('zoho_contact_id', session.zoho_contact_id)
      .maybeSingle()
    estimateRow = data
  }

  // ── Create sales order in Zoho Books first (Zoho owns the number) ────────
  let zohoSalesorderId: string
  let zohoSalesorderNumber: string

  try {
    const zohoRes = await withOneRetry(() =>
      createSalesOrder(session.zoho_contact_id, body.items, {
        pricebookId: session.pricebook_id,
        estimateNumber: estimateRow?.estimate_number,
        notes: body.notes,
      })
    )
    zohoSalesorderId = zohoRes.salesorder.salesorder_id
    zohoSalesorderNumber = zohoRes.salesorder.salesorder_number
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[orders] Zoho SO creation failed:', msg)
    void sendAdminAlert(
      `⚠️ Zoho sales order creation failed\n` +
      `Contact: ${session.contact_name} (${session.phone})\n` +
      `Error: ${msg}`
    )
    return NextResponse.json({ error: 'Failed to place order. Please try again.' }, { status: 502 })
  }

  // ── Persist to Supabase with Zoho's canonical number and ID ──────────────
  const { data: order, error: insertError } = await supabase
    .from('sales_orders')
    .insert({
      zoho_contact_id: session.zoho_contact_id,
      contact_phone: session.phone,
      salesorder_number: zohoSalesorderNumber,
      zoho_salesorder_id: zohoSalesorderId,
      status: 'confirmed',
      zoho_sync_status: 'sent',
      zoho_sync_attempts: 1,
      cart_hash: cartHash,
      line_items: body.items,
      subtotal,
      tax_total: tax,
      total,
      notes: body.notes ?? null,
      converted_from_estimate_id: estimateRow?.id ?? null,
    })
    .select('id, public_id')
    .single()

  if (insertError || !order) {
    console.error('[orders] sales_order insert error:', insertError)
    void sendAdminAlert(
      `⚠️ Zoho SO ${zohoSalesorderNumber} created but Supabase insert failed\n` +
      `Contact: ${session.contact_name} (${session.phone})\n` +
      `Zoho ID: ${zohoSalesorderId}`
    )
    return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
  }

  // ── Mark originating estimate as accepted (best-effort, non-blocking) ─────
  if (estimateRow?.zoho_estimate_id) {
    markEstimateAccepted(estimateRow.zoho_estimate_id).catch((err) =>
      console.warn('[orders] markEstimateAccepted failed (non-fatal):', err)
    )
    supabase
      .from('estimates')
      .update({ status: 'accepted', zoho_sync_status: 'sent' })
      .eq('id', estimateRow.id)
      .then(() => {})
  }

  // ── Send WhatsApp order confirmation ──────────────────────────────────────
  const waResult = await sendOrderConfirmation(
    session.phone,
    {
      customerName: session.contact_name,
      companyName: session.contact_name,
      salesorderNumber: zohoSalesorderNumber,
      items: body.items,
      totals: { subtotal, tax, total },
    },
  )

  if (waResult.success) {
    await supabase
      .from('sales_orders')
      .update({
        app_whatsapp_sent: true,
        app_whatsapp_message_id: waResult.messageId ?? null,
      })
      .eq('id', order.id)
  } else {
    console.error('[orders] WhatsApp order confirmation failed:', waResult.error)
  }

  return NextResponse.json({
    success: true,
    salesorder_number: zohoSalesorderNumber,
    order_id: order.public_id as string,
    whatsapp_sent: waResult.success,
  })
}
PHASE2_SO_ARCHIVE_END */

// ── GET /api/orders — Unified paginated transaction list ─────────────────────

const LIST_LIMIT = 20

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

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const supabase = createServiceClient()

  // Fetch all invoices for this contact (no pagination — merge happens in memory)
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('zoho_invoice_id, invoice_number, date, total, line_items, estimate_number')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('date', { ascending: false })

  if (invErr) {
    console.error('[orders] invoice fetch error:', invErr)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Fetch all sales orders with their linked estimate number
  const { data: orders, error: ordErr } = await supabase
    .from('sales_orders')
    .select(`
      public_id,
      salesorder_number,
      date,
      created_at,
      total,
      line_items,
      converted_from_estimate_id,
      estimates!converted_from_estimate_id ( estimate_number )
    `)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('created_at', { ascending: false })

  if (ordErr) {
    console.error('[orders] orders fetch error:', ordErr)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Build set of estimate_numbers that are covered by an invoice.
  // Only add non-empty estimate_number values so null/empty rows don't suppress orders.
  const coveredByInvoice = new Set<string>()
  for (const inv of invoices ?? []) {
    if (inv.estimate_number && inv.estimate_number.trim() !== '') {
      coveredByInvoice.add(inv.estimate_number)
    }
  }

  type TxRow = {
    kind: 'invoice' | 'order'
    id: string
    doc_number: string
    date: string
    total: number
    item_count: number
    status_label: 'Invoiced' | 'Ordered'
  }

  const unified: TxRow[] = []

  for (const inv of invoices ?? []) {
    const items = Array.isArray(inv.line_items) ? inv.line_items as CartItem[] : []
    unified.push({
      kind: 'invoice',
      id: inv.zoho_invoice_id,
      doc_number: inv.invoice_number,
      date: inv.date ?? '',
      total: inv.total,
      item_count: items.reduce((s, i) => s + i.quantity, 0),
      status_label: 'Invoiced',
    })
  }

  for (const ord of orders ?? []) {
    const rawEst = ord.estimates as unknown
    const estimateNumber =
      (Array.isArray(rawEst) ? rawEst[0] : rawEst)?.estimate_number ?? null
    // Skip order if a non-empty invoice already covers it via the estimate chain
    if (estimateNumber && coveredByInvoice.has(estimateNumber)) continue

    const items = Array.isArray(ord.line_items) ? ord.line_items as CartItem[] : []
    unified.push({
      kind: 'order',
      id: ord.public_id as string,
      doc_number: ord.salesorder_number,
      date: ord.date ?? (ord.created_at ? ord.created_at.slice(0, 10) : ''),
      total: ord.total,
      item_count: items.reduce((s, i) => s + i.quantity, 0),
      status_label: 'Ordered',
    })
  }

  // Sort unified list by date descending
  unified.sort((a, b) => b.date.localeCompare(a.date))

  const page = unified.slice(offset, offset + LIST_LIMIT)
  const has_more = offset + LIST_LIMIT < unified.length

  return NextResponse.json({
    items: page,
    has_more,
    next_offset: offset + LIST_LIMIT,
  })
}
