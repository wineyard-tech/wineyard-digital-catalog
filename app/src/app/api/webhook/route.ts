import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { sendGuestCatalogUrl, sendOtp } from '@/lib/whatsapp'

// ─── Meta webhook verification (GET) ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── Inbound WhatsApp message (POST) ────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Always return 200 to Meta — log errors internally, never 4xx/5xx
  try {
    const rawBody = await req.text()

    // Validate HMAC signature
    const sig = req.headers.get('x-hub-signature-256') ?? ''
    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', process.env.WHATSAPP_APP_SECRET!)
        .update(rawBody)
        .digest('hex')
    if (sig !== expected) {
      console.warn('[webhook] invalid signature')
      return NextResponse.json({ ok: true }) // still 200
    }

    const payload = JSON.parse(rawBody)
    const messages: any[] =
      payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? []

    if (messages.length === 0) {
      return NextResponse.json({ ok: true }) // status update or delivery receipt
    }

    const msg = messages[0]
    const rawPhone = msg.from as string          // digits only, no +
    const phone = '+' + rawPhone

    await handleInboundMessage(phone)
  } catch (err) {
    console.error('[webhook] unhandled error', err)
  }

  return NextResponse.json({ ok: true })
}

// ─── Message routing ─────────────────────────────────────────────────────────
async function handleInboundMessage(phone: string) {
  const supabase = createServerClient()

  // 1. Check if phone is a known contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name')
    .eq('phone', phone)
    .maybeSingle()

  if (contact) {
    await handleRegisteredUser(phone, contact, supabase)
  } else {
    await handleGuestUser(phone, supabase)
  }
}

// ─── Registered integrator flow ──────────────────────────────────────────────
async function handleRegisteredUser(phone: string, contact: any, supabase: any) {
  // Rate limit: max 1 auth_request per phone per 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('auth_requests')
    .select('id')
    .eq('phone', phone)
    .eq('used', false)
    .gte('created_at', fiveMinAgo)
    .maybeSingle()

  if (recent) {
    // Link already sent recently — optionally notify (skip to avoid spam)
    return
  }

  // Generate ref_id and OTP
  const refId = crypto.randomBytes(4).toString('hex')
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const now = new Date()
  const otpExpires = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  const refExpires = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

  await supabase.from('auth_requests').insert({
    ref_id: refId,
    phone,
    zoho_contact_id: contact.zoho_contact_id,
    otp_code: otp,
    otp_expires_at: otpExpires,
    ref_expires_at: refExpires,
  })

  await sendOtp(phone, otp, refId)
}

// ─── Guest (unregistered) flow ────────────────────────────────────────────────
async function handleGuestUser(phone: string, supabase: any) {
  // Rate limit: 1 guest session per phone per 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('guest_sessions')
    .select('token')
    .eq('phone', phone)
    .gte('created_at', fiveMinAgo)
    .maybeSingle()

  if (recent) {
    // Re-send the existing session link
    await sendGuestCatalogUrl(phone, recent.token)
    return
  }

  const { data: session } = await supabase
    .from('guest_sessions')
    .insert({ phone })
    .select('token')
    .single()

  if (session?.token) {
    await sendGuestCatalogUrl(phone, session.token)
  }
}
