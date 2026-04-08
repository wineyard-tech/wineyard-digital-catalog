// api/auth/verify-otp/route.ts
// POST — verifies bcrypt OTP hash, enforces attempt limits,
// creates session in the sessions table, sets session_token cookie.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidIndianPhone, normalisePhone, verifyOTP } from '@/lib/auth/otp'
import { setSessionCookie } from '@/lib/auth'
import { resolveCatalogLoginByPhone } from '@/lib/auth/resolve-catalog-login'

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

  const isCorrect = await verifyOTP(otpCode, otpSession.otp_hash)

  if (isCorrect) {
    const { data: marked } = await supabase
      .from('otp_sessions')
      .update({ verified: true })
      .eq('id', otpSession.id)
      .eq('verified', false)
      .select('id')
      .maybeSingle()

    if (!marked) {
      return NextResponse.json(
        { success: false, error: 'OTP expired or not found. Please request a new OTP.' },
        { status: 401 },
      )
    }

    const login = await resolveCatalogLoginByPhone(supabase, phone)

    if (login.kind !== 'ok') {
      console.error('[verify-otp] login no longer valid after OTP success:', login.kind, phone)
      return NextResponse.json(
        { error: 'Account is no longer eligible for catalog access. Please contact Wine Yard.' },
        { status: 403 },
      )
    }

    const sessionExpiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        zoho_contact_id: login.parent.zoho_contact_id,
        zoho_contact_person_id: login.person?.zoho_contact_person_id ?? null,
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
      metadata: {
        zoho_contact_id: login.parent.zoho_contact_id,
        ...(login.person ? { zoho_contact_person_id: login.person.zoho_contact_person_id } : {}),
      },
    })

    const response = NextResponse.json(
      {
        success: true,
        user: {
          zoho_contact_id: login.parent.zoho_contact_id,
          contact_name: login.parent.contact_name,
          contact_person_name: login.person?.display_name ?? null,
          company_name: login.parent.company_name ?? null,
          phone,
          pricebook_id: login.parent.pricebook_id ?? null,
        },
      },
      { status: 200 },
    )

    setSessionCookie(response, session.token)
    return response
  }

  const newAttempts = otpSession.attempts + 1
  const burn = newAttempts > MAX_ATTEMPTS

  const { data: bumped } = await supabase
    .from('otp_sessions')
    .update({
      attempts: newAttempts,
      ...(burn ? { verified: true } : {}),
    })
    .eq('id', otpSession.id)
    .eq('attempts', otpSession.attempts)
    .select('attempts')
    .maybeSingle()

  if (!bumped) {
    return NextResponse.json({ success: false, error: 'Please try again.' }, { status: 409 })
  }

  if (burn) {
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
