// Pure geolocation routing utilities.
// No DB calls — functions are fully unit-testable in isolation.

const EARTH_RADIUS_KM = 6371

/** Great-circle distance between two lat/lng points (km), using Haversine formula. */
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface GeocodedLocation {
  zoho_location_id: string
  latitude: number
  longitude: number
}

/**
 * Returns the zoho_location_id of the warehouse closest to (userLat, userLng).
 * Returns null if no locations have finite coordinates.
 */
export function getNearestLocation(
  userLat: number,
  userLng: number,
  locations: GeocodedLocation[]
): string | null {
  const valid = locations.filter(
    l => isFinite(l.latitude) && isFinite(l.longitude)
  )
  if (valid.length === 0) return null

  let nearest = valid[0]
  let minDist = haversineKm(userLat, userLng, nearest.latitude, nearest.longitude)

  for (let i = 1; i < valid.length; i++) {
    const dist = haversineKm(userLat, userLng, valid[i].latitude, valid[i].longitude)
    if (dist < minDist) {
      minDist = dist
      nearest = valid[i]
    }
  }

  return nearest.zoho_location_id
}
