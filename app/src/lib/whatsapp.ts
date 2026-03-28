import type { CartItem } from '@/types/catalog'

const WA_API_BASE = 'https://graph.facebook.com/v19.0'

interface QuoteTotals {
  subtotal: number
  tax: number
  total: number
}

export interface WaSendResult {
  success: boolean
  messageId?: string
  error?: string
}

interface WaApiResponse {
  messages?: Array<{ id: string }>
}

const MAX_ITEMS_IN_PARAM = 3

/**
 * Extracts the CEstimateID query-param value from a Zoho estimate portal URL.
 * This is the dynamic suffix needed for the WhatsApp template URL button.
 * Example: "https://zohosecurepay.in/books/wineyard/secure?CEstimateID=2-54c..."
 *           → "2-54c..."
 */
function extractCEstimateId(estimateUrl: string | null): string | null {
  if (!estimateUrl) return null
  try {
    const url = new URL(estimateUrl)
    return url.searchParams.get('CEstimateID')
  } catch {
    return null
  }
}

/**
 * Formats cart items into a single flat string safe for WhatsApp template parameters.
 * Meta disallows newlines/tabs in parameter values, so items are pipe-separated.
 * Caps at MAX_ITEMS_IN_PARAM to stay well within the 1,024-char parameter limit
 * and keep the notification scannable — the deep-link button is the canonical receipt.
 */
function formatItemsParam(items: CartItem[]): string {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const visible = items.slice(0, MAX_ITEMS_IN_PARAM)
  const overflow = items.length - visible.length

  const lines = visible.map((item) => {
    const name = item.item_name.length > 30 ? item.item_name.slice(0, 27) + '...' : item.item_name
    return `${name} x${item.quantity} ${fmt(item.line_total)}`
  })

  if (overflow > 0) lines.push(`+${overflow} more item${overflow > 1 ? 's' : ''}`)

  return lines.join(' | ')
}

/**
 * Posts to the WhatsApp Cloud API.
 * Returns the WAMID (message ID) from the response for tracking.
 */
async function callWhatsAppApi(payload: Record<string, unknown>): Promise<string | undefined> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
  const token = process.env.WHATSAPP_TOKEN!

  const res = await fetch(`${WA_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WhatsApp API error ${res.status}: ${body}`)
  }

  const data: WaApiResponse = await res.json()
  return data.messages?.[0]?.id
}

/** Sends a plain text WhatsApp message. Returns the WAMID. */
export async function sendText(to: string, body: string): Promise<string | undefined> {
  return callWhatsAppApi({
    to,
    type: 'text',
    text: { preview_url: false, body },
  })
}

/**
 * Sends OTP + catalog link as two messages.
 * Message 1: plain text greeting with catalog deep link (always plain text — dynamic URL).
 * Message 2: tries `wineyard_otp` WABA template (body: {{1}} = OTP code, button: copy code).
 *            Falls back to plain text if the template call fails.
 */
export async function sendOtpMessage(
  to: string,
  name: string,
  refId: string,
  otp: string,
  appUrl: string
): Promise<void> {
  const catalogLink = `${appUrl}/auth/${refId}`

  await sendText(
    to,
    `Hi ${name}! Here's your Wine Yard catalog link:\n${catalogLink}\n\nOpen the link and enter your OTP to access your personalised pricing.`
  )

  try {
    await callWhatsAppApi({
      to,
      type: 'template',
      template: {
        name: 'wineyard_otp',
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: otp }],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: otp }],
          },
        ],
      },
    })
  } catch {
    // Template unavailable — fall back to plain text
    await sendText(
      to,
      `Your OTP is: *${otp}*\n\nValid for 10 minutes. Do not share this code with anyone.`
    )
  }
}

/**
 * Sends a 24-hour guest access link to an unregistered visitor.
 */
export async function sendGuestLink(
  to: string,
  guestToken: string,
  appUrl: string
): Promise<void> {
  const guestLink = `${appUrl}/guest/${guestToken}`
  const wabaLink = process.env.NEXT_PUBLIC_WABA_LINK ?? ''

  await sendText(
    to,
    `Welcome! Browse the Wine Yard CCTV catalog (valid 24 hours):\n${guestLink}\n\nFor personalised pricing, contact us to register:\n${wabaLink}`
  )
}

