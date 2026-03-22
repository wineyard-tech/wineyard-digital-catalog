import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value
  if (!token) {
    return NextResponse.json({ authenticated: false })
  }

  const session = await getSession(token)
  if (!session) {
    return NextResponse.json({ authenticated: false })
  }

  return NextResponse.json({
    authenticated: true,
    contact_name: session.contact_name,
  })
}
