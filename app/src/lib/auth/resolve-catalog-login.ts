import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.generated'

function contactPersonDisplayName(person: {
  first_name: string | null
  last_name: string | null
}): string {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
  return name.length > 0 ? name : 'Team member'
}

export type CatalogLoginResult =
  | { kind: 'unregistered' }
  | { kind: 'inactive' }
  | { kind: 'no_catalog_access'; reason: 'parent' | 'person' | 'both' }
  | {
      kind: 'ok'
      match: 'contact' | 'contact_person'
      parent: {
        zoho_contact_id: string
        contact_name: string
        company_name: string | null
        pricebook_id: string | null
      }
      person: null | {
        zoho_contact_person_id: string
        display_name: string
      }
    }

const CONTACT_SELECT =
  'zoho_contact_id, contact_name, company_name, status, online_catalogue_access, pricebook_id' as const

const PERSON_SELECT =
  'zoho_contact_person_id, zoho_contact_id, first_name, last_name, status, online_catalogue_access' as const

/**
 * Resolves catalog OTP login for a normalised E.164 phone: direct contact row first,
 * then contact_persons (phone or mobile → parent contact). Parent + person must both
 * have online_catalogue_access when logging in as a contact person.
 */
export async function resolveCatalogLoginByPhone(
  supabase: SupabaseClient<Database>,
  phone: string,
): Promise<CatalogLoginResult> {
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('phone', phone)
    .maybeSingle()

  if (contactError) {
    console.error('[resolveCatalogLoginByPhone] contacts lookup:', contactError.message)
  }

  if (contact) {
    if (contact.status !== 'active') {
      return { kind: 'inactive' }
    }
    if (!contact.online_catalogue_access) {
      return { kind: 'no_catalog_access', reason: 'parent' }
    }
    return {
      kind: 'ok',
      match: 'contact',
      parent: {
        zoho_contact_id: contact.zoho_contact_id,
        contact_name: contact.contact_name,
        company_name: contact.company_name,
        pricebook_id: contact.pricebook_id,
      },
      person: null,
    }
  }

  const { data: byPhone } = await supabase
    .from('contact_persons')
    .select(PERSON_SELECT)
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()

  const { data: byMobile } = !byPhone
    ? await supabase.from('contact_persons').select(PERSON_SELECT).eq('mobile', phone).limit(1).maybeSingle()
    : { data: null }

  const person = byPhone ?? byMobile
  if (!person) {
    return { kind: 'unregistered' }
  }

  if (person.status !== 'active') {
    return { kind: 'inactive' }
  }

  const { data: parent, error: parentError } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('zoho_contact_id', person.zoho_contact_id)
    .maybeSingle()

  if (parentError) {
    console.error('[resolveCatalogLoginByPhone] parent contact:', parentError.message)
  }

  if (!parent) {
    return { kind: 'unregistered' }
  }

  if (parent.status !== 'active') {
    return { kind: 'inactive' }
  }

  const parentAccess = parent.online_catalogue_access
  const personAccess = person.online_catalogue_access

  if (!parentAccess && !personAccess) {
    return { kind: 'no_catalog_access', reason: 'both' }
  }
  if (!parentAccess) {
    return { kind: 'no_catalog_access', reason: 'parent' }
  }
  if (!personAccess) {
    return { kind: 'no_catalog_access', reason: 'person' }
  }

  return {
    kind: 'ok',
    match: 'contact_person',
    parent: {
      zoho_contact_id: parent.zoho_contact_id,
      contact_name: parent.contact_name,
      company_name: parent.company_name,
      pricebook_id: parent.pricebook_id,
    },
    person: {
      zoho_contact_person_id: person.zoho_contact_person_id,
      display_name: contactPersonDisplayName(person),
    },
  }
}
