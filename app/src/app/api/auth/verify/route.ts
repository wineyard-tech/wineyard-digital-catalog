import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { setSessionCookie } from '@/lib/auth'

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

  // ── Fetch the auth_request by ref_id ─────────────────────────────────────
  const { data: authReq, error } = await supabase
    .from('auth_requests')
    .select('id, phone, zoho_contact_id, otp_code, otp_expires_at, ref_expires_at, attempts, used')
    .eq('ref_id', ref_id)
    .eq('used', false)
    .maybeSingle()

  if (error || !authReq) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 410 })
  }

  // ── Check ref_id expiry (1h window) ──────────────────────────────────────
  if (authReq.ref_expires_at < now) {
    return NextResponse.json({ error: 'Link expired. Send a new WhatsApp message to log in.' }, { status: 410 })
  }

  // ── Check OTP expiry (10min window) ──────────────────────────────────────
  if (authReq.otp_expires_at < now) {
    return NextResponse.json({ error: 'OTP expired. Send a new WhatsApp message to log in.' }, { status: 410 })
  }

  // ── OTP match check ───────────────────────────────────────────────────────
  if (authReq.otp_code !== otp_code) {
    const newAttempts = authReq.attempts + 1
    const maxAttempts = 3

    if (newAttempts >= maxAttempts) {
      // Burn the record — user must request a new link
      await supabase
        .from('auth_requests')
        .update({ attempts: newAttempts, used: true })
        .eq('id', authReq.id)

      return NextResponse.json(
        { error: 'Too many incorrect attempts. Send a new WhatsApp message to log in.', attempts_remaining: 0 },
        { status: 401 }
      )
    }

    await supabase
      .from('auth_requests')
      .update({ attempts: newAttempts })
      .eq('id', authReq.id)

    return NextResponse.json(
      {
        error: 'Incorrect OTP.',
        attempts_remaining: maxAttempts - newAttempts,
      },
      { status: 401 }
    )
  }

  // ── OTP is correct — create session ──────────────────────────────────────
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      zoho_contact_id: authReq.zoho_contact_id,
      phone: authReq.phone,
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (sessionError || !session) {
    console.error('[auth/verify] session insert error:', sessionError)
    return NextResponse.json({ error: 'Internal error creating session' }, { status: 500 })
  }

  // Mark auth_request as used
  await supabase
    .from('auth_requests')
    .update({ used: true })
    .eq('id', authReq.id)

  // Return success with session cookie
  const response = NextResponse.json({ success: true }, { status: 200 })
  setSessionCookie(response, session.token)
  return response
}
