'use client'

import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

interface PhoneInputProps {
  onSubmit: (phoneNumber: string) => Promise<void>
  loading?: boolean
}

export default function PhoneInput({ onSubmit, loading = false }: PhoneInputProps) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10)
    setDigits(raw)
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    setError('')
    await onSubmit(`+91${digits}`)
  }

  // Live format: 98765-43210
  const formatted =
    digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits

  const canSubmit = digits.length === 10 && !loading

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%' }}>
      <label
        htmlFor="phone-input"
        style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
      >
        Mobile Number
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: '2px solid #E5E7EB',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#FFF',
        }}
      >
        <span
          style={{
            padding: '0 12px',
            fontSize: 16,
            fontWeight: 600,
            color: '#6B7280',
            borderRight: '1px solid #E5E7EB',
            lineHeight: '52px',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          +91
        </span>
        <input
          id="phone-input"
          type="tel"
          inputMode="numeric"
          placeholder="98765-43210"
          value={formatted}
          onChange={handleChange}
          disabled={loading}
          autoFocus
          aria-label="Mobile number"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '14px',
            fontSize: 17,
            fontWeight: 600,
            color: '#1A1A2E',
            background: 'transparent',
            letterSpacing: '0.03em',
          }}
        />
      </div>

      {error && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#DC2626' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          marginTop: 16,
          width: '100%',
          background: canSubmit ? '#059669' : '#9CA3AF',
          color: '#FFF',
          border: 'none',
          borderRadius: 10,
          padding: '14px 0',
          fontSize: 16,
          fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'background 0.15s',
        }}
      >
        {loading ? (
          <>
            <span
              style={{
                width: 18,
                height: 18,
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#FFF',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.7s linear infinite',
              }}
            />
            Sending OTP…
          </>
        ) : (
          'Send OTP on WhatsApp'
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  )
}
