'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com'

if (typeof window !== 'undefined' && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: POSTHOG_HOST,
    capture_pageview: false,  // manual — see PageviewTracker below
    person_profiles: 'identified_only',
    defaults: '2026-01-30',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
  })
}

/** Fires $pageview on every route change and attaches user_type super-property. */
function PageviewTracker() {
  const pathname = usePathname()
  const ph = usePostHog()
  const { isAuthenticated, loading } = useAuthContext()

  // Register user_type super-property once auth state is resolved
  useEffect(() => {
    if (loading) return
    ph.register({ user_type: isAuthenticated ? 'registered_user' : 'guest' })
  }, [loading, isAuthenticated, ph])

  // Capture pageview on route change
  useEffect(() => {
    ph.capture('$pageview', { $current_url: window.location.href })
  }, [pathname, ph])

  return null
}

export default function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PageviewTracker />
      {children}
    </PHProvider>
  )
}
