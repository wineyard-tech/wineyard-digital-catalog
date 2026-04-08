import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getNearestLocation, type GeocodedLocation } from '@/lib/routing'
import {
  filterLocationsExcludingDormant,
  getDormantZohoLocationIdSet,
} from '@/lib/catalog/dormant-locations'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  const empty = {
    name: null as string | null,
    zoho_location_id: null as string | null,
    location_name: null as string | null,
    phone: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
  }

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json(empty, { status: 400 })
  }

  const supabase = createServiceClient()
  const dormant = getDormantZohoLocationIdSet()
  const { data: locsRaw, error: locError } = await supabase
    .from('locations')
    .select('zoho_location_id, location_name, phone, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .eq('status', 'active')
  if (dormant.length > 0) {
    locQuery = locQuery.not('zoho_location_id', 'in', dormant)
  }
  const { data: locs } = await locQuery

  if (locError) {
    console.error('[nearest-location] Supabase locations query failed:', locError.message)
    return NextResponse.json(
      { ...empty, error: 'LOCATION_QUERY_FAILED' },
      { status: 500 }
    )
  }

  const locs = filterLocationsExcludingDormant(locsRaw, dormant)

  if (locs.length === 0) {
    console.warn(
      '[nearest-location] No active locations with non-null latitude/longitude (after dormant filter). Sync locations in Supabase or review ZOHO_DORMANT_LOCATION_IDS.'
    )
    return NextResponse.json(empty)
  }

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

  const nearestId = getNearestLocation(lat, lng, geocoded)
  if (!nearestId) {
    return NextResponse.json(empty)
  }

  const row =
    locs.find((l) => String(l.zoho_location_id) === String(nearestId)) ?? null

  let resolved = row
  if (!resolved) {
    const { data: fallbackRow, error: fbErr } = await supabase
      .from('locations')
      .select('zoho_location_id, location_name, phone, latitude, longitude')
      .eq('zoho_location_id', nearestId)
      .eq('status', 'active')
      .maybeSingle()
    if (fbErr) {
      console.error('[nearest-location] Fallback location lookup failed:', fbErr.message)
    }
    const fb = fallbackRow
    resolved =
      fb && !dormant.has(String(fb.zoho_location_id)) ? fb : null
  }

  if (!resolved) {
    console.warn(
      '[nearest-location] nearestId not found in DB:',
      nearestId,
      '(check zoho_location_id vs ZOHO_DEFAULT_LOCATION_ID)'
    )
    return NextResponse.json(empty)
  }

  return NextResponse.json({
    name: resolved.location_name,
    zoho_location_id: String(resolved.zoho_location_id),
    location_name: resolved.location_name,
    phone: resolved.phone ?? null,
    latitude:
      resolved.latitude == null
        ? null
        : typeof resolved.latitude === 'number'
          ? resolved.latitude
          : Number(resolved.latitude),
    longitude:
      resolved.longitude == null
        ? null
        : typeof resolved.longitude === 'number'
          ? resolved.longitude
          : Number(resolved.longitude),
  })
}
