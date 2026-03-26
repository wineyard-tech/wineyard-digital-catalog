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
 * Returns null if the locations array is empty.
 */
export function getNearestLocation(
  userLat: number,
  userLng: number,
  locations: GeocodedLocation[]
): string | null {
  if (locations.length === 0) return null

  let nearest = locations[0]
  let minDist = haversineKm(userLat, userLng, nearest.latitude, nearest.longitude)

  for (let i = 1; i < locations.length; i++) {
    const dist = haversineKm(userLat, userLng, locations[i].latitude, locations[i].longitude)
    if (dist < minDist) {
      minDist = dist
      nearest = locations[i]
    }
  }

  return nearest.zoho_location_id
}
