import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual, randomBytes, randomInt } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { getContactByPhone } from '@/lib/zoho'
import { sendOtpMessage, sendGuestLink } from '@/lib/whatsapp'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://catalog.wineyard.in'

// ─── HMAC signature verification ─────────────────────────────────────────────

function verifyHmacSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  try {
    return (
      expected.length === signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    )
  } catch {
    return false
  }
}

// ─── GET — Meta webhook verification handshake ───────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── Core processing logic (runs after 200 is sent) ─────────────────────────

async function processWebhookPayload(rawBody: string): Promise<void> {
  const body = JSON.parse(rawBody)

  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  const contactProfile = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]

  // Only process inbound text messages
  if (!message || message.type !== 'text') return

  const phone: string = message.from // e.g. "919876543210"
  const senderName: string = contactProfile?.profile?.name ?? 'there'
  const supabase = createServiceClient()

  // ── Rate limit: 1 auth_request per phone per 5 min ─────────────────────
  // This also deduplicates Meta retries — if we already processed this phone
  // within the last 5 min, the row exists and we bail early.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('auth_requests')
    .select('id')
    .eq('phone', phone)
    .gte('created_at', fiveMinAgo)
    .limit(1)
    .maybeSingle()

  if (recent) return // already sent a link recently

  // ── Look up phone in contacts table ────────────────────────────────────
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name, pricebook_id')
    .eq('phone', phone)
    .maybeSingle()

  let contact = existingContact

  if (!contact) {
    // Not in Supabase — check Zoho Books (this is the slow path that was
    // causing Meta timeouts and duplicate sends)
    const zohoContact = await getContactByPhone(phone)

    if (zohoContact) {
      const { data: inserted } = await supabase
        .from('contacts')
        .insert({
          zoho_contact_id: zohoContact.contact_id,
          contact_name: zohoContact.contact_name,
          company_name: zohoContact.company_name ?? null,
          phone: zohoContact.phone ?? zohoContact.mobile ?? phone,
          email: zohoContact.email ?? null,
          pricebook_id: zohoContact.pricebook_id ?? null,
          status: 'active',
        })
        .select('zoho_contact_id, contact_name, pricebook_id')
        .single()

      contact = inserted
    }
  }

  if (contact) {
    // Registered integrator — generate OTP + ref_id and send catalog link
    const refId = randomBytes(4).toString('hex')
    const otp = randomInt(100000, 1000000).toString()
    const now = new Date()
    const otpExpiry = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    const refExpiry = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

    await supabase.from('auth_requests').insert({
      ref_id: refId,
      phone,
      zoho_contact_id: contact.zoho_contact_id,
      otp_code: otp,
      otp_expires_at: otpExpiry,
      ref_expires_at: refExpiry,
    })

    await sendOtpMessage(phone, contact.contact_name ?? senderName, refId, otp, APP_URL)
  } else {
    // Unregistered — create a 24-hour guest session
    const { data: guest } = await supabase
      .from('guest_sessions')
      .insert({
        phone,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('token')
      .single()

    if (guest?.token) {
      await sendGuestLink(phone, guest.token, APP_URL)
    }
  }
}

// ─── POST — Inbound WhatsApp message handler ─────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  // Reject requests with invalid HMAC (not from Meta)
  if (!verifyHmacSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // Schedule processing AFTER the 200 response is delivered to Meta.
  // This prevents Meta from retrying due to slow Zoho/WhatsApp API calls.
  after(async () => {
    try {
      await processWebhookPayload(rawBody)
    } catch (err) {
      console.error('[webhook] unhandled error:', err)
    }
  })

  // Meta gets 200 in <5ms — no more retries
  return new NextResponse('OK', { status: 200 })
}
