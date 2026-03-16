/**
 * Normalizes Indian phone numbers to E.164 format: +91XXXXXXXXXX
 *
 * Handles the formats seen in Zoho Books contacts:
 *   "+91-9876543210"  →  +919876543210
 *   "+919876543210"   →  +919876543210
 *   "919876543210"    →  +919876543210
 *   "9876543210"      →  +919876543210
 *   "09876543210"     →  +919876543210  (leading 0, STD-style)
 *
 * Returns null if the number cannot be resolved to a valid 10-digit Indian mobile.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null

  // Strip everything except digits
  const digits = raw.replace(/\D/g, '')

  let mobile: string

  if (digits.length === 10) {
    // Bare 10-digit number → assume India
    mobile = digits
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // STD-style with leading zero → strip the 0
    mobile = digits.slice(1)
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // Already has country code without +
    mobile = digits.slice(2)
  } else if (digits.length === 13 && digits.startsWith('091')) {
    // Edge case: 0 + 91 + 10 digits
    mobile = digits.slice(3)
  } else {
    // Unrecognised format — skip
    return null
  }

  // Validate: must be exactly 10 digits and start with 6-9 (Indian mobile range)
  if (mobile.length !== 10 || !/^[6-9]/.test(mobile)) return null

  return `+91${mobile}`
}

/**
 * Picks the best available phone from a Zoho contact object.
 * Priority: contact.mobile → contact.phone → contact_persons[primary].mobile
 *           → contact_persons[primary].phone → any contact_person mobile/phone
 */
export function extractPhoneFromContact(contact: any): string | null {
  const candidates: (string | null | undefined)[] = [
    contact.mobile,
    contact.phone,
    contact.billing_address?.phone,
  ]

  // Add contact persons in priority order: primary first, then rest
  const persons: any[] = contact.contact_persons ?? []
  const primary = persons.find((p: any) => p.is_primary_contact)
  const others = persons.filter((p: any) => !p.is_primary_contact)
  const ordered = primary ? [primary, ...others] : others

  for (const person of ordered) {
    candidates.push(person.mobile, person.phone)
  }

  for (const raw of candidates) {
    const normalized = normalizeIndianPhone(raw)
    if (normalized) return normalized
  }

  return null
}
