// lib/whatsapp/otp-service.ts
// Auth-specific WhatsApp messages: OTP delivery and admin lead alerts.
// Uses Meta Graph API v19.0 via native fetch (no extra SDK).
// Do NOT import from or modify lib/whatsapp.ts (quotation/guest links).

const WA_API_BASE = 'https://graph.facebook.com/v19.0'

function getConfig() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: process.env.WHATSAPP_TOKEN ?? '',
    templateName: process.env.WHATSAPP_OTP_TEMPLATE ?? 'wineyard_otp',
    adminNumber: process.env.WHATSAPP_ADMIN_NUMBER ?? '',
  }
}

async function postMessage(payload: Record<string, unknown>): Promise<string> {
  const { phoneNumberId, accessToken } = getConfig()

  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${WA_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })

    if (res.ok) {
      const data = (await res.json()) as { messages?: Array<{ id: string }> }
      return data.messages?.[0]?.id ?? ''
    }

    lastError = await res.text()
    if (attempt < 2) {
      // Exponential backoff: 200ms, 400ms
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)))
      console.warn(`[whatsapp/otp-service] retry ${attempt + 1}: ${lastError}`)
    }
  }

  throw new Error(`WhatsApp API error after retries: ${lastError}`)
}

/**
 * Sends OTP via a pre-approved AUTHENTICATION category template.
 * Falls back to a plain-text WhatsApp message if the template fails
 * (e.g. template not found, paused, or unapproved in sandbox).
 *
 * Text fallback works as long as the user has messaged the WABA number
 * within the last 24 h — safe for OTP flows since the user is actively logging in.
 */
export async function sendOTP(
  phoneNumber: string,
  otpCode: string,
): Promise<{ success: boolean; messageId?: string; error?: string; via?: 'template' | 'text' }> {
  const { templateName } = getConfig()
  const to = phoneNumber.replace(/^\+/, '') // Meta API expects digits only

  // ── Attempt 1: approved AUTHENTICATION template ───────────────────────────
  try {
    const messageId = await postMessage({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: otpCode }],
          },
          {
            // AUTHENTICATION templates include a copy-code button
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: otpCode }],
          },
        ],
      },
    })
    return { success: true, messageId, via: 'template' }
  } catch (templateErr) {
    const templateError = templateErr instanceof Error ? templateErr.message : String(templateErr)
    console.warn('[whatsapp/otp-service] Template send failed, trying text fallback:', templateError)
  }

  // ── Attempt 2: plain-text fallback ───────────────────────────────────────
  try {
    const expiryMins = process.env.OTP_EXPIRY_MINUTES ?? '10'
    const messageId = await postMessage({
      to,
      type: 'text',
      text: {
        preview_url: false,
        body:
          `Your Wine Yard login OTP is *${otpCode}*. ` +
          `Valid for ${expiryMins} minutes. Do not share this code with anyone.`,
      },
    })
    console.info('[whatsapp/otp-service] OTP sent via text fallback (template unavailable)')
    return { success: true, messageId, via: 'text' }
  } catch (textErr) {
    const error = textErr instanceof Error ? textErr.message : String(textErr)
    console.error('[whatsapp/otp-service] Both template and text fallback failed:', error)
    return { success: false, error }
  }
}

/**
 * Sends an unregistered login alert to the configured admin number.
 * Non-blocking: caller should fire-and-forget (do not await in request path).
 */
export async function sendUnregisteredAlert(
  phoneNumber: string,
  timestamp: Date,
): Promise<void> {
  const { adminNumber } = getConfig()
  if (!adminNumber) {
    console.warn('[whatsapp/otp-service] ADMIN_WHATSAPP_NUMBER not set — skipping alert')
    return
  }

  const formatted = phoneNumber
    .replace('+91', '+91-')
    .replace(/(\d{5})(\d{5})$/, '$1-$2')
  const ts = timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  try {
    await postMessage({
      to: adminNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: `⚠️ Unregistered login attempt: ${formatted} at ${ts} IST`,
      },
    })
  } catch (err) {
    // Non-blocking: log but never rethrow — don't let admin alert break auth flow
    console.error('[whatsapp/otp-service] sendUnregisteredAlert failed:', err)
  }
}
