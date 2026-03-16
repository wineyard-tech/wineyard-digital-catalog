const GRAPH_API = 'https://graph.facebook.com/v19.0'
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!
const TOKEN = process.env.WHATSAPP_TOKEN!

export async function sendText(to: string, body: string): Promise<boolean> {
  // Strip leading + so Meta gets pure digits
  const phone = to.replace(/^\+/, '')

  const res = await fetch(`${GRAPH_API}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    }),
  })

  const data = await res.json()
  return !!data.messages?.[0]?.id
}

export async function sendOtp(phone: string, otp: string, refId: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const message =
    `Your WineYard catalog link:\n${appUrl}/auth/${refId}\n\n` +
    `Your OTP: *${otp}* (valid 10 minutes)`
  return sendText(phone, message)
}

export async function sendGuestCatalogUrl(phone: string, token: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const wabaLink = process.env.NEXT_PUBLIC_WABA_LINK
  const message =
    `Welcome! Browse the WineYard CCTV catalog (valid 24 hours):\n` +
    `${appUrl}/guest/${token}\n\n` +
    `For personalised pricing, contact us to register:\n${wabaLink}`
  return sendText(phone, message)
}

export async function sendQuote(phone: string, estimateNumber: string, total: number): Promise<boolean> {
  const message = `WineYard Quotation #${estimateNumber}\nTotal: ₹${total.toLocaleString('en-IN')}\n\nReply YES to confirm or call us.`
  return sendText(phone, message)
}
