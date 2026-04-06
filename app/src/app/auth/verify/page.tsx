'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Image from 'next/image'
import { usePostHog } from 'posthog-js/react'
import OTPInput from '@/components/auth/OTPInput'
import { useAuthContext } from '@/contexts/AuthContext'
import type { VerifyOTPResult } from '@/hooks/useAuth'

const DEFAULT_EXPIRES_IN = 600

function VerifyContent() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = params.get('phone') ?? ''
  const ph = usePostHog()
  const { setAuthenticatedUser } = useAuthContext()

  useEffect(() => {
    if (!phone) router.replace('/auth/login')
  }, [phone, router])

  async function handleVerify(otp: string): Promise<VerifyOTPResult | void> {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, otpCode: otp }),
    })
    const data = (await res.json()) as {
      success?: boolean
      user?: { zoho_contact_id: string; contact_name: string; company_name: string | null; phone: string; pricebook_id: string | null }
      attemptsLeft?: number
      error?: string
    }

    if (res.ok && data.success && data.user) {
      // Identify in PostHog — merges prior guest session history into this profile
      ph.identify(data.user.zoho_contact_id, {
        name: data.user.contact_name,
        phone: data.user.phone,
        pricebook_id: data.user.pricebook_id,
      })
      ph.register({ user_type: 'registered_user' })
      // Sync auth state into the shared context without an extra /api/auth/refresh call
      setAuthenticatedUser(data.user)
      router.replace('/location')
      return
    }

    ph.capture('auth_failed', {
      failure_reason: 'invalid_otp',
      attempted_phone: phone,
    })

    // OTP expired: no attemptsLeft in response → treat as locked (0 attempts) so
    // OTPInput shows the error message + Resend button immediately
    if (typeof data.attemptsLeft === 'undefined' && data.error?.toLowerCase().includes('expired')) {
      return { attemptsLeft: 0, error: 'Your OTP has expired. Tap Resend below to get a new one.' }
    }

    return { attemptsLeft: data.attemptsLeft, error: data.error }
  }

  async function handleResend() {
    await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })
  }

  if (!phone) return null

  return (
    <main className="min-h-screen bg-[#F8FAFB] flex flex-col items-center justify-center px-4 py-8">
      {/* Brand header */}
      <div className="flex flex-col items-center mb-8">
        <Image
          src="/wine-yard-logo.png"
          alt="Wine Yard Technologies"
          width={140}
          height={100}
          className="mb-3 object-contain"
          priority
        />
        <h1 className="text-xl font-bold text-[#0F172A]">Enter OTP</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Check your WhatsApp for the 6-digit code
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-6">
        <OTPInput
          phoneNumber={phone}
          expiresIn={DEFAULT_EXPIRES_IN}
          onSubmit={handleVerify}
          onResend={handleResend}
        />
      </div>

      {/* Back link */}
      <button
        onClick={() => router.replace('/auth/login')}
        className="mt-5 flex items-center gap-1 text-sm text-[#64748B] bg-transparent border-0 active:opacity-70"
      >
        <ChevronLeft className="w-4 h-4" />
        Change number
      </button>
    </main>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  )
}
