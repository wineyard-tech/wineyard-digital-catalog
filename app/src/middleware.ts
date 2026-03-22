import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Protect /admin routes with Supabase Auth
  if (request.nextUrl.pathname.startsWith('/admin') &&
      !request.nextUrl.pathname.startsWith('/admin/login')) {
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
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return response
  }
  return NextResponse.next()
}

export default proxy

export const config = {
  matcher: ['/admin/:path*'],
}
