'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { YUKTI_REDIRECT_URL } from '@/lib/migration/constants'
import {
  formatWhatsAppDisplayNumber,
  toWhatsAppHref,
} from '@/lib/migration/whatsapp'

const REDIRECT_COUNTDOWN_SECONDS = 30

interface MigrationLandingProps {
  whatsappAdminNumber: string
}

export default function MigrationLanding({
  whatsappAdminNumber,
}: MigrationLandingProps) {
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_COUNTDOWN_SECONDS)
  const whatsappDisplay = whatsappAdminNumber
    ? formatWhatsAppDisplayNumber(whatsappAdminNumber)
    : null
  const whatsappHref = whatsappAdminNumber ? toWhatsAppHref(whatsappAdminNumber) : null

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister()
        }
      })
    }
  }, [])

  useEffect(() => {
    if (secondsLeft === 0) {
      window.location.href = YUKTI_REDIRECT_URL
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSecondsLeft((current) => current - 1)
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [secondsLeft])

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#E6F0FA] to-[#F8FAFB] flex flex-col items-center justify-center px-4 py-8">
      <div className="mb-6 flex flex-col items-center">
        <Image
          src="/wine-yard-logo.png"
          alt="Wine Yard Technologies"
          width={140}
          height={100}
          className="object-contain"
          priority
        />
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-[#0F172A] text-center">
          Wine Yard&apos;s catalog portal has been upgraded 🚀
        </h1>

        <p className="mt-4 text-sm text-[#64748B] leading-relaxed text-center">
          Wine Yard Technologies is now using Yukti as its official platform for catalog, orders,
          and account management.
        </p>

        <ul className="mt-4 space-y-3 text-sm text-[#64748B] leading-relaxed">
          <li className="flex gap-2">
            <span className="text-[#0F172A] font-medium shrink-0">•</span>
            <span>
              <span className="font-semibold text-[#0F172A]">Same Mobile Number:</span> Log in
              directly using your registered phone number. No new setup required.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#0F172A] font-medium shrink-0">•</span>
            <span>
              <span className="font-semibold text-[#0F172A]">Complete History Preserved:</span>{' '}
              Your past invoices, order history, and outstanding dues with Wine Yard remain
              completely safe.
            </span>
          </li>
        </ul>

        <p className="mt-6 text-sm text-[#475569] text-center">
          Redirecting in {secondsLeft} seconds...
        </p>

        <a
          href={YUKTI_REDIRECT_URL}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-[#059669] px-4 py-3 text-sm font-semibold text-white transition-colors active:bg-[#047857]"
        >
          Browse Wine Yard Catalog in Yukti
        </a>

        <p className="mt-6 text-xs text-[#64748B] text-center leading-relaxed">
          Need help? Contact support on WhatsApp:{' '}
          {whatsappDisplay && whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#059669] underline underline-offset-2"
            >
              {whatsappDisplay}
            </a>
          ) : (
            <span className="font-semibold text-[#0F172A]">our support team</span>
          )}
        </p>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2">
        <span className="text-xs text-[#94A3B8]">Powered by</span>
        <Image
          src="/yukti-logo.png"
          alt="Yukti"
          width={72}
          height={24}
          className="object-contain"
        />
      </div>
    </main>
  )
}