/**
 * Sends a formatted quotation summary via WhatsApp plain text.
 * Used as fallback when the WABA template is unavailable.
 */
export async function sendQuotation(
  to: string,
  estimateNumber: string,
  items: CartItem[],
  totals: QuoteTotals,
  estimateUrl?: string | null
): Promise<WaSendResult> {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const lineRows = items
    .map((item) => `${item.item_name} × ${item.quantity}   ${fmt(item.line_total)}`)
    .join('\n')

  const message =
    `*Wine Yard Quotation #${estimateNumber}*\n` +
    `──────────────────\n` +
    `${lineRows}\n` +
    `──────────────────\n` +
    `Subtotal:  ${fmt(totals.subtotal)}\n` +
    `GST (18%): ${fmt(totals.tax)}\n` +
    `*Total:    ${fmt(totals.total)}*\n` +
    `──────────────────\n` +
    (estimateUrl ? `View estimate: ${estimateUrl}\n` : '') +
    `Reply *YES* to confirm or call us.`

  try {
    const messageId = await sendText(to, message)
    return { success: true, messageId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface EstimateTemplateData {
  customerName: string
  estimateNumber: string
  items: CartItem[]
  totals: QuoteTotals
  estimateUrl: string | null    // Zoho public URL; null → plain-text fallback used
  zohoEstimateId: string        // {{1}} for button — Zoho estimate ID (suffix of estimate_url)
}

/**
 * Sends the `wineyard_estimate` WABA template with a Zoho estimate portal button.
 * Falls back to sendQuotation (plain text + URL) if the template call fails.
 *
 * Template parameters (3 named body params):
 *   {{estimate_number}}  = Estimate number (EST-XXXXX)
 *   {{total_amount}}     = Total amount (formatted)
 *   {{item_count}}       = Number of line items
 *
 * Button (index 0): URL button — dynamic suffix is the Zoho estimate_id.
 *
 * NOTE: Template requires Meta re-approval before the 3-param version is live.
 * Until approved, template calls fail and plain-text fallback is used automatically.
 */
export async function sendEstimateNotification(
  to: string,
  data: EstimateTemplateData,
): Promise<WaSendResult> {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  try {
    const messageId = await callWhatsAppApi({
      to,
      type: 'template',
      template: {
        name: 'wineyard_estimate',
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'estimate_number', text: data.estimateNumber },
              { type: 'text', parameter_name: 'total_amount',    text: fmt(data.totals.total) },
              { type: 'text', parameter_name: 'item_count',      text: String(data.items.length) },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            // CEstimateID is the dynamic suffix for the Zoho estimate portal URL button.
            // Falls back to zohoEstimateId if estimate_url is not yet available.
            parameters: [{ type: 'text', text: extractCEstimateId(data.estimateUrl) ?? data.zohoEstimateId }],
          },
        ],
      },
    })
    return { success: true, messageId }
  } catch (templateErr) {
    console.warn('[whatsapp] estimate template send failed, falling back to plain text:', templateErr)
    return sendQuotation(to, data.estimateNumber, data.items, data.totals, data.estimateUrl)
  }
}

export interface OrderTemplateData {
  customerName: string
  companyName: string
  salesorderNumber: string
  items: CartItem[]
  totals: QuoteTotals
}

/**
 * Sends the `wineyard_order` WABA template to confirm a placed order.
 * Falls back to plain text if the template call fails.
 *
 * Template parameters (named variables — parameter_name required by Meta API):
 *   {{order_number}}  = Sales order number (SO-XXXXX)
 *   {{order_details}} = Customer name + company + formatted line items
 *   {{total_amount}}  = Total amount (formatted)
 *   {{item_count}}    = Number of items
 *
 * Button (index 0): "View My Orders" URL button — dynamic suffix is the orders path.
 */
