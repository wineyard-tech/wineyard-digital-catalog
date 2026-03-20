// proxy.ts  (Next.js 16 convention — replaces middleware.ts)
// Edge Runtime — runs before every matching request.
//
// Admin routes: protected via Supabase Auth (existing behaviour).
// Integrator routes (/catalog, /cart, /orders, /profile):
//   - Cookie-presence check for UX redirect (fast, edge-compatible).
//   - Full session validation happens server-side in API routes + Server Components.
//   - Browse mode (?mode=browse) allows unauthenticated catalog access.

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/catalog', '/cart', '/orders', '/profile']

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // ── Admin routes: Supabase Auth ───────────────────────────────────────────
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const response = NextResponse.next()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value },
          set(name, value, options) { response.cookies.set({ name, value, ...options }) },
          remove(name, options) { response.cookies.set({ name, value: '', ...options }) },
        },
      },
    )
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return response
  }

  // ── Integrator routes: session_token cookie check ─────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  // Allow unauthenticated browse mode (general pricing, no cart/orders features)
  if (pathname.startsWith('/catalog') && searchParams.get('mode') === 'browse') {
    return NextResponse.next()
  }

  // Redirect to login if no session cookie present.
  // Full token validation is enforced server-side in API routes and Server Components.
  const token = request.cookies.get('session_token')?.value
  if (!token) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export default proxy

export const config = {
  matcher: [
    '/admin/:path*',
    '/catalog/:path*',
    '/cart/:path*',
    '/orders/:path*',
    '/profile/:path*',
  ],
}
