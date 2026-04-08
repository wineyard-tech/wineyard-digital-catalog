import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getNearestLocation, type GeocodedLocation } from '@/lib/routing'

function dormantZohoLocationIds(): string[] {
  return (
    process.env.ZOHO_DORMANT_LOCATION_IDS?.split(',')?.map((id: string) => id.trim()).filter(Boolean) ??
    []
  )
}

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
  const dormant = dormantZohoLocationIds()
  let locQuery = supabase
    .from('locations')
    .select('zoho_location_id, location_name, phone, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .eq('status', 'active')
  if (dormant.length > 0) {
    locQuery = locQuery.not('zoho_location_id', 'in', dormant)
  }
  const { data: locs } = await locQuery

  if (!locs || locs.length === 0) {
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
  const row = nearestId ? locs.find(l => l.zoho_location_id === nearestId) : undefined

  if (!row) {
    return NextResponse.json(empty)
  }

  return NextResponse.json({
    name: row.location_name,
    zoho_location_id: String(row.zoho_location_id),
    location_name: row.location_name,
    phone: row.phone ?? null,
    latitude: typeof row.latitude === 'number' ? row.latitude : Number(row.latitude),
    longitude: typeof row.longitude === 'number' ? row.longitude : Number(row.longitude),
  })
}
