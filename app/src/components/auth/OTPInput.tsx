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

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

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
      if (!result) return
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
  const hasError = uiState === 'error'
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const displayPhone = phoneNumber.replace('+91', '+91 ').replace(/(\d{5})(\d{5})$/, '$1 $2')

  return (
    <div className="w-full">
      <p className="mb-5 text-sm text-[#64748B] text-center">
        OTP sent to{' '}
        <span className="font-semibold text-[#0F172A]">{displayPhone}</span>
      </p>

      {/* 6 digit boxes */}
      <div className="flex gap-2 justify-center mb-4">
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
            className={`w-11 h-13 text-center text-xl font-bold rounded-xl outline-none transition-colors
              ${isLocked || isLoading ? 'bg-[#F1F5F9] text-[#94A3B8]' : 'bg-[#F1F5F9] text-[#0F172A]'}
              ${hasError ? 'ring-2 ring-[#DC2626]' : 'focus:ring-2 focus:ring-[#0066CC]'}
            `}
            style={{ height: 52 }}
          />
        ))}
      </div>

      {/* Timer */}
      {!isLocked && secondsLeft > 0 && (
        <p className="mb-3 text-xs text-[#64748B] text-center">
          Expires in{' '}
          <span className={`font-bold ${secondsLeft < 60 ? 'text-[#DC2626]' : 'text-[#0F172A]'}`}>
            {mm}:{ss}
          </span>
        </p>
      )}

      {/* Error */}
      {(hasError || isLocked) && (
        <p className="mb-3 text-center text-xs text-[#DC2626]">
          {errorMsg}
          {attemptsLeft !== null && attemptsLeft > 0 && (
            <span> ({attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left)</span>
          )}
        </p>
      )}

      {/* Verify button */}
      {!isLocked && (
        <button
          onClick={() => code.length === 6 && doSubmit(code)}
          disabled={code.length < 6 || isLoading}
          className={`w-full h-12 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
            code.length < 6 || isLoading
              ? 'bg-[#CBD5E1] cursor-not-allowed'
              : 'bg-[#059669] active:bg-[#047857]'
          }`}
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
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
        className={`mt-3 w-full py-1 text-sm font-semibold bg-transparent border-none transition-colors ${
          resendCooldown > 0
            ? 'text-[#CBD5E1] cursor-not-allowed'
            : 'text-[#0066CC] active:opacity-70'
        }`}
      >
        {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
      </button>
    </div>
  )
}
