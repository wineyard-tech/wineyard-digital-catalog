import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { createSalesOrder, markEstimateAccepted } from '@/lib/zoho'
import { sendOrderConfirmation, sendAdminAlert } from '@/lib/whatsapp'
import type { OrderRequest, CartItem } from '@/types/catalog'

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

// ── POST /api/orders — Place a new sales order ────────────────────────────────

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

  // ── Insert sales order in Supabase first (Zoho sync comes after) ──────────
  const { data: order, error: insertError } = await supabase
    .from('sales_orders')
    .insert({
      zoho_contact_id: session.zoho_contact_id,
      contact_phone: session.phone,
      status: 'draft',
      zoho_sync_status: 'pending_zoho_sync',
      cart_hash: cartHash,
      line_items: body.items,
      subtotal,
      tax_total: tax,
      total,
      notes: body.notes ?? null,
      converted_from_estimate_id: estimateRow?.id ?? null,
    })
    .select('id, public_id, salesorder_number')
    .single()

  if (insertError || !order) {
    console.error('[orders] sales_order insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }

  // ── Create sales order in Zoho Books (1 retry) ────────────────────────────
  let zohoSyncStatus: 'sent' | 'pending_zoho_sync' = 'pending_zoho_sync'
  let zohoSyncError: string | null = null

  try {
    const zohoRes = await withOneRetry(() =>
      createSalesOrder(session.zoho_contact_id, body.items, {
        estimateNumber: estimateRow?.estimate_number,
        notes: body.notes,
      })
    )

    await supabase
      .from('sales_orders')
      .update({
        zoho_salesorder_id: zohoRes.salesorder?.salesorder_id ?? null,
        status: 'confirmed',
        zoho_sync_status: 'sent',
        zoho_sync_attempts: 1,
      })
      .eq('id', order.id)

    zohoSyncStatus = 'sent'

    // Mark originating estimate as accepted in Zoho (best-effort, non-blocking)
    if (estimateRow?.zoho_estimate_id) {
      markEstimateAccepted(estimateRow.zoho_estimate_id).catch((err) =>
        console.warn('[orders] markEstimateAccepted failed (non-fatal):', err)
      )
      // Update estimate status in Supabase
      supabase
        .from('estimates')
        .update({ status: 'accepted', zoho_sync_status: 'sent' })
        .eq('id', estimateRow.id)
        .then(() => {})
    }
  } catch (err) {
    zohoSyncError = err instanceof Error ? err.message : String(err)
    console.error('[orders] Zoho SO creation failed after retry:', zohoSyncError)

    await supabase
      .from('sales_orders')
      .update({ zoho_sync_attempts: 1, zoho_sync_error: zohoSyncError })
      .eq('id', order.id)

    void sendAdminAlert(
      `⚠️ Zoho SO sync failed for order ${order.salesorder_number}\n` +
      `Contact: ${session.contact_name} (${session.phone})\n` +
      `Error: ${zohoSyncError}\n` +
      `Order ID: ${order.public_id}`
    )
  }

  // ── Send WhatsApp order confirmation (always) ─────────────────────────────
  const waResult = await sendOrderConfirmation(
    session.phone,
    {
      customerName: session.contact_name,
      companyName: session.contact_name,
      salesorderNumber: order.salesorder_number,
      items: body.items,
      totals: { subtotal, tax, total },
    },
    'catalog/orders'
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
    salesorder_number: order.salesorder_number,
    order_id: order.public_id as string,
    whatsapp_sent: waResult.success,
    ...(zohoSyncStatus === 'pending_zoho_sync' ? { sync_pending: true } : {}),
  })
}

// ── GET /api/orders — Fetch authenticated user's order list ──────────────────

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

  const { data, error } = await supabase
    .from('sales_orders')
    .select(`
      public_id,
      salesorder_number,
      zoho_sync_status,
      status,
      total,
      line_items,
      created_at,
      converted_from_estimate_id,
      estimates!converted_from_estimate_id (estimate_number)
    `)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[orders] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }

  const orders = (data ?? []).map((row) => {
    const items = Array.isArray(row.line_items) ? row.line_items as CartItem[] : []
    const rawEstimate = row.estimates as unknown
    const estimateNumber =
      (Array.isArray(rawEstimate) ? rawEstimate[0] : rawEstimate)?.estimate_number ?? null

    return {
      id: row.public_id,
      salesorder_number: row.salesorder_number,
      zoho_sync_status: row.zoho_sync_status,
      status: row.status,
      total: row.total,
      item_count: items.reduce((sum, i) => sum + i.quantity, 0),
      created_at: row.created_at,
      estimate_number: estimateNumber,
    }
  })

  return NextResponse.json({ orders })
}
