import { createServiceClient } from './supabase/server'
import type { ZohoContact, ZohoEstimateResponse, ZohoSalesOrderResponse } from '@/types/zoho'
import type { CartItem } from '@/types/catalog'

const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3'
const ZOHO_OAUTH_URL = 'https://accounts.zoho.in/oauth/v2/token'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const ZOHO_ERR_BODY_MAX = 4000

/**
 * Rich, log-friendly Zoho / OAuth error line: parses JSON when possible (code, message, full body)
 * and appends optional correlation meta. Use for Vercel function logs.
 */
export function formatZohoError(
  operation: string,
  status: number,
  rawBody: string,
  meta?: Record<string, unknown>
): string {
  let detail: string
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>
      const code = o.code
      const message = o.message
      const msgStr =
        typeof message === 'string'
          ? message
          : message !== undefined && message !== null
            ? JSON.stringify(message)
            : undefined
      const parts: string[] = []
      if (code !== undefined) parts.push(`code=${String(code)}`)
      if (msgStr !== undefined) parts.push(`message=${msgStr}`)
      const bodyStr = JSON.stringify(parsed)
      const truncated =
        bodyStr.length > ZOHO_ERR_BODY_MAX ? `${bodyStr.slice(0, ZOHO_ERR_BODY_MAX)}…` : bodyStr
      parts.push(`body=${truncated}`)
      detail = parts.join(' ')
    } else {
      const s = JSON.stringify(parsed)
      detail = `body=${s.length > ZOHO_ERR_BODY_MAX ? `${s.slice(0, ZOHO_ERR_BODY_MAX)}…` : s}`
    }
  } catch {
    const raw =
      rawBody.length > ZOHO_ERR_BODY_MAX ? `${rawBody.slice(0, ZOHO_ERR_BODY_MAX)}…` : rawBody
    detail = `raw=${raw}`
  }
  const metaStr =
    meta !== undefined && Object.keys(meta).length > 0 ? ` meta=${JSON.stringify(meta)}` : ''
  return `${operation} http=${status} ${detail}${metaStr}`
}

function logZohoError(
  operation: string,
  status: number,
  rawBody: string,
  meta?: Record<string, unknown>
): void {
  console.error('[zoho]', formatZohoError(operation, status, rawBody, meta))
}

function throwZohoError(
  operation: string,
  status: number,
  rawBody: string,
  meta?: Record<string, unknown>
): never {
  const msg = formatZohoError(operation, status, rawBody, meta)
  console.error('[zoho]', msg)
  throw new Error(msg)
}

/**
 * Zoho Books `date` / `expiry_date` expect yyyy-MM-dd (API docs).
 * Use `sv-SE` + `.format()` — stable YYYY-MM-DD across Node/ICU (Vercel Linux vs macOS).
 * `en-CA` + formatToParts has produced values Zoho rejects as "Invalid time format" on some runtimes.
 */
function formatOrgDateYmd(d: Date, timeZone: string): string {
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
    const errText = await res.text()
    throwZohoError('OAuth token refresh', res.status, errText)
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

export interface ZohoContactPhoneMatch {
  contact: ZohoContact
  /** Zoho `contact_person_id` when the inbound number matched a sub-record; otherwise null. */
  matchedContactPersonId: string | null
}

/**
 * Looks up a single contact in Zoho Books by phone number.
 * Checks top-level phone/mobile first, then contact_persons.
 * Returns parent contact + which person matched (if any).
 */
export async function getContactByPhoneWithMatch(phone: string): Promise<ZohoContactPhoneMatch | null> {
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

    if (!res.ok) {
      const errText = await res.text()
      logZohoError('GET contacts', res.status, errText, { page })
      return null
    }

    const data = await res.json()
    const contacts: ZohoContact[] = data.contacts ?? []
    if (contacts.length === 0) break

    for (const contact of contacts) {
      if (
        (contact.phone ?? '').replace(/\D/g, '') === normalised ||
        (contact.mobile ?? '').replace(/\D/g, '') === normalised
      ) {
        return { contact, matchedContactPersonId: null }
      }

      const persons = contact.contact_persons ?? []
      for (const p of persons) {
        if (
          (p.phone ?? '').replace(/\D/g, '') === normalised ||
          (p.mobile ?? '').replace(/\D/g, '') === normalised
        ) {
          return { contact, matchedContactPersonId: p.contact_person_id }
        }
      }
    }

    if (contacts.length < 200) break
    page++
  }

  return null
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
  const row = await getContactByPhoneWithMatch(phone)
  return row?.contact ?? null
}

/**
 * Fetches line_items for a Zoho invoice from the detail endpoint.
 * Used to lazily hydrate invoice rows that were synced from the list endpoint
 * (which does not include line_items). Returns null on any failure.
 */
