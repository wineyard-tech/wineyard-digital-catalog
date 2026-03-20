// api/auth/logout/route.ts
// POST — expires the session in DB and clears the session_token cookie.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value

  if (token) {
    const supabase = createServiceClient()
    // Expire immediately so any in-flight requests are also rejected
    await supabase
      .from('sessions')
      .update({ expires_at: new Date().toISOString() })
      .eq('token', token)
  }

  const response = NextResponse.json({ success: true }, { status: 200 })
  response.cookies.set('session_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
