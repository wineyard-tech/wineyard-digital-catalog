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
 *
 * Pricing strategy: Zoho Estimates API does not accept a pricebook_id at the
 * document level, so we send rate explicitly per line item. CartItem.rate is
 * already pricebook-resolved by the catalog (pricebook_rate ?? base_rate),
 * so this correctly honours per-contact pricing without a separate lookup.
 *
 * options.locationId: Zoho location_id of the nearest warehouse — passed as
 * `location_id` in the request body so the estimate is associated with that
 * warehouse for fulfilment routing.
 */
export async function createEstimate(
  contactId: string,
  lineItems: CartItem[],
  options?: { notes?: string; locationId?: string | null }
): Promise<ZohoEstimateResponse> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const body = {
    customer_id: contactId,
    line_items: lineItems.map((item) => ({
      item_id: item.zoho_item_id,
      name: item.item_name,
      quantity: item.quantity,
      rate: item.rate,   // pricebook_rate ?? base_rate — resolved by resolvePrice()
    })),
    ...(options?.notes ? { notes: options.notes } : {}),
    ...(options?.locationId ? { location_id: options.locationId } : {}),
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
 * Fetches the public shareable URL for an existing Zoho estimate.
 *
 * The POST /estimates response does not include estimate_url — it is only
 * available on the GET /estimates/{id} response. This function is a best-effort
 * wrapper: it returns null on any failure so the caller can proceed without
 * a URL rather than blocking the estimate flow.
 */
export async function getEstimatePublicUrl(zohoEstimateId: string): Promise<string | null> {
  try {
    const token = await getAccessToken()
    const orgId = process.env.ZOHO_ORG_ID!

    const res = await fetch(
      `${ZOHO_API_BASE}/estimates/${zohoEstimateId}?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )

    if (!res.ok) return null

    const data: ZohoEstimateResponse = await res.json()
    return data.estimate.estimate_url ?? null
  } catch {
    return null
  }
}

/**
 * Creates a Sales Order in Zoho Books.
 *
 * Pricing strategy: Sales Orders support pricebook_id at the document level.
 * When the contact has a pricebook, we pass it and omit rate from line items —
 * Zoho auto-resolves the correct pricebook price per item.
 * When there is no pricebook, we send rate explicitly (CartItem.rate = base_rate).
 *
 * When converting from an estimate, pass estimateNumber as reference_number
 * to maintain traceability. Call markEstimateAccepted separately to update
 * the estimate's status in Zoho.
 */
export async function createSalesOrder(
  contactId: string,
  lineItems: CartItem[],
  options?: { pricebookId?: string | null; estimateNumber?: string; notes?: string }
): Promise<ZohoSalesOrderResponse> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const hasPricebook = Boolean(options?.pricebookId)

  const body = {
    customer_id: contactId,
    // Pass pricebook_id so Zoho auto-applies the correct price per item.
    // Omit when no pricebook — rate is sent explicitly instead.
    ...(hasPricebook ? { pricebook_id: options!.pricebookId } : {}),
    line_items: lineItems.map((item) => ({
      item_id: item.zoho_item_id,
      name: item.item_name,
      quantity: item.quantity,
      // With pricebook: omit rate — Zoho resolves from pricebook.
      // Without pricebook: send CartItem.rate (= base_rate from catalog).
      ...(!hasPricebook ? { rate: item.rate } : {}),
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
 * Marks a Zoho estimate as "sent".
 * Must be called after createEstimate so the estimate is visible to the customer
 * and the public estimate_url becomes available on the GET response.
 * Throws on failure — callers should treat this as best-effort and catch.
 */
export async function markEstimateSent(zohoEstimateId: string): Promise<void> {
  const token = await getAccessToken()
  const orgId = process.env.ZOHO_ORG_ID!

  const res = await fetch(
    `${ZOHO_API_BASE}/estimates/${zohoEstimateId}/status/sent?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    }
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Zoho mark estimate sent failed: ${res.status} — ${errText}`)
  }
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