export async function sendOrderConfirmation(
  to: string,
  data: OrderTemplateData,
): Promise<WaSendResult> {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const lineItemsText = formatItemsParam(data.items)

  try {
    const messageId = await callWhatsAppApi({
      to,
      type: 'template',
      template: {
        name: 'wineyard_order',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'order_number',  text: data.salesorderNumber },
              { type: 'text', parameter_name: 'order_details', text: lineItemsText },
              { type: 'text', parameter_name: 'total_amount',  text: data.totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 }) },
              { type: 'text', parameter_name: 'item_count',    text: String(data.items.length) },
            ],
          },
        ],
      },
    })
    return { success: true, messageId }
  } catch (templateErr) {
    console.warn('[whatsapp] order template failed, falling back to plain text:', templateErr)

    const lineRows = data.items
      .map((item) => `${item.item_name} × ${item.quantity}   ${fmt(item.line_total)}`)
      .join('\n')

    const message =
      `✅ *Wine Yard Order Confirmed #${data.salesorderNumber}*\n` +
      `──────────────────\n` +
      `${lineRows}\n` +
      `──────────────────\n` +
      `Subtotal:  ${fmt(data.totals.subtotal)}\n` +
      `GST (18%): ${fmt(data.totals.tax)}\n` +
      `*Total:    ${fmt(data.totals.total)}*\n` +
      `──────────────────\n` +
      `Our team will contact you in the next 1 hour for delivery details.`

    try {
      const messageId = await sendText(to, message)
      return { success: true, messageId }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}

/**
 * Sends a plain text alert to the admin WhatsApp number.
 * Best-effort — never throws, never blocks the main flow.
 */
export async function sendAdminAlert(message: string): Promise<void> {
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER
  if (!adminNumber) {
    console.warn('[whatsapp] WHATSAPP_ADMIN_NUMBER not set — skipping admin alert')
    return
  }
  try {
    await sendText(adminNumber, message)
  } catch (err) {
    console.error('[whatsapp] admin alert failed:', err)
  }
}

export interface AdminLocationNotificationData {
  locationName: string | null
  estimateNumber: string
  contactName: string
  contactPhone: string
  contactLocation: string | null   // user's area/city from wl cookie
  total: number
  itemCount: number
  zohoEstimateId: string           // {{1}} for button
}

/**
 * Sends a new-estimate notification to the admin WhatsApp number.
 * Primary: `wineyard_location_notification` WABA template (approved).
 * Fallback: plain text to WHATSAPP_ADMIN_NUMBER if the template call fails for any reason.
 * Best-effort — never throws, never blocks the main response.
 */
export async function sendAdminLocationNotification(
  data: AdminLocationNotificationData
): Promise<void> {
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER
  if (!adminNumber) {
    console.warn('[whatsapp] WHATSAPP_ADMIN_NUMBER not set — skipping admin location notification')
    return
  }

  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const locationLabel = data.locationName ?? 'Unknown'

  try {
    await callWhatsAppApi({
      to: adminNumber,
      type: 'template',
      template: {
        name: 'wineyard_location_notification',
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'location_name',        text: locationLabel },
              { type: 'text', parameter_name: 'estimate_number',      text: data.estimateNumber },
              { type: 'text', parameter_name: 'contact_name',         text: data.contactName },
              { type: 'text', parameter_name: 'contact_phone_number', text: data.contactPhone },
              { type: 'text', parameter_name: 'contact_location',     text: data.contactLocation ?? 'Unknown' },
              { type: 'text', parameter_name: 'total_amount',         text: data.total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
              { type: 'text', parameter_name: 'item_count',           text: String(data.itemCount) },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: data.zohoEstimateId }],
          },
        ],
      },
    })
    console.log(`[whatsapp] admin location notification sent via template for ${data.estimateNumber}`)
    return
  } catch (err) {
    console.warn('[whatsapp] wineyard_location_notification template failed, falling back to plain text:', err)
  }

  // Plain-text fallback — matches template body exactly
  try {
    await sendText(
      adminNumber,
      `Hello ${locationLabel},\n\n` +
      `A new Estimate ${data.estimateNumber} was created for your location. Here are the details.\n\n` +
      `Customer Name - ${data.contactName}\n` +
      `Phone Number - ${data.contactPhone}\n` +
      `Customer Location - ${data.contactLocation ?? 'Unknown'}\n` +
      `Estimate Details - ${fmt(data.total)} (${data.itemCount} items)\n\n` +
      `Please respond at the earliest.`
    )
  } catch (err) {
    console.error('[whatsapp] admin location notification fallback failed:', err)
  }
}
