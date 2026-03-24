// api/auth/verify-otp/route.ts
// POST — verifies bcrypt OTP hash, enforces attempt limits,
// creates session in the sessions table, sets session_token cookie.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidIndianPhone, normalisePhone, verifyOTP } from '@/lib/auth/otp'
import { setSessionCookie } from '@/lib/auth'

const MAX_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS ?? 3)
const SESSION_DAYS = 15

export async function POST(request: NextRequest) {
  let body: { phoneNumber?: string; otpCode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawPhone = body.phoneNumber ?? ''
  const otpCode = (body.otpCode ?? '').trim()
  const phone = normalisePhone(rawPhone)

  if (!isValidIndianPhone(phone) || !/^\d{6}$/.test(otpCode)) {
    return NextResponse.json({ error: 'Invalid phone or OTP format.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip')
  const userAgent = request.headers.get('user-agent')
  const now = new Date().toISOString()

  // ── Fetch the most recent active OTP session ───────────────────────────────
  const { data: otpSession } = await supabase
    .from('otp_sessions')
    .select('id, otp_hash, attempts')
    .eq('phone', phone)
    .eq('verified', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpSession) {
    return NextResponse.json(
      { success: false, error: 'OTP expired or not found. Please request a new OTP.' },
      { status: 401 },
    )
  }

  // ── Increment attempt counter before checking ─────────────────────────────
  const newAttempts = otpSession.attempts + 1
  await supabase.from('otp_sessions').update({ attempts: newAttempts }).eq('id', otpSession.id)

  if (newAttempts > MAX_ATTEMPTS) {
    // Too many guesses — invalidate this session
    await supabase.from('otp_sessions').update({ verified: true }).eq('id', otpSession.id)
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'registered_failed',
      ip_address: ip,
      user_agent: userAgent,
      metadata: { reason: 'max_attempts_exceeded' },
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Too many incorrect attempts. Please request a new OTP.',
        attemptsLeft: 0,
      },
      { status: 401 },
    )
  }

  // ── Verify bcrypt hash ────────────────────────────────────────────────────
  const isCorrect = await verifyOTP(otpCode, otpSession.otp_hash)

  if (!isCorrect) {
    const attemptsLeft = MAX_ATTEMPTS - newAttempts
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'registered_failed',
      ip_address: ip,
      user_agent: userAgent,
      metadata: { attempts_left: attemptsLeft },
    })
    return NextResponse.json(
      { success: false, error: 'Incorrect OTP.', attemptsLeft },
      { status: 401 },
    )
  }

  // ── OTP correct: mark verified and create session ─────────────────────────
  await supabase.from('otp_sessions').update({ verified: true }).eq('id', otpSession.id)

  const { data: contact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name, company_name, pricebook_id')
    .eq('phone', phone)
    .maybeSingle()

  if (!contact) {
    console.error('[verify-otp] contact not found after OTP success for phone:', phone)
    return NextResponse.json({ error: 'Contact not found.' }, { status: 500 })
  }

  const sessionExpiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      zoho_contact_id: contact.zoho_contact_id,
      phone,
      ip_address: ip,
      user_agent: userAgent,
      expires_at: sessionExpiry,
    })
    .select('token')
    .single()

  if (sessionError || !session) {
    console.error('[verify-otp] session insert error:', sessionError)
    return NextResponse.json({ error: 'Internal error creating session.' }, { status: 500 })
  }

  await supabase.from('auth_attempts').insert({
    phone,
    attempt_type: 'registered_success',
    ip_address: ip,
    user_agent: userAgent,
    metadata: { zoho_contact_id: contact.zoho_contact_id },
  })

  const response = NextResponse.json(
    {
      success: true,
      user: {
        zoho_contact_id: contact.zoho_contact_id,
        contact_name: contact.contact_name,
        company_name: contact.company_name ?? null,
        phone,
        pricebook_id: contact.pricebook_id ?? null,
      },
    },
    { status: 200 },
  )

  setSessionCookie(response, session.token)
  return response
}
