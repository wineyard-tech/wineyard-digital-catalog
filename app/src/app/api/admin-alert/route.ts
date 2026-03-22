import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendAdminAlert } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  let body: { type: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (body.type === 'unregistered_quote_attempt') {
    // Try to get any phone from cookie session (may be a logged-out user)
    const token = request.cookies.get('session_token')?.value
    const session = token ? await getSession(token) : null
    const phone = session?.phone ?? 'unknown'

    void sendAdminAlert(
      `⚠️ Unregistered user attempted quote request\n` +
      `Phone: ${phone}\n` +
      `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
    )
  }

  // Always return 200 — this is fire-and-forget from the client
  return NextResponse.json({ ok: true })
}
