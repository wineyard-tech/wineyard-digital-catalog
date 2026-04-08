/**
 * Label for catalog header / UI from parsed `wl` cookie JSON.
 * Prefers building or street (`name` from geocoder) over sublocality (`area`) and `city`.
 */
export function getWlHeaderLabelFromParsed(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>
  const pick = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  return pick(o.name) ?? pick(o.area) ?? pick(o.city)
}
