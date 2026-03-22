import { createServiceClient } from './supabase/server'
import type { ZohoContact, ZohoEstimateResponse, ZohoSalesOrderResponse } from '@/types/zoho'
import type { CartItem } from '@/types/catalog'

const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3'
const ZOHO_OAUTH_URL = 'https://accounts.zoho.in/oauth/v2/token'

/**
 * Returns a valid Zoho access token.
 * Reads cached token from zoho_tokens; refreshes if within 5 minutes of expiry.
 */
export async function getAccessToken(): Promise<string> {
  const supabase = createServiceClient()

  const { data: cached } = await supabase
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .maybeSingle()

  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  if (cached && cached.expires_at > fiveMinFromNow) {
    return cached.access_token
  }

  // Refresh the token via Zoho OAuth
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  })

  const res = await fetch(ZOHO_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status}`)
  }

  const tokenData = await res.json()
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  await supabase.from('zoho_tokens').upsert({
    id: 1,
    access_token: tokenData.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  return tokenData.access_token
}

/**
 * Looks up a single contact in Zoho Books by phone number.
 * Checks both the top-level contact fields (phone, mobile) AND all
 * contact_persons sub-records — because integrators are typically stored
 * as Contact Persons under a parent Contact, not as top-level contacts.
 *
 * Paginates through all active customers (200 per page) until found.
 * Returns the parent Contact when any match is found, or null.
 */
export async function getContactByPhone(phone: string): Promise<ZohoContact | null> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!
  const normalised = phone.replace(/\D/g, '')

  let page = 1
  while (true) {
    const url = new URL(`${ZOHO_API_BASE}/contacts`)
    url.searchParams.set('organization_id', orgId)
    url.searchParams.set('contact_type', 'customer')
    url.searchParams.set('status', 'active')
    url.searchParams.set('per_page', '200')
    url.searchParams.set('page', String(page))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!res.ok) return null

    const data = await res.json()
    const contacts: ZohoContact[] = data.contacts ?? []
    if (contacts.length === 0) break

    for (const contact of contacts) {
      // Check top-level phone / mobile
      if (
        (contact.phone ?? '').replace(/\D/g, '') === normalised ||
        (contact.mobile ?? '').replace(/\D/g, '') === normalised
      ) {
        return contact
      }

      // Check contact_persons sub-records (integrators registered under a company)
      const persons = contact.contact_persons ?? []
      if (
        persons.some(
          (p) =>
            (p.phone ?? '').replace(/\D/g, '') === normalised ||
            (p.mobile ?? '').replace(/\D/g, '') === normalised
        )
      ) {
        return contact
      }
    }

    // Fewer than 200 returned — no more pages
    if (contacts.length < 200) break
    page++
  }

  return null
}

/**
 * Creates an estimate in Zoho Books.
 * Called by the enquiry route after inserting a draft estimate locally.
 */
export async function createEstimate(
  contactId: string,
  lineItems: CartItem[],
  notes?: string
): Promise<ZohoEstimateResponse> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const body = {
    customer_id: contactId,
    line_items: lineItems.map((item) => ({
      item_id: item.zoho_item_id,
      name: item.item_name,
      quantity: item.quantity,
      rate: item.rate,
    })),
    ...(notes ? { notes } : {}),
  }

  const res = await fetch(`${ZOHO_API_BASE}/estimates?organization_id=${orgId}`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Zoho create estimate failed: ${res.status} — ${errText}`)
  }

  return res.json()
}

/**
 * Creates a Sales Order in Zoho Books.
 * When converting from an estimate, pass estimateNumber as reference_number
 * to maintain traceability. Call markEstimateAccepted separately to update
 * the estimate's status in Zoho.
 */
export async function createSalesOrder(
  contactId: string,
  lineItems: CartItem[],
  options?: { estimateNumber?: string; notes?: string }
): Promise<ZohoSalesOrderResponse> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const body = {
    customer_id: contactId,
    line_items: lineItems.map((item) => ({
      item_id: item.zoho_item_id,
      name: item.item_name,
      quantity: item.quantity,
      rate: item.rate,
    })),
    ...(options?.estimateNumber ? { reference_number: options.estimateNumber } : {}),
    ...(options?.notes ? { notes: options.notes } : {}),
  }

  const res = await fetch(`${ZOHO_API_BASE}/salesorders?organization_id=${orgId}`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Zoho create sales order failed: ${res.status} — ${errText}`)
  }

  return res.json()
}

/**
 * Marks a Zoho estimate as "accepted" after a sales order has been placed.
 * This is a best-effort call — failure here does not block the order flow.
 */
export async function markEstimateAccepted(zohoEstimateId: string): Promise<void> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const res = await fetch(
    `${ZOHO_API_BASE}/estimates/${zohoEstimateId}/status/accepted?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Zoho mark estimate accepted failed: ${res.status} — ${errText}`)
  }
}
