/**
 * Normalizes Indian phone numbers to E.164 format: +91XXXXXXXXXX
 *
 * Accepts both mobiles (start 6-9) and landlines (start 2-5 with STD code).
 * Landlines are common for B2B contacts — excluding them would skip valid accounts.
 *
 * Handles formats seen in Zoho Books contacts:
 *   "+91-9876543210"   →  +919876543210  (mobile with country code)
 *   "+919876543210"    →  +919876543210
 *   "919876543210"     →  +919876543210
 *   "9876543210"       →  +919876543210  (bare 10-digit mobile)
 *   "09876543210"      →  +919876543210  (leading 0, STD-style)
 *   "04023456789"      →  +914023456789  (Hyderabad landline, 11 digits with 0)
 *   "4023456789"       →  +914023456789  (10-digit landline without leading 0)
 *
 * Returns null only if the string is empty, too short, or clearly not a phone number.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null

  // Strip everything except digits
  const digits = raw.replace(/\D/g, '')

  let local: string  // the 10-digit local number (without country/trunk prefix)

  if (digits.length === 10) {
    // Bare 10-digit number — covers both mobiles (6-9) and landlines (2-5)
    local = digits
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // STD-style trunk prefix: 0 + 10 digits
    local = digits.slice(1)
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // Country code without +
    local = digits.slice(2)
  } else if (digits.length === 13 && digits.startsWith('091')) {
    // Edge case: 0 + 91 + 10 digits
    local = digits.slice(3)
  } else {
    // Too short or unrecognised format
    return null
  }

  // Must be exactly 10 digits and start with 2-9 (covers all Indian numbers)
  // Digits starting with 0 or 1 are invalid in India
  if (local.length !== 10 || !/^[2-9]/.test(local)) return null

  return `+91${local}`
}

/**
 * Picks the best available phone from a Zoho contact object.
 * Priority: contact.mobile → contact.phone → billing_address.phone
 *           → contact_persons[primary].mobile/phone → any other person mobile/phone
 *
 * Returns { phone, source } so callers can log where the number came from,
 * or null if no valid Indian number exists anywhere on the contact.
 */
export function extractPhoneFromContact(
  contact: any
): { phone: string; source: string } | null {
  const persons: any[] = contact.contact_persons ?? []
  const primary = persons.find((p: any) => p.is_primary_contact)
  const others  = persons.filter((p: any) => !p.is_primary_contact)
  const ordered = primary ? [primary, ...others] : others

  const candidates: Array<{ raw: string | null | undefined; source: string }> = [
    { raw: contact.mobile,              source: 'contact.mobile' },
    { raw: contact.phone,               source: 'contact.phone' },
    { raw: contact.billing_address?.phone, source: 'billing_address.phone' },
    ...ordered.flatMap((p: any, i: number) => {
      const label = p.is_primary_contact ? 'primary_person' : `person[${i}]`
      return [
        { raw: p.mobile, source: `${label}.mobile` },
        { raw: p.phone,  source: `${label}.phone`  },
      ]
    }),
  ]

  for (const { raw, source } of candidates) {
    const phone = normalizeIndianPhone(raw)
    if (phone) return { phone, source }
  }

  return null
}

/**
 * Returns a human-readable summary of all raw phone values on a contact,
 * for use in skip-warning logs.
 */
export function describeContactPhones(contact: any): string {
  const persons: any[] = contact.contact_persons ?? []
  const parts: string[] = []
  if (contact.mobile) parts.push(`mobile="${contact.mobile}"`)
  if (contact.phone)  parts.push(`phone="${contact.phone}"`)
  if (contact.billing_address?.phone) parts.push(`billing="${contact.billing_address.phone}"`)
  for (const p of persons) {
    if (p.mobile) parts.push(`person.mobile="${p.mobile}"`)
    if (p.phone)  parts.push(`person.phone="${p.phone}"`)
  }
  return parts.length > 0 ? parts.join(', ') : 'NO PHONE DATA'
}
