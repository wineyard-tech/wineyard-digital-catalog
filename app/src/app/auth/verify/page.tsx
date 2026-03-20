'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OTPInput from '@/components/auth/OTPInput'
import type { VerifyOTPResult } from '@/hooks/useAuth'

const DEFAULT_EXPIRES_IN = 600 // 10 minutes in seconds

function VerifyContent() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = params.get('phone') ?? ''

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
      attemptsLeft?: number
      error?: string
    }

    if (res.ok && data.success) {
      router.replace('/catalog')
      return // success — OTPInput handles undefined as success
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
    <main
      style={{
        minHeight: '100vh',
        background: '#F8FAFB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            width: 64,
            height: 64,
            background: '#0066CC',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            margin: '0 auto 16px',
          }}
        >
          📷
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>
          Enter OTP
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
          Check your WhatsApp for the 6-digit code
        </p>
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#FFF',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          padding: 24,
        }}
      >
        <OTPInput
          phoneNumber={phone}
          expiresIn={DEFAULT_EXPIRES_IN}
          onSubmit={handleVerify}
          onResend={handleResend}
        />
      </div>

      <button
        onClick={() => router.replace('/auth/login')}
        style={{
          marginTop: 16,
          background: 'none',
          border: 'none',
          color: '#6B7280',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        ← Change number
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
