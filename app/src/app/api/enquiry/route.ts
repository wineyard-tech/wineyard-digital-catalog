import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { createEstimate } from '@/lib/zoho'
import { sendEstimateNotification, sendAdminAlert } from '@/lib/whatsapp'
import { getNearestLocation } from '@/lib/routing'
import type { EnquiryRequest, CartItem } from '@/types/catalog'
import type { GeocodedLocation } from '@/lib/routing'

/** SHA-256 of the sorted+serialised line_items — used for duplicate detection. */
function buildCartHash(items: CartItem[]): string {
  const sorted = [...items].sort((a, b) => a.zoho_item_id.localeCompare(b.zoho_item_id))
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

/** Retries `fn` once after `delayMs` if it throws. */
async function withOneRetry<T>(fn: () => Promise<T>, delayMs = 2000): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((r) => setTimeout(r, delayMs))
    return fn()
  }
}

export async function POST(request: NextRequest) {
  // ── Auth — guests cannot enquire ─────────────────────────────────────────
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required to submit enquiries' }, { status: 403 })
    }
    throw err
  }

  // ── Parse + validate request body ────────────────────────────────────────
  let body: EnquiryRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // ── Compute totals + cart hash ────────────────────────────────────────────
  const subtotal = body.items.reduce((sum: number, item: CartItem) => sum + item.line_total, 0)
  const tax = Math.round(subtotal * 0.18 * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100
  const cartHash = buildCartHash(body.items)

  const supabase = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // ── Update existing estimate (cart opened from WhatsApp deep link) ─────────
  if (body.estimate_id) {
    const { data: est } = await supabase
      .from('estimates')
      .select('id, public_id, estimate_number, zoho_sync_status')
      .eq('public_id', body.estimate_id)
      .eq('zoho_contact_id', session.zoho_contact_id)
      .maybeSingle()

    if (est) {
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('estimates')
        .update({
          line_items: body.items,
          cart_hash: cartHash,
          subtotal,
          tax_total: tax,
          total,
          expires_at: newExpiry,
          app_whatsapp_sent: false, // re-send below
        })
        .eq('id', est.id)

      const deepLinkPath = `cart?estimate_id=${est.public_id}`
      const waResult = await sendEstimateNotification(
        session.phone,
        {
          customerName: session.contact_name,
          companyName: '',
          estimateNumber: est.estimate_number,
          items: body.items,
          totals: { subtotal, tax, total },
        },
        deepLinkPath,
      )
      if (waResult.success) {
        await supabase
          .from('estimates')
          .update({ app_whatsapp_sent: true, app_whatsapp_message_id: waResult.messageId ?? null })
          .eq('id', est.id)
      }

      return NextResponse.json({
        success: true,
        estimate_number: est.estimate_number,
        estimate_id: est.public_id,
        whatsapp_sent: waResult.success,
      })
    }
    // estimate_id not found or belongs to another contact — fall through to create new
  }

  // ── Duplicate detection: same cart within last 24 hours ───────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('estimates')
    .select('id, public_id, estimate_number, zoho_sync_status, app_whatsapp_sent, line_items')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .eq('cart_hash', cartHash)
    .neq('zoho_sync_status', 'failed')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Re-send WhatsApp if not already sent for this estimate
    let whatsappSent = existing.app_whatsapp_sent
    if (!whatsappSent) {
      const deepLinkPath = `cart?estimate_id=${existing.public_id}`
      const waResult = await sendEstimateNotification(
        session.phone,
        {
          customerName: session.contact_name,
          companyName: session.contact_name,
          estimateNumber: existing.estimate_number,
          items: existing.line_items as CartItem[],
          totals: { subtotal, tax, total },
        },
        deepLinkPath
      )
      if (waResult.success) {
        await supabase
          .from('estimates')
          .update({ app_whatsapp_sent: true, app_whatsapp_message_id: waResult.messageId ?? null })
          .eq('id', existing.id)
        whatsappSent = true
      }
    }

    return NextResponse.json({
      success: true,
      estimate_number: existing.estimate_number,
      estimate_id: existing.public_id,
      whatsapp_sent: whatsappSent,
      sync_pending: existing.zoho_sync_status === 'pending_zoho_sync',
    })
  }

  // ── Nearest-warehouse routing (server-side Haversine) ─────────────────────
  // Coords are supplied by the client from the `wl` cookie — never exposed to
  // other clients. Warehouses without geocoords are excluded automatically.
  let nearestLocationId: string | null = null
  let nearestLocationName: string | null = null
  if (body.user_lat != null && body.user_lng != null &&
      isFinite(body.user_lat) && isFinite(body.user_lng)) {
    const { data: locs } = await supabase
      .from('locations')
      .select('zoho_location_id, location_name, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('status', 'active')

    if (locs && locs.length > 0) {
      const geocoded: GeocodedLocation[] = (locs as Array<{
        zoho_location_id: string
        location_name: string
        latitude: number
        longitude: number
      }>).map(l => ({
        zoho_location_id: l.zoho_location_id,
        latitude: l.latitude,
        longitude: l.longitude,
      }))
      nearestLocationId = getNearestLocation(body.user_lat, body.user_lng, geocoded)
      nearestLocationName = locs.find(l => l.zoho_location_id === nearestLocationId)?.location_name ?? null
    }
  }

  // ── Create estimate in Zoho Books first (Zoho owns the number) ───────────
  let zohoEstimateId: string
  let zohoEstimateNumber: string

  try {
    const zohoRes = await withOneRetry(() =>
      createEstimate(session.zoho_contact_id, body.items, {
        notes: body.notes,
        locationId: nearestLocationId,
      })
    )
    zohoEstimateId = zohoRes.estimate.estimate_id
    zohoEstimateNumber = zohoRes.estimate.estimate_number
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[enquiry] Zoho estimate creation failed:', msg)
    void sendAdminAlert(
      `⚠️ Zoho estimate creation failed\n` +
      `Contact: ${session.contact_name} (${session.phone})\n` +
      `Error: ${msg}`
    )
    return NextResponse.json({ error: 'Failed to create estimate. Please try again.' }, { status: 502 })
  }

  // ── Persist to Supabase with Zoho's canonical number and ID ──────────────
  const { data: estimate, error: insertError } = await supabase
    .from('estimates')
    .insert({
      zoho_contact_id: session.zoho_contact_id,
      contact_phone: session.phone,
      estimate_number: zohoEstimateNumber,
      zoho_estimate_id: zohoEstimateId,
      status: 'sent',
      zoho_sync_status: 'sent',
      zoho_sync_attempts: 1,
      cart_hash: cartHash,
      line_items: body.items,
      subtotal,
      tax_total: tax,
      total,
      notes: body.notes ?? null,
    })
    .select('id, public_id')
    .single()

  if (insertError || !estimate) {
    console.error('[enquiry] estimate insert error:', insertError)
    // Estimate exists in Zoho — alert admin so it can be reconciled
    void sendAdminAlert(
      `⚠️ Zoho estimate ${zohoEstimateNumber} created but Supabase insert failed\n` +
      `Contact: ${session.contact_name} (${session.phone})\n` +
      `Zoho ID: ${zohoEstimateId}`
    )
    return NextResponse.json({ error: 'Failed to save estimate' }, { status: 500 })
  }

  // ── Send WhatsApp notification ─────────────────────────────────────────────
  const deepLinkPath = `cart?estimate_id=${estimate.public_id}`
  const waResult = await sendEstimateNotification(
    session.phone,
    {
      customerName: session.contact_name,
      companyName: '',
      estimateNumber: zohoEstimateNumber,
      items: body.items,
      totals: { subtotal, tax, total },
    },
    deepLinkPath
  )

  if (waResult.success) {
    await supabase
      .from('estimates')
      .update({
        app_whatsapp_sent: true,
        app_whatsapp_message_id: waResult.messageId ?? null,
        whatsapp_sent: true,
        whatsapp_sent_at: new Date().toISOString(),
      })
      .eq('id', estimate.id)
  } else {
    console.error('[enquiry] WhatsApp send failed:', waResult.error)
  }

  // ── Admin alert — best-effort, never blocks response ─────────────────────
  const warehouseLabel = nearestLocationName
    ? `Warehouse: ${nearestLocationName} (${nearestLocationId})`
    : 'Warehouse: unknown (no coords)'
  void sendAdminAlert(
    `📋 New estimate: ${zohoEstimateNumber}\n` +
    `Contact: ${session.contact_name} (${session.phone})\n` +
    `${warehouseLabel}\n` +
    `Total: ₹${Math.round(total).toLocaleString('en-IN')}`
  )

  return NextResponse.json({
    success: true,
    estimate_number: zohoEstimateNumber,
    estimate_id: estimate.public_id as string,
    whatsapp_sent: waResult.success,
  })
}
