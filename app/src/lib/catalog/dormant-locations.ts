/**
 * Dormant Zoho warehouse ids — excluded from nearest-warehouse routing.
 *
 * Env format (no JSON, no quotes):
 *   ZOHO_DORMANT_LOCATION_IDS=2251466000003525711
 *   ZOHO_DORMANT_LOCATION_IDS=id1,id2,id3
 *
 * We filter in app code instead of PostgREST `not.in.(…)` because the JS client
 * can emit `not.in.<id>` without parentheses, which PostgREST rejects for numeric-looking TEXT ids.
 */
export function getDormantZohoLocationIdSet(): Set<string> {
  const raw = process.env.ZOHO_DORMANT_LOCATION_IDS
  if (typeof raw !== 'string' || !raw.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((id) => String(id))
  )
}

export function filterLocationsExcludingDormant<T extends { zoho_location_id: string | number }>(
  rows: T[] | null | undefined,
  dormant: Set<string>
): T[] {
  if (!rows?.length) return []
  if (dormant.size === 0) return rows.slice()
  return rows.filter((r) => !dormant.has(String(r.zoho_location_id)))
}
