// proxy.ts — migration mode: funnel all page traffic to /
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function shouldPassThrough(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname.startsWith('/api')) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/ingest')) return true
  if (pathname === '/manifest.json') return true
  if (pathname.startsWith('/icons')) return true
  if (pathname === '/favicon.ico') return true
  if (pathname === '/sw.js') return true
  if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|js)$/i.test(pathname)) return true

  return false
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (shouldPassThrough(pathname)) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/', request.url))
}

export default proxy

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