export async function getZohoInvoiceLineItems(zohoInvoiceId: string): Promise<unknown[] | null> {
  const meta = { zoho_invoice_id: zohoInvoiceId }
  try {
    const token = await getAccessToken()
    const orgId = process.env.ZOHO_ORG_ID!
    const res = await fetch(
      `${ZOHO_API_BASE}/invoices/${zohoInvoiceId}?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (!res.ok) {
      const errText = await res.text()
      logZohoError(`GET invoices/${zohoInvoiceId}`, res.status, errText, meta)
      return null
    }
    const data = (await res.json()) as Record<string, unknown>
    const invoice = (data.invoice ?? data) as Record<string, unknown> | undefined
    const lineItems = invoice?.line_items
    if (!Array.isArray(lineItems)) {
      logZohoError(
        `GET invoices/${zohoInvoiceId} (no line_items)`,
        res.status,
        JSON.stringify(data),
        meta
      )
      return null
    }
    return lineItems
  } catch (err) {
    console.error(
      '[zoho]',
      formatZohoError(
        `GET invoices/${zohoInvoiceId} (exception)`,
        0,
        err instanceof Error ? err.message : String(err),
        meta
      ),
      err
    )
    return null
  }
}

/**
 * Fetches line_items for a Zoho estimate from the detail endpoint.
 * Used to lazily hydrate estimate rows that were synced from the list endpoint
 * (which does not include line_items). Returns null on any failure.
 */
export async function getZohoEstimateLineItems(zohoEstimateId: string): Promise<unknown[] | null> {
  const meta = { zoho_estimate_id: zohoEstimateId }
  try {
    const token = await getAccessToken()
    const orgId = process.env.ZOHO_ORG_ID!
    const res = await fetch(
      `${ZOHO_API_BASE}/estimates/${zohoEstimateId}?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (!res.ok) {
      const errText = await res.text()
      logZohoError(`GET estimates/${zohoEstimateId}`, res.status, errText, meta)
      return null
    }
    const data = (await res.json()) as Record<string, unknown>
    const lineItems = (data.estimate as Record<string, unknown> | undefined)?.line_items
    if (!Array.isArray(lineItems)) {
      logZohoError(
        `GET estimates/${zohoEstimateId} (no line_items)`,
        res.status,
        JSON.stringify(data),
        meta
      )
      return null
    }
    return lineItems
  } catch (err) {
    console.error(
      '[zoho]',
      formatZohoError(
        `GET estimates/${zohoEstimateId} (exception)`,
        0,
        err instanceof Error ? err.message : String(err),
        meta
      ),
      err
    )
    return null
  }
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

  // Notes: GST messaging on the Zoho PDF. tax_treatment out_of_scope keeps Total = Subtotal.
  const gstNote = `All prices inclusive of GST`
  const notesText = [gstNote, options?.notes].filter(Boolean).join('\n')

  // https://www.zoho.com/books/api/v3/estimates/#create-an-estimate — date / expiry_date: YYYY-MM-DD
  const orgTz = process.env.ZOHO_ORG_TIMEZONE?.trim() || 'Asia/Kolkata'
  const now = new Date()
  const today = formatOrgDateYmd(now, orgTz)
  const expiry = formatOrgDateYmd(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), orgTz)

  const body = {
    customer_id: contactId,
    date: today,
    expiry_date: expiry,
    // tax_treatment: 'out_of_scope' prevents Zoho org-level default taxes from inflating
    // the estimate total — Total = Subtotal in the Zoho portal, matching the app.
    // GST info is surfaced via the notes field above instead of Zoho's tax engine.
    is_inclusive_tax: false,
    tax_treatment: 'out_of_scope',
    // Omit tax_id when not applying Books tax — empty string is not a valid numeric tax id per API docs.
    line_items: lineItems.map((item) => ({
      item_id: item.zoho_item_id,
      name: item.item_name,
      quantity: item.quantity,
      rate: item.rate, // pricebook_rate ?? base_rate — resolved by resolvePrice()
    })),
    notes: notesText,
    ...(options?.locationId ? { location_id: options.locationId } : {}),
  }

  console.info('[zoho] createEstimate:date-context', {
    orgTzEnvSet: Boolean(process.env.ZOHO_ORG_TIMEZONE?.trim()),
    orgTz,
    today,
    expiry,
    nowUtc: now.toISOString(),
    lineCount: lineItems.length,
    hasLocationId: Boolean(options?.locationId),
  })

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
    throwZohoError('POST estimates', res.status, errText)
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
  const meta = { zoho_estimate_id: zohoEstimateId }
  try {
    const token = await getAccessToken()
    const orgId = process.env.ZOHO_ORG_ID!

    const res = await fetch(
      `${ZOHO_API_BASE}/estimates/${zohoEstimateId}?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )

    if (!res.ok) {
      const errText = await res.text()
      logZohoError(`GET estimates/${zohoEstimateId} (public url)`, res.status, errText, meta)
      return null
    }

    const data: ZohoEstimateResponse = await res.json()
    return data.estimate.estimate_url ?? null
  } catch (err) {
    console.error(
      '[zoho]',
      formatZohoError(
        `GET estimates/${zohoEstimateId} (public url exception)`,
        0,
        err instanceof Error ? err.message : String(err),
        meta
      ),
      err
    )
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
    throwZohoError('POST salesorders', res.status, errText)
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
    throwZohoError(`POST estimates/${zohoEstimateId}/status/sent`, res.status, errText, {
      zoho_estimate_id: zohoEstimateId,
    })
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
    throwZohoError(`POST estimates/${zohoEstimateId}/status/accepted`, res.status, errText, {
      zoho_estimate_id: zohoEstimateId,
    })
  }
}
