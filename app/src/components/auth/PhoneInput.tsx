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
    await onSubmit(`+91${digits}`)
  }

  // Live format: 98765-43210
  const formatted =
    digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits

  const canSubmit = digits.length === 10 && !loading

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label
        htmlFor="phone-input"
        className="block text-xs font-semibold text-[#334155] mb-1.5"
      >
        Mobile Number
      </label>

      {/* Input row — matches app search bar style */}
      <div className="flex h-12 rounded-xl bg-[#F1F5F9] overflow-hidden">
        <span className="flex items-center px-3.5 text-sm font-semibold text-[#64748B] border-r border-[#E2E8F0] select-none whitespace-nowrap">
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
          className="flex-1 bg-transparent px-3.5 text-base font-semibold text-[#0F172A] placeholder:text-[#94A3B8] placeholder:font-normal outline-none"
        />
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-[#DC2626]">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={`mt-4 w-full h-12 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
          canSubmit
            ? 'bg-[#059669] active:bg-[#047857]'
            : 'bg-[#CBD5E1] cursor-not-allowed'
        }`}
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Sending OTP…
          </>
        ) : (
          <>
            {/* WhatsApp icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Send OTP on WhatsApp
          </>
        )}
      </button>
    </form>
  )
}
