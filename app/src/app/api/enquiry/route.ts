import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { createEstimate, getEstimatePublicUrl, markEstimateSent } from '@/lib/zoho'
import {
  sendEstimateNotification,
  sendAdminAlert,
  sendAdminLocationNotification,
} from '@/lib/whatsapp'
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
  const total = subtotal  // tax is shown separately; total = subtotal (pre-tax)
  const cartHash = buildCartHash(body.items)

  const supabase = createServiceClient()

  // ── Update existing estimate (cart opened from WhatsApp deep link) ─────────
  if (body.estimate_id) {
    const { data: est } = await supabase
      .from('estimates')
      .select('id, public_id, estimate_number, zoho_sync_status, estimate_url, zoho_estimate_id')
      .eq('public_id', body.estimate_id)
      .eq('zoho_contact_id', session.zoho_contact_id)
      .maybeSingle()

    if (est) {
      // ── Compute nearest location if coords provided ────────────────────────
      let updateLocationId: string | null = null
      if (body.user_lat != null && body.user_lng != null &&
          isFinite(body.user_lat) && isFinite(body.user_lng)) {
        const { data: locs } = await supabase
          .from('locations')
          .select('zoho_location_id, latitude, longitude')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .eq('status', 'active')
        if (locs && locs.length > 0) {
          const geocoded: GeocodedLocation[] = (locs as Array<{
            zoho_location_id: string
            latitude: number
            longitude: number
          }>).map(l => ({
            zoho_location_id: l.zoho_location_id,
            latitude: l.latitude,
            longitude: l.longitude,
          }))
          updateLocationId = getNearestLocation(body.user_lat, body.user_lng, geocoded)
        }
      }

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
          ...(updateLocationId ? { location_id: updateLocationId } : {}),
        })
        .eq('id', est.id)

      const estId = est.id
      after(async () => {
        const waResult = await sendEstimateNotification(
          session.phone,
          {
            customerName: session.contact_name,
            estimateNumber: est.estimate_number,
            locationName: null,
            items: body.items,
            totals: { subtotal, tax, total },
            estimateUrl: est.estimate_url ?? null,
            zohoEstimateId: est.zoho_estimate_id ?? '',
          },
        ).catch(err => { console.error('[enquiry] WhatsApp resend failed:', err); return null })
        if (waResult?.success) {
          await supabase
            .from('estimates')
            .update({ app_whatsapp_sent: true, app_whatsapp_message_id: waResult.messageId ?? null })
            .eq('id', estId)
        }
      })

      return NextResponse.json({
        success: true,
        estimate_number: est.estimate_number,
        estimate_id: est.public_id,
        estimate_url: est.estimate_url ?? null,
        whatsapp_sent: false,
      })
    }
    // estimate_id not found or belongs to another contact — fall through to create new
  }

  // ── Duplicate detection: same cart within last 24 hours ───────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('estimates')
    .select('id, public_id, estimate_number, zoho_sync_status, app_whatsapp_sent, line_items, estimate_url, zoho_estimate_id')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .eq('cart_hash', cartHash)
    .neq('zoho_sync_status', 'failed')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Re-send WhatsApp async if not already sent for this estimate
    if (!existing.app_whatsapp_sent) {
      const existingId = existing.id
      after(async () => {
        const waResult = await sendEstimateNotification(
          session.phone,
          {
            customerName: session.contact_name,
            estimateNumber: existing.estimate_number,
            locationName: null,
            items: existing.line_items as CartItem[],
            totals: { subtotal, tax, total },
            estimateUrl: existing.estimate_url ?? null,
            zohoEstimateId: existing.zoho_estimate_id ?? '',
          },
        ).catch(err => { console.error('[enquiry] WhatsApp duplicate resend failed:', err); return null })
        if (waResult?.success) {
          await supabase
            .from('estimates')
            .update({ app_whatsapp_sent: true, app_whatsapp_message_id: waResult.messageId ?? null })
            .eq('id', existingId)
        }
      })
    }

    return NextResponse.json({
      success: true,
      estimate_number: existing.estimate_number,
      estimate_id: existing.public_id,
      estimate_url: existing.estimate_url ?? null,
      whatsapp_sent: false,
      sync_pending: existing.zoho_sync_status === 'pending_zoho_sync',
    })
  }

  // ── Parse wl (user location) cookie ──────────────────────────────────────
  // Used for admin notification's contactLocation field.
  let contactLocation: string | null = null
  try {
    const wlRaw = request.cookies.get('wl')?.value
    if (wlRaw) {
      const wlData = JSON.parse(decodeURIComponent(wlRaw))
      contactLocation = wlData?.area ?? wlData?.city ?? null
    }
  } catch {
    // malformed cookie — proceed without location label
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

  // ── Mark estimate as SENT in Zoho (enables public URL + customer visibility) ─
  // Best-effort: proceed even if this fails — estimate was created in Zoho.
  try {
    await markEstimateSent(zohoEstimateId)
  } catch (err) {
    console.warn('[enquiry] Failed to mark estimate as sent:', err instanceof Error ? err.message : String(err))
  }

  // ── Fetch Zoho public URL (best-effort — null if GET fails) ─────────────
  // estimate_url is only available after marking as sent
  const estimateUrl = await getEstimatePublicUrl(zohoEstimateId)

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
      location_id: nearestLocationId ?? null,
      estimate_url: estimateUrl ?? null,
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

  // ── Fire WhatsApp notifications after response — after() keeps function alive ─
  const estimateId = estimate.id
  after(async () => {
    const waResult = await sendEstimateNotification(
      session.phone,
      {
        customerName: session.contact_name,
        estimateNumber: zohoEstimateNumber,
        locationName: nearestLocationName,
        items: body.items,
        totals: { subtotal, tax, total },
        estimateUrl: estimateUrl ?? null,
        zohoEstimateId: zohoEstimateId,
      },
    ).catch(err => { console.error('[enquiry] WhatsApp customer send error:', err); return null })

    if (waResult?.success) {
      await supabase
        .from('estimates')
        .update({
          app_whatsapp_sent: true,
          app_whatsapp_message_id: waResult.messageId ?? null,
          whatsapp_sent: true,
          whatsapp_sent_at: new Date().toISOString(),
        })
        .eq('id', estimateId)
    } else if (waResult) {
      console.error('[enquiry] WhatsApp customer send failed:', waResult.error)
    }

    await sendAdminLocationNotification({
      locationName: nearestLocationName,
      estimateNumber: zohoEstimateNumber,
      contactName: session.contact_name,
      contactPhone: session.phone,
      contactLocation,
      total,
      itemCount: body.items.length,
      zohoEstimateId,
      estimateUrl: estimateUrl ?? null,
    }).catch(err => console.error('[enquiry] admin notification failed:', err))
  })

  console.log(`[enquiry] done: ${zohoEstimateNumber} (notifications dispatched async)`)
  return NextResponse.json({
    success: true,
    estimate_number: zohoEstimateNumber,
    estimate_id: estimate.public_id as string,
    estimate_url: estimateUrl ?? null,
    whatsapp_sent: false,  // always false at response time — updated async
  })
}
