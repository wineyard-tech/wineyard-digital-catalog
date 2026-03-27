'use client'

import { useRef, useState, KeyboardEvent, ClipboardEvent } from 'react'
import { useRouter } from 'next/navigation'

interface OtpFormProps {
  refId: string
}

type FormState = 'idle' | 'loading' | 'error' | 'locked'

export default function OtpForm({ refId }: OtpFormProps) {
  const router = useRouter()
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''))
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  // Synchronous in-flight lock — prevents ghost-clicks and concurrent submits
  // (React setState is async; a ref is the correct guard here)
  const submittingRef = useRef(false)

  function focusNext(idx: number) {
    inputs.current[idx + 1]?.focus()
  }

  function focusPrev(idx: number) {
    inputs.current[idx - 1]?.focus()
  }

  function handleChange(idx: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = digit
    setDigits(next)
    if (digit) focusNext(idx)

    // Auto-submit when last digit entered
    if (idx === 5 && digit) {
      const code = next.join('')
      if (code.length === 6) submitOtp(code)
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx]) {
      focusPrev(idx)
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = Array(6).fill('')
    pasted.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    inputs.current[Math.min(pasted.length, 5)]?.focus()
    if (pasted.length === 6) submitOtp(pasted)
  }

  async function submitOtp(code: string) {
    if (submittingRef.current) return  // ghost-click guard
    submittingRef.current = true
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_id: refId, otp_code: code }),
      })
      const data = await res.json()

      if (res.ok) {
        router.replace('/catalog')
        return
      }

      if (res.status === 410) {
        setState('locked')
        setErrorMsg('OTP expired. Send a new WhatsApp message to get a fresh link.')
        return
      }

      if (data.attempts_remaining !== undefined && data.attempts_remaining <= 0) {
        setState('locked')
        setErrorMsg('Too many incorrect attempts. Send a new WhatsApp message to try again.')
        return
      }

      setAttemptsLeft(data.attempts_remaining ?? null)
      setErrorMsg(data.error ?? 'Incorrect OTP. Please try again.')
      setState('error')
      setDigits(Array(6).fill(''))
      inputs.current[0]?.focus()
    } catch {
      setState('error')
      setErrorMsg('Network error. Please check your connection and try again.')
      setDigits(Array(6).fill(''))
      inputs.current[0]?.focus()
    } finally {
      submittingRef.current = false
    }
  }

  function handleSubmit() {
    const code = digits.join('')
    if (code.length === 6) submitOtp(code)
  }

  const isLocked = state === 'locked'
  const isLoading = state === 'loading'
  const code = digits.join('')

  return (
    <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
      {/* Digit boxes */}
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
              border: state === 'error' ? '2px solid #EF4444' : '2px solid #E5E7EB',
              borderRadius: 10,
              outline: 'none',
              background: isLocked ? '#F3F4F6' : '#FFFFFF',
              color: isLocked ? '#9CA3AF' : '#1A1A2E',
              transition: 'border-color 0.15s',
            }}
          />
        ))}
      </div>

      {/* Error message */}
      {state === 'error' && (
        <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>
          {errorMsg}
          {attemptsLeft !== null && attemptsLeft > 0 && (
            <span> ({attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left)</span>
          )}
        </p>
      )}

      {/* Locked message */}
      {isLocked && (
        <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>
          {errorMsg}
        </p>
      )}

      {/* Submit button */}
      {!isLocked && (
        <button
          onClick={handleSubmit}
          disabled={code.length < 6 || isLoading}
          style={{
            width: '100%',
            background: code.length < 6 || isLoading ? '#9CA3AF' : '#059669',
            color: '#FFFFFF',
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
                  borderTopColor: '#FFFFFF',
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
