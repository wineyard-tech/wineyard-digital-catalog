import type { CartItem } from '../../../types/catalog'

const WA_API_BASE = 'https://graph.facebook.com/v19.0'

interface QuoteTotals {
  subtotal: number
  tax: number
  total: number
}

async function callWhatsAppApi(payload: Record<string, unknown>): Promise<void> {
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
}

/** Sends a plain text WhatsApp message. */
export async function sendText(to: string, body: string): Promise<void> {
  await callWhatsAppApi({
    to,
    type: 'text',
    text: { preview_url: false, body },
  })
}

/**
 * Sends OTP + catalog link as two separate messages.
 * Message 1: personalised greeting + catalog link
 * Message 2: OTP code with expiry notice
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
    `Hi ${name}! Here's your WineYard catalog link:\n${catalogLink}\n\nOpen the link and enter your OTP to access your personalised pricing.`
  )

  await sendText(
    to,
    `Your OTP is: *${otp}*\n\nValid for 10 minutes. Do not share this code with anyone.`
  )
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
    `Welcome! Browse the WineYard CCTV catalog (valid 24 hours):\n${guestLink}\n\nFor personalised pricing, contact us to register:\n${wabaLink}`
  )
}

/**
 * Sends a formatted quotation summary via WhatsApp.
 */
export async function sendQuotation(
  to: string,
  estimateNumber: string,
  items: CartItem[],
  totals: QuoteTotals
): Promise<void> {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const lineRows = items
    .map((item) => `${item.item_name} × ${item.quantity}   ${fmt(item.line_total)}`)
    .join('\n')

  const message =
    `*WineYard Quotation #${estimateNumber}*\n` +
    `─────────────────────────────\n` +
    `${lineRows}\n` +
    `─────────────────────────────\n` +
    `Subtotal:   ${fmt(totals.subtotal)}\n` +
    `GST (18%):  ${fmt(totals.tax)}\n` +
    `*Total:     ${fmt(totals.total)}*\n` +
    `─────────────────────────────\n` +
    `Reply *YES* to confirm or call us.`

  await sendText(to, message)
}
