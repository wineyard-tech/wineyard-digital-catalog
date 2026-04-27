import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { setSessionCookie } from '@/lib/auth'
import { verifyOTP } from '@/lib/auth/otp'
import { ensureContactGstNoFromZoho } from '@/lib/zoho'

const MAX_ATTEMPTS = 3

/**
 * Legacy rows stored plaintext 6-digit OTP; new rows store bcrypt hash in otp_code.
 */
async function otpMatchesPlain(plain: string, stored: string): Promise<boolean> {
  const trimmed = plain.trim()
  if (stored.startsWith('$2')) {
    return verifyOTP(trimmed, stored)
  }
  const a = Buffer.from(trimmed, 'utf8')
  const b = Buffer.from(stored, 'utf8')
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  let body: { ref_id?: string; otp_code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { ref_id, otp_code } = body
  if (!ref_id || !otp_code) {
    return NextResponse.json({ error: 'ref_id and otp_code are required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: authReq, error } = await supabase
    .from('auth_requests')
    .select(
      'id, phone, zoho_contact_id, zoho_contact_person_id, otp_code, otp_expires_at, ref_expires_at, attempts, used',
    )
    .eq('ref_id', ref_id)
    .eq('used', false)
    .maybeSingle()

  if (error || !authReq) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 410 })
  }

  if (authReq.ref_expires_at < now) {
    return NextResponse.json({ error: 'Link expired. Send a new WhatsApp message to log in.' }, { status: 410 })
  }

  if (authReq.otp_expires_at < now) {
    return NextResponse.json({ error: 'OTP expired. Send a new WhatsApp message to log in.' }, { status: 410 })
  }

  const matches = await otpMatchesPlain(otp_code, authReq.otp_code)

  if (!matches) {
    const newAttempts = authReq.attempts + 1
    const burn = newAttempts >= MAX_ATTEMPTS

    const { data: bumped } = await supabase
      .from('auth_requests')
      .update({
        attempts: newAttempts,
        ...(burn ? { used: true } : {}),
      })
      .eq('id', authReq.id)
      .eq('attempts', authReq.attempts)
      .select('attempts')
      .maybeSingle()

    if (!bumped) {
      return NextResponse.json({ error: 'Please try again.' }, { status: 409 })
    }

    if (burn) {
      return NextResponse.json(
        { error: 'Too many incorrect attempts. Send a new WhatsApp message to log in.', attempts_remaining: 0 },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: 'Incorrect OTP.',
        attempts_remaining: MAX_ATTEMPTS - newAttempts,
      },
      { status: 401 }
    )
  }

  const { data: consumed } = await supabase
    .from('auth_requests')
    .update({ used: true })
    .eq('id', authReq.id)
    .eq('used', false)
    .select('id')
    .maybeSingle()

  if (!consumed) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 410 })
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      zoho_contact_id: authReq.zoho_contact_id,
      zoho_contact_person_id: authReq.zoho_contact_person_id ?? null,
      phone: authReq.phone,
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (sessionError || !session) {
    console.error('[auth/verify] session insert error:', sessionError)
    return NextResponse.json({ error: 'Internal error creating session' }, { status: 500 })
  }

  const response = NextResponse.json({ success: true }, { status: 200 })
  setSessionCookie(response, session.token)
  ensureContactGstNoFromZoho(authReq.zoho_contact_id)
  return response
}
