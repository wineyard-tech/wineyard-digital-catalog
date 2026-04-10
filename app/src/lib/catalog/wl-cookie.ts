/**
 * `wl` cookie: v2 stores up to {@link WL_COOKIE_MAX_LOCATIONS} locations, newest first.
 * Legacy cookie is a single location object (treated as a one-item history).
 */

export const WL_COOKIE_VERSION = 2 as const
export const WL_COOKIE_MAX_LOCATIONS = 5

/** Subset of fields persisted in the cookie (matches location page `LocationData`). */
export interface WlStoredLocation {
  address: string
  name: string
  area: string
  city: string
  lat?: number
  lng?: number
  warehouse_name?: string
  warehouse_zoho_location_id?: string
  warehouse_phone?: string
  warehouse_lat?: number
  warehouse_lng?: number
}

export interface WlCookieV2 {
  v: typeof WL_COOKIE_VERSION
  locations: WlStoredLocation[]
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

function isWlCookieV2Shape(o: Record<string, unknown>): boolean {
  return o.v === WL_COOKIE_VERSION && Array.isArray(o.locations)
}

/** Ordered newest → oldest, capped at {@link WL_COOKIE_MAX_LOCATIONS}. */
export function parseWlCookieToLocations(parsed: unknown): WlStoredLocation[] {
  if (!isRecord(parsed)) return []
  if (isWlCookieV2Shape(parsed)) {
    const locs = parsed.locations as unknown[]
    return locs
      .filter(isRecord)
      .slice(0, WL_COOKIE_MAX_LOCATIONS) as unknown as WlStoredLocation[]
  }
  return [parsed as unknown as WlStoredLocation]
}

/** Active location for catalog / enquiry (most recently saved). */
export function getActiveWlCookieRecord(parsed: unknown): Record<string, unknown> | null {
  const first = parseWlCookieToLocations(parsed)[0]
  return first ? (first as unknown as Record<string, unknown>) : null
}

export function locationDedupKey(loc: WlStoredLocation): string {
  const lat = loc.lat != null && Number.isFinite(Number(loc.lat)) ? Number(loc.lat).toFixed(5) : ''
  const lng = loc.lng != null && Number.isFinite(Number(loc.lng)) ? Number(loc.lng).toFixed(5) : ''
  return `${String(loc.address).trim().toLowerCase()}|${lat}|${lng}`
}

/** Merge new selection to the front; dedupe by address+coords; cap length. */
export function buildWlCookiePayload(
  newLoc: WlStoredLocation,
  existingParsed: unknown
): WlCookieV2 {
  const prev = parseWlCookieToLocations(existingParsed)
  const key = locationDedupKey(newLoc)
  const rest = prev.filter(p => locationDedupKey(p) !== key)
  const locations = [newLoc, ...rest].slice(0, WL_COOKIE_MAX_LOCATIONS)
  return { v: WL_COOKIE_VERSION, locations }
}
