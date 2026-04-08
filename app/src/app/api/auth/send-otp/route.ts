// api/auth/send-otp/route.ts
// POST — validates phone, checks contacts table, generates hashed OTP,
// sends via WhatsApp, captures admin alert for unregistered numbers.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidIndianPhone, normalisePhone, generateOTP, hashOTP } from '@/lib/auth/otp'
import { sendOTP, sendUnregisteredAlert } from '@/lib/whatsapp/otp-service'
import { resolveCatalogLoginByPhone } from '@/lib/auth/resolve-catalog-login'

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES ?? 10)
const RATE_LIMIT_WINDOW_MINUTES = 5
const RATE_LIMIT_MAX = 3

export async function POST(request: NextRequest) {
  let body: { phoneNumber?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawPhone = body.phoneNumber ?? ''
  const phone = normalisePhone(rawPhone)

  if (!isValidIndianPhone(phone)) {
    return NextResponse.json(
      { error: 'Invalid phone number. Please enter a valid 10-digit Indian mobile number.' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip')
  const userAgent = request.headers.get('user-agent')
  const now = new Date()

  // ── Rate limiting: max 3 OTP requests per phone per 5 minutes ────────────
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString()
  const { count: recentCount } = await supabase
    .from('otp_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', windowStart)
    .then((r) => ({ count: r.count ?? 0 }))

  if (recentCount >= RATE_LIMIT_MAX) {
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'rate_limited',
      ip_address: ip,
      user_agent: userAgent,
    })
    return NextResponse.json(
      {
        error: `Too many OTP requests. Please wait ${RATE_LIMIT_WINDOW_MINUTES} minutes before trying again.`,
      },
      { status: 429 },
    )
  }


  const login = await resolveCatalogLoginByPhone(supabase, phone)

  if (login.kind === 'unregistered' || login.kind === 'inactive') {
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'unregistered',
      ip_address: ip,
      user_agent: userAgent,
      ...(login.kind === 'inactive' ? { metadata: { reason: 'inactive_contact_or_person' } } : {}),
    })
    sendUnregisteredAlert(phone, now) // intentionally not awaited
    return NextResponse.json(
      { success: true, registered: false, message: 'Please contact Wine Yard to register.' },
      { status: 200 },
    )
  }

  if (login.kind === 'no_catalog_access') {
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'registered_no_access',
      ip_address: ip,
      user_agent: userAgent,
      metadata: { gate: login.reason },
    })
    return NextResponse.json(
      { success: true, registered: true, catalogAccess: false },
      { status: 200 },
    )
  }

  // ── Generate and store hashed OTP ─────────────────────────────────────────
  const otp = generateOTP()
  const otpHash = await hashOTP(otp)
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000).toISOString()

  const { error: insertError } = await supabase.from('otp_sessions').insert({
    phone,
    otp_hash: otpHash,
    expires_at: expiresAt,
  })

  if (insertError) {
    console.error('[send-otp] otp_sessions insert error:', insertError)
    return NextResponse.json({ error: 'Internal error. Please try again.' }, { status: 500 })
  }

  // ── Send OTP via WhatsApp ─────────────────────────────────────────────────
  const result = await sendOTP(phone, otp)

  if (!result.success) {
    if (process.env.NODE_ENV === 'development') {
      // Dev fallback: log OTP so you can test without WABA credentials
      console.log(`[DEV] OTP for ${phone}: ${otp}`)
    } else {
      return NextResponse.json(
        { error: 'Failed to send OTP. Please try again.' },
        { status: 500 },
      )
    }
  }

  await supabase.from('auth_attempts').insert({
    phone,
    attempt_type: 'registered_otp_sent',
    ip_address: ip,
    user_agent: userAgent,
    metadata: {
      ...(result.messageId ? { message_id: result.messageId } : {}),
      ...(login.kind === 'ok' && login.match === 'contact_person'
        ? { zoho_contact_person_id: login.person!.zoho_contact_person_id }
        : {}),
    },
  })

  return NextResponse.json(
    { success: true, registered: true, catalogAccess: true, expiresIn: OTP_EXPIRY_MINUTES * 60 },
    { status: 200 },
  )
}
