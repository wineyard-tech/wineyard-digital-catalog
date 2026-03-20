'use client'

import { useRef, useState, useEffect } from 'react'
import type { KeyboardEvent, ClipboardEvent } from 'react'

interface VerifyResult {
  attemptsLeft?: number
  error?: string
}

interface OTPInputProps {
  phoneNumber: string
  expiresIn: number   // seconds until OTP expires (from mount)
  onSubmit: (otp: string) => Promise<VerifyResult | void>
  onResend: () => Promise<void>
}

type UIState = 'idle' | 'loading' | 'error' | 'locked'

export default function OTPInput({ phoneNumber, expiresIn, onSubmit, onResend }: OTPInputProps) {
  const [digits, setDigits] = useState(Array(6).fill(''))
  const [uiState, setUiState] = useState<UIState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(expiresIn)
  const [resendCooldown, setResendCooldown] = useState(30)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  // OTP expiry countdown
  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  function focusAt(idx: number) {
    inputs.current[idx]?.focus()
  }

  function handleChange(idx: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = digit
    setDigits(next)
    if (digit && idx < 5) focusAt(idx + 1)
    if (idx === 5 && digit) {
      const code = next.join('')
      if (code.length === 6) doSubmit(code)
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) focusAt(idx - 1)
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = Array(6).fill('')
    pasted.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    focusAt(Math.min(pasted.length, 5))
    if (pasted.length === 6) doSubmit(pasted)
  }

  async function doSubmit(code: string) {
    setUiState('loading')
    setErrorMsg('')
    try {
      const result = await onSubmit(code)
      if (!result) return // success — parent handles redirect
      if ((result.attemptsLeft ?? 1) <= 0) {
        setUiState('locked')
        setErrorMsg(result.error ?? 'Too many attempts. Please request a new OTP.')
      } else {
        setAttemptsLeft(result.attemptsLeft ?? null)
        setErrorMsg(result.error ?? 'Incorrect OTP. Please try again.')
        setUiState('error')
        setDigits(Array(6).fill(''))
        setTimeout(() => focusAt(0), 50)
      }
    } catch {
      setUiState('error')
      setErrorMsg('Network error. Please check your connection.')
      setDigits(Array(6).fill(''))
      setTimeout(() => focusAt(0), 50)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setUiState('idle')
    setDigits(Array(6).fill(''))
    setErrorMsg('')
    setAttemptsLeft(null)
    setSecondsLeft(expiresIn)
    setResendCooldown(30)
    await onResend()
  }

  const code = digits.join('')
  const isLocked = uiState === 'locked'
  const isLoading = uiState === 'loading'
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const displayPhone = phoneNumber.replace('+91', '+91 ').replace(/(\d{5})(\d{5})$/, '$1 $2')

  return (
    <div style={{ width: '100%' }}>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
        OTP sent to{' '}
        <strong style={{ color: '#1A1A2E' }}>{displayPhone}</strong>
      </p>

      {/* 6 digit boxes */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => { inputs.current[idx] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={isLocked || isLoading}
            autoFocus={idx === 0}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={idx === 0 ? handlePaste : undefined}
            aria-label={`OTP digit ${idx + 1}`}
            style={{
              width: 44,
              height: 52,
              textAlign: 'center',
              fontSize: 22,
              fontWeight: 700,
              border: uiState === 'error' ? '2px solid #EF4444' : '2px solid #E5E7EB',
              borderRadius: 10,
              outline: 'none',
              background: isLocked ? '#F3F4F6' : '#FFF',
              color: isLocked ? '#9CA3AF' : '#1A1A2E',
              transition: 'border-color 0.15s',
            }}
          />
        ))}
      </div>

      {/* Timer */}
      {!isLocked && secondsLeft > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
          Expires in{' '}
          <span
            style={{
              fontWeight: 700,
              color: secondsLeft < 60 ? '#DC2626' : '#1A1A2E',
            }}
          >
            {mm}:{ss}
          </span>
        </p>
      )}

      {/* Error / locked message */}
      {(uiState === 'error' || isLocked) && (
        <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>
          {errorMsg}
          {attemptsLeft !== null && attemptsLeft > 0 && (
            <span>
              {' '}({attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left)
            </span>
          )}
        </p>
      )}

      {/* Verify button */}
      {!isLocked && (
        <button
          onClick={() => code.length === 6 && doSubmit(code)}
          disabled={code.length < 6 || isLoading}
          style={{
            width: '100%',
            background: code.length < 6 || isLoading ? '#9CA3AF' : '#059669',
            color: '#FFF',
            border: 'none',
            borderRadius: 10,
            padding: '14px 0',
            fontSize: 16,
            fontWeight: 700,
            cursor: code.length < 6 || isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {isLoading ? (
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
              Verifying…
            </>
          ) : (
            'Verify OTP'
          )}
        </button>
      )}

      {/* Resend */}
      <button
        onClick={handleResend}
        disabled={resendCooldown > 0}
        style={{
          marginTop: 12,
          width: '100%',
          background: 'none',
          border: 'none',
          color: resendCooldown > 0 ? '#9CA3AF' : '#0066CC',
          fontSize: 14,
          fontWeight: 600,
          cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
          padding: '4px 0',
        }}
      >
        {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
