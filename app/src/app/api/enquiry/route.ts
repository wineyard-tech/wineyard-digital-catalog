import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEstimateNotification } from '@/lib/whatsapp'
import { getNearestLocation } from '@/lib/routing'
import type { EnquiryRequest, CartItem } from '@/types/catalog'
import type { GeocodedLocation } from '@/lib/routing'
import { buildServerEnquiryLineItems } from '@/lib/enquiry-pricing'
import { getPostHogServer } from '@/lib/posthog-node'
import { customerFacingName } from '@/lib/auth/account-display'
import { parseWlFiniteCoord, parseWlWarehouseZohoIdValue } from '@/lib/catalog/read-wl-enquiry-fields'
import { getActiveWlCookieRecord } from '@/lib/catalog/wl-cookie'
import {
  filterLocationsExcludingDormant,
  getDormantZohoLocationIdSet,
} from '@/lib/catalog/dormant-locations'

const ENQUIRY_SUCCESS_MESSAGE =
  'You will receive a WhatsApp confirmation and a call from our team in the next 1 hour.'

/** SHA-256 of the sorted+serialised line_items — used for duplicate detection. */
function buildCartHash(items: CartItem[]): string {
  const sorted = [...items].sort((a, b) => a.zoho_item_id.localeCompare(b.zoho_item_id))
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

type ServiceSupabase = ReturnType<typeof createServiceClient>

interface WarehouseResolution {
  nearestLocationId: string | null
  nearestLocationName: string | null
  nearestLocationPhone: string | null
}

/**
 * Resolves warehouse for Zoho + notifications. Prefers validated `nearest_location_id` from
 * the location selector; falls back to Haversine; optionally default location when org has many warehouses.
 */
async function resolveWarehouseForEnquiry(
  supabase: ServiceSupabase,
  body: Pick<EnquiryRequest, 'nearest_location_id' | 'user_lat' | 'user_lng'>,
  options: { applyDefaultWhenStillNull: boolean }
): Promise<WarehouseResolution> {
  const empty: WarehouseResolution = {
    nearestLocationId: null,
    nearestLocationName: null,
    nearestLocationPhone: null,
  }

  const rawId = parseWlWarehouseZohoIdValue(body.nearest_location_id ?? null) ?? ''
  if (rawId) {
    const dormant = getDormantZohoLocationIdSet()
    const { data: row } = await supabase
      .from('locations')
      .select('zoho_location_id, location_name, phone')
      .eq('zoho_location_id', rawId)
      .eq('status', 'active')
      .maybeSingle()
    if (row && !dormant.has(String(row.zoho_location_id))) {
      return {
        nearestLocationId: row.zoho_location_id,
        nearestLocationName: row.location_name ?? null,
        nearestLocationPhone: row.phone ?? null,
      }
    }
  }

  const userLat = parseWlFiniteCoord(body.user_lat ?? null)
  const userLng = parseWlFiniteCoord(body.user_lng ?? null)
  if (userLat !== null && userLng !== null) {
    const dormant = getDormantZohoLocationIdSet()
    const { data: locsRaw } = await supabase
      .from('locations')
      .select('zoho_location_id, location_name, phone, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('status', 'active')

    const locs = filterLocationsExcludingDormant(locsRaw, dormant)

    if (locs.length > 0) {
      const geocoded: GeocodedLocation[] = (locs as Array<{
        zoho_location_id: string
        latitude: number
        longitude: number
      }>).map((l) => ({
        zoho_location_id: l.zoho_location_id,
        latitude: l.latitude,
        longitude: l.longitude,
      }))
      const nearestId = getNearestLocation(userLat, userLng, geocoded)
      const nearest = locs.find((l) => String(l.zoho_location_id) === String(nearestId))
      if (nearestId && nearest) {
        return {
          nearestLocationId: nearestId,
          nearestLocationName: nearest.location_name ?? null,
          nearestLocationPhone: nearest.phone ?? null,
        }
      }
    }
  }

  if (!options.applyDefaultWhenStillNull) {
    return empty
  }

  const { data: activeLocsRaw } = await supabase
    .from('locations')
    .select('zoho_location_id, location_name, phone')
    .eq('status', 'active')
    .order('location_name', { ascending: true })

  const dormant = getDormantZohoLocationIdSet()
  const activeLocs = filterLocationsExcludingDormant(activeLocsRaw, dormant)

  if (activeLocs.length > 1) {
    const preferred = process.env.ZOHO_DEFAULT_LOCATION_ID?.trim()
    const match = preferred ? activeLocs.find((l) => l.zoho_location_id === preferred) : undefined
    const row = match ?? activeLocs[0]
    return {
      nearestLocationId: row.zoho_location_id,
      nearestLocationName: row.location_name ?? null,
      nearestLocationPhone: row.phone ?? null,
    }
  }

  return empty
}

export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required to submit enquiries' }, { status: 403 })
    }
    throw err
  }

  let body: EnquiryRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const priced = await buildServerEnquiryLineItems(supabase, session.zoho_contact_id, body.items)
  if (!priced.ok) {
    return NextResponse.json({ error: priced.message }, { status: 400 })
  }
  body.items = priced.items
  const subtotal = priced.subtotal
  const tax = priced.tax
  const total = subtotal
  const cartHash = buildCartHash(body.items)

  if (body.estimate_id) {
    const { data: est } = await supabase
      .from('estimates')
      .select('id, public_id, estimate_number, zoho_sync_status, estimate_url, zoho_estimate_id')
      .eq('public_id', body.estimate_id)
      .eq('zoho_contact_id', session.zoho_contact_id)
      .maybeSingle()

    if (est) {
      const resolvedUpdate = await resolveWarehouseForEnquiry(supabase, body, {
        applyDefaultWhenStillNull: false,
      })
      const updateLocationId = resolvedUpdate.nearestLocationId

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
          app_whatsapp_sent: false,
          ...(updateLocationId ? { location_id: updateLocationId } : {}),
        })
        .eq('id', est.id)

      const estId = est.id
      const resendLocationName = resolvedUpdate.nearestLocationName
      const estimateLabel = est.estimate_number ?? 'Your quote'
      after(async () => {
        const waResult = await sendEstimateNotification(
          session.phone,
          {
            customerName: customerFacingName(session),
            estimateNumber: estimateLabel,
            locationName: resendLocationName,
            items: body.items,
            totals: { subtotal, tax, total },
            estimateUrl: est.estimate_url ?? null,
            zohoEstimateId: est.zoho_estimate_id ?? '',
          },
        ).catch((err) => {
          console.error('[enquiry] WhatsApp resend failed:', err)
          return null
        })
        if (waResult?.success) {
          await supabase
            .from('estimates')
            .update({ app_whatsapp_sent: true, app_whatsapp_message_id: waResult.messageId ?? null })
            .eq('id', estId)
        }
      })

      return NextResponse.json({
        success: true,
        estimate_number: est.estimate_number ?? null,
        estimate_id: est.public_id,
        estimate_url: est.estimate_url ?? null,
        whatsapp_sent: false,
        message: ENQUIRY_SUCCESS_MESSAGE,
        zoho_sync_status: est.zoho_sync_status,
        sync_pending: est.zoho_sync_status === 'PENDING',
      })
    }
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('estimates')
    .select('id, public_id, estimate_number, zoho_sync_status, app_whatsapp_sent, line_items, estimate_url, zoho_estimate_id')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .eq('cart_hash', cartHash)
    .neq('zoho_sync_status', 'FAILED')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    if (!existing.app_whatsapp_sent) {
      const existingId = existing.id
      const dupLabel = existing.estimate_number ?? 'Pending'
      after(async () => {
        const waResult = await sendEstimateNotification(
          session.phone,
          {
            customerName: customerFacingName(session),
            estimateNumber: dupLabel,
            locationName: null,
            items: existing.line_items as CartItem[],
            totals: { subtotal, tax, total },
            estimateUrl: existing.estimate_url ?? null,
            zohoEstimateId: existing.zoho_estimate_id ?? '',
          },
        ).catch((err) => {
          console.error('[enquiry] WhatsApp duplicate resend failed:', err)
          return null
        })
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
      estimate_number: existing.estimate_number ?? null,
      estimate_id: existing.public_id,
      estimate_url: existing.estimate_url ?? null,
      whatsapp_sent: false,
      message: ENQUIRY_SUCCESS_MESSAGE,
      zoho_sync_status: existing.zoho_sync_status,
      sync_pending: existing.zoho_sync_status === 'PENDING',
    })
  }

  let contactLocation: string | null = null
  try {
    const wlRaw = request.cookies.get('wl')?.value
    if (wlRaw) {
      const wlParsed = JSON.parse(decodeURIComponent(wlRaw))
      const wlData = getActiveWlCookieRecord(wlParsed)
      if (wlData) {
        contactLocation =
          // (typeof wlData.name === 'string' ? wlData.name : undefined) ??   // use location area instead of name in Estimate Creation
          (typeof wlData.area === 'string' ? wlData.area : undefined) ??
          (typeof wlData.city === 'string' ? wlData.city : undefined) ??
          null
      }
    }
  } catch {
    /* malformed cookie */
  }

  const { nearestLocationId, nearestLocationName } = await resolveWarehouseForEnquiry(
    supabase,
    body,
    { applyDefaultWhenStillNull: true }
  )

  const { data: estimate, error: insertError } = await supabase
    .from('estimates')
    .insert({
      zoho_contact_id: session.zoho_contact_id,
      contact_phone: session.phone,
      source: 'catalog-app',
      contact_location: contactLocation,
      status: 'draft',
      zoho_sync_status: 'PENDING',
      zoho_sync_attempts: 0,
      cart_hash: cartHash,
      line_items: body.items,
      subtotal,
      tax_total: tax,
      total,
      notes: body.notes ?? null,
      location_id: nearestLocationId ?? null,
    })
    .select('id, public_id')
    .single()

  if (insertError || !estimate) {
    console.error('[enquiry] estimate insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save enquiry' }, { status: 500 })
  }

  const estimatePk = estimate.id
  const publicId = estimate.public_id as string

  after(async () => {
    try {
      const ph = getPostHogServer()
      if (ph) {
        ph.capture({
          distinctId: session.zoho_contact_id,
          event: 'estimate_submitted',
          properties: {
            estimate_row_id: estimatePk,
            public_id: publicId,
            total_amount: total,
            item_count: body.items.reduce((s, i) => s + i.quantity, 0),
            wineyard_location: nearestLocationName,
            contact_phone: session.phone,
          },
        })
        await ph.flush()
      }
    } catch (err) {
      console.error('[enquiry] PostHog capture failed:', err)
    }
  })

  console.log(`[enquiry] queued PENDING estimate public_id=${publicId}`)
  return NextResponse.json({
    success: true,
    estimate_number: null,
    estimate_id: publicId,
    estimate_url: null,
    whatsapp_sent: false,
    message: ENQUIRY_SUCCESS_MESSAGE,
    zoho_sync_status: 'PENDING',
    sync_pending: true,
  })
}
