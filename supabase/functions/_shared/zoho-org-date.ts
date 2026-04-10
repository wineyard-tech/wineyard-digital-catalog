/** Zoho Books expects date / expiry_date as strict YYYY-MM-DD (India org). */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function formatOrgDateYmd(d: Date, timeZone: string): string {
  const tz = (timeZone ?? '').trim() || 'Asia/Kolkata'
  const fmt = (zone: string): string =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)

  try {
    const s = fmt(tz)
    if (YMD_RE.test(s)) return s
  } catch {
    // invalid IANA time zone string
  }

  const fallback = fmt('Asia/Kolkata')
  if (YMD_RE.test(fallback)) return fallback

  return d.toISOString().slice(0, 10)
}
