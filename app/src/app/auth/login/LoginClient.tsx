'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { usePostHog } from 'posthog-js/react'
import PhoneInput from '@/components/auth/PhoneInput'
import UnregisteredMessage from '@/components/auth/UnregisteredMessage'
import CatalogAccessBlockedMessage from '@/components/auth/CatalogAccessBlockedMessage'

type Step = 'phone' | 'unregistered' | 'no_access'

export default function LoginClient() {
  const router = useRouter()
  const ph = usePostHog()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromCatalog, setFromCatalog] = useState(false)

  useEffect(() => {
    setFromCatalog(new URLSearchParams(window.location.search).get('from') === 'catalog')
  }, [])

  async function handleSendOTP(phoneNumber: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      })
      const data = (await res.json()) as {
        success: boolean
        registered: boolean
        catalogAccess?: boolean
        error?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setPhone(phoneNumber)
      if (data.registered && data.catalogAccess) {
        router.push(`/auth/verify?phone=${encodeURIComponent(phoneNumber)}`)
      } else if (data.registered && !data.catalogAccess) {
        ph.capture('auth_failed', {
          failure_reason: 'catalog_access_disabled',
          attempted_phone: phoneNumber,
        })
        setStep('no_access')
      } else {
        ph.capture('auth_failed', {
          failure_reason: 'account_not_found',
          attempted_phone: phoneNumber,
        })
        setStep('unregistered')
      }
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

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
        <h1 className="text-xl font-bold text-[#0F172A]">Wine Yard Catalog</h1>
        <p className="mt-1 text-sm text-[#64748B] text-center">
          {step === 'phone'
            ? 'Enter your mobile number to receive an OTP on WhatsApp'
            : step === 'no_access'
            ? 'Access not enabled'
            : 'Account not found'}
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-6">
        {step === 'phone' ? (
          <>
            <PhoneInput onSubmit={handleSendOTP} loading={loading} />
            {error && (
              <p className="mt-3 text-center text-xs text-[#DC2626]">{error}</p>
            )}
          </>
        ) : step === 'no_access' ? (
          <CatalogAccessBlockedMessage
            phoneNumber={phone}
            onBrowseCatalog={() => router.push('/auth/browse')}
            onTryAgain={() => {
              setStep('phone')
              setPhone('')
              setError('')
            }}
          />
        ) : (
          <UnregisteredMessage
            phoneNumber={phone}
            onBrowseCatalog={() => router.push('/auth/browse')}
            onTryAgain={() => {
              setStep('phone')
              setPhone('')
              setError('')
            }}
          />
        )}
      </div>

      {/* Context-aware bottom link */}
      {step === 'phone' && (
        <div className="mt-5 text-center">
          {fromCatalog ? (
            <Link
              href="/catalog?mode=browse"
              className="text-sm text-[#64748B] underline underline-offset-2 active:opacity-70"
            >
              ← Back to Catalog
            </Link>
          ) : (
            <Link
              href="/location"
              className="text-sm text-[#64748B] underline underline-offset-2 active:opacity-70"
            >
              Skip Login →
            </Link>
          )}
        </div>
      )}

      {/* Footer note */}
      <p className="mt-6 text-xs text-[#94A3B8] text-center">
        Wine Yard Technologies • CCTV Distributors, Hyderabad
      </p>
    </main>
  )
}
