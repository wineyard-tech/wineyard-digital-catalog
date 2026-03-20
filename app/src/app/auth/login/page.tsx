'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PhoneInput from '@/components/auth/PhoneInput'
import UnregisteredMessage from '@/components/auth/UnregisteredMessage'

type Step = 'phone' | 'unregistered'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        error?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setPhone(phoneNumber)

      if (data.registered) {
        router.push(`/auth/verify?phone=${encodeURIComponent(phoneNumber)}`)
      } else {
        setStep('unregistered')
      }
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

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
          WineYard Catalog
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
          {step === 'phone'
            ? 'Enter your mobile number to receive an OTP on WhatsApp'
            : 'Account not found'}
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
        {step === 'phone' ? (
          <>
            <PhoneInput onSubmit={handleSendOTP} loading={loading} />
            {error && (
              <p
                style={{
                  margin: '12px 0 0',
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#DC2626',
                }}
              >
                {error}
              </p>
            )}
          </>
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
    </main>
  )
}
