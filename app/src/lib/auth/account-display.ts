import type { SessionPayload } from '@/types/catalog'

interface AccountDisplayRow {
  contact_name: string
  company_name: string | null
  contact_person_name: string | null
}

/** Catalog header + account sheet: primary title and optional subtitle line. */
export function accountDisplayFields(row: AccountDisplayRow): {
  accountPrimary: string
  accountSubtitle: string | null
} {
  const accountPrimary = row.contact_person_name ?? row.contact_name
  const rawSubtitle = row.contact_person_name ? row.contact_name : (row.company_name ?? '')
  const accountSubtitle = rawSubtitle.trim().length > 0 ? rawSubtitle : null
  return { accountPrimary, accountSubtitle }
}

export function accountDisplayFromSession(session: SessionPayload): {
  accountPrimary: string
  accountSubtitle: string | null
} {
  return accountDisplayFields(session)
}

/** WhatsApp / customer templates — person name when logging in as contact_person. */
export function customerFacingName(row: AccountDisplayRow): string {
  return row.contact_person_name ?? row.contact_name
}

/** Admin logs and internal alerts — includes integrator when acting as a person. */
export function sessionContactLine(row: AccountDisplayRow): string {
  if (row.contact_person_name) {
    return `${row.contact_person_name} (${row.contact_name})`
  }
  return row.contact_name
}
