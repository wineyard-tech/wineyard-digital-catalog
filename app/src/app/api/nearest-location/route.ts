import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getNearestLocation, type GeocodedLocation } from '@/lib/routing'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ name: null }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: locs } = await supabase
    .from('locations')
    .select('zoho_location_id, location_name, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .eq('status', 'active')

  if (!locs || locs.length === 0) {
    return NextResponse.json({ name: null })
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
  const name = locs.find(l => l.zoho_location_id === nearestId)?.location_name ?? null

  return NextResponse.json({ name })
}
