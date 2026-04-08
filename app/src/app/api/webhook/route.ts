import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual, randomBytes, randomInt } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { getContactByPhoneWithMatch } from '@/lib/zoho'
import { sendOtpMessage, sendGuestLink } from '@/lib/whatsapp'
import { hashOTP } from '@/lib/auth/otp'
import { resolveCatalogLoginByPhone } from '@/lib/auth/resolve-catalog-login'
import type { CatalogLoginResult } from '@/lib/auth/resolve-catalog-login'

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

async function sendCatalogLoginOtp(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
  greetingName: string,
  login: Extract<CatalogLoginResult, { kind: 'ok' }>,
): Promise<void> {
  const refId = randomBytes(4).toString('hex')
  const otp = randomInt(100000, 1000000).toString()
  const now = new Date()
  const otpExpiry = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  const refExpiry = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
  const otpHash = await hashOTP(otp)

  await supabase.from('auth_requests').insert({
    ref_id: refId,
    phone,
    zoho_contact_id: login.parent.zoho_contact_id,
    zoho_contact_person_id: login.person?.zoho_contact_person_id ?? null,
    otp_code: otpHash,
    otp_expires_at: otpExpiry,
    ref_expires_at: refExpiry,
  })

  await sendOtpMessage(phone, greetingName, refId, otp, APP_URL)
}

// ─── Core processing logic (runs after 200 is sent) ─────────────────────────

async function processWebhookPayload(rawBody: string): Promise<void> {
  const body = JSON.parse(rawBody)

  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  const contactProfile = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]

  // Only process inbound text messages
  if (!message || message.type !== 'text') return

  const rawPhone: string = message.from
  const phone: string = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`
  const senderName: string = contactProfile?.profile?.name ?? 'there'
  const supabase = createServiceClient()

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('auth_requests')
    .select('id')
    .eq('phone', phone)
    .gte('created_at', fiveMinAgo)
    .limit(1)
    .maybeSingle()

  if (recent) return

  let login = await resolveCatalogLoginByPhone(supabase, phone)

  if (login.kind === 'no_catalog_access' || login.kind === 'inactive') {
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'wa_catalog_blocked',
      metadata: { source: 'whatsapp', kind: login.kind },
    })
    return
  }

  if (login.kind === 'unregistered') {
    const zohoMatch = await getContactByPhoneWithMatch(phone)

    if (zohoMatch) {
      const zc = zohoMatch.contact
      await supabase.from('contacts').upsert(
        {
          zoho_contact_id: zc.contact_id,
          contact_name: zc.contact_name,
          company_name: zc.company_name ?? null,
          phone: zc.phone ?? zc.mobile ?? phone,
          email: zc.email ?? null,
          pricebook_id: zc.pricebook_id ?? null,
          status: 'active',
        },
        { onConflict: 'zoho_contact_id' },
      )

      if (zohoMatch.matchedContactPersonId) {
        const p = zc.contact_persons?.find((cp) => cp.contact_person_id === zohoMatch.matchedContactPersonId)
        if (p) {
          await supabase.from('contact_persons').upsert(
            {
              zoho_contact_person_id: p.contact_person_id,
              zoho_contact_id: zc.contact_id,
              first_name: p.first_name ?? null,
              last_name: p.last_name ?? null,
              email: p.email ?? null,
              phone: p.phone ?? null,
              mobile: p.mobile ?? null,
              is_primary: p.is_primary_contact ?? false,
              status: 'active',
            },
            { onConflict: 'zoho_contact_person_id' },
          )
        }
      }

      login = await resolveCatalogLoginByPhone(supabase, phone)
    }
  }

  if (login.kind === 'ok') {
    const greeting =
      login.person?.display_name ?? login.parent.contact_name ?? senderName
    await sendCatalogLoginOtp(supabase, phone, greeting, login)
    return
  }

  if (login.kind === 'no_catalog_access' || login.kind === 'inactive') {
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'wa_catalog_blocked',
      metadata: { source: 'whatsapp', after_zoho: true, kind: login.kind },
    })
    return
  }

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

// ─── POST — Inbound WhatsApp message handler ─────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  if (!verifyHmacSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  after(async () => {
    try {
      await processWebhookPayload(rawBody)
    } catch (err) {
      console.error('[webhook] unhandled error:', err)
    }
  })

  return new NextResponse('OK', { status: 200 })
}
