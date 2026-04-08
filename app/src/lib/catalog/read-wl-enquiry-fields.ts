/**
 * Fields from the `wl` cookie used when POSTing /api/enquiry (client-only).
 */
export interface WlEnquiryFields {
  user_lat: number | null
  user_lng: number | null
  nearest_location_id: string | null
}

/** Parse lat/lng from cookie JSON (numbers or numeric strings). */
export function parseWlFiniteCoord(value: unknown): number | null {
  if (typeof value === 'number' && isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return isFinite(n) ? n : null
  }
  return null
}

/** Zoho location id from `wl` — always treat as string (Postgres TEXT; avoid strict typeof checks). */
export function parseWlWarehouseZohoIdValue(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim()
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  return null
}

export function parseWlWarehouseName(data: Record<string, unknown>): string | null {
  const w = data.warehouse_name
  if (typeof w === 'string' && w.trim() !== '') return w.trim()
  return null
}

export function readWlEnquiryFieldsFromDocumentCookie(): WlEnquiryFields {
  if (typeof document === 'undefined') {
    return { user_lat: null, user_lng: null, nearest_location_id: null }
  }
  try {
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('wl='))
    if (!match) {
      return { user_lat: null, user_lng: null, nearest_location_id: null }
    }
    const data = JSON.parse(decodeURIComponent(match.slice(3))) as Record<string, unknown>
    const lat = parseWlFiniteCoord(data.lat)
    const lng = parseWlFiniteCoord(data.lng)
    const nearest_location_id = parseWlWarehouseZohoIdValue(data.warehouse_zoho_location_id)
    return { user_lat: lat, user_lng: lng, nearest_location_id }
  } catch {
    return { user_lat: null, user_lng: null, nearest_location_id: null }
  }
}
