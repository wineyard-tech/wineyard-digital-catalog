'use client'

import { Lock, MessageCircle } from 'lucide-react'

interface UnregisteredMessageProps {
  phoneNumber: string
  onBrowseCatalog: () => void
  onTryAgain: () => void
}

export default function UnregisteredMessage({
  phoneNumber,
  onBrowseCatalog,
  onTryAgain,
}: UnregisteredMessageProps) {
  const wabaLink = process.env.NEXT_PUBLIC_WABA_LINK ?? 'https://wa.me/91'
  const displayPhone = phoneNumber
    .replace('+91', '+91 ')
    .replace(/(\d{5})(\d{5})$/, '$1 $2')

  return (
    <div className="w-full text-center">
      <div className="w-14 h-14 bg-[#FEF2F2] rounded-full flex items-center justify-center mx-auto mb-3">
        <Lock className="w-6 h-6 text-[#DC2626]" />
      </div>
      <h2 className="text-base font-bold text-[#0F172A] mb-1">
        Number Not Registered
      </h2>
      <p className="text-sm text-[#64748B] mb-1">
        <span className="font-semibold text-[#0F172A]">{displayPhone}</span> is not
        registered with WineYard.
      </p>
      <p className="text-sm text-[#64748B] mb-6">
        Contact us on WhatsApp to get access and personalised pricing.
      </p>

      <a
        href={wabaLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 bg-[#25D366] text-white rounded-xl text-sm font-bold mb-3 no-underline active:bg-[#1EBE5A]"
      >
        <MessageCircle className="w-4 h-4" />
        Contact on WhatsApp
      </a>

      <button
        onClick={onBrowseCatalog}
        className="w-full h-12 bg-[#F1F5F9] text-[#334155] rounded-xl text-sm font-semibold mb-3 border-0 active:bg-[#E2E8F0]"
      >
        Browse Catalog (General Pricing)
      </button>

      <button
        onClick={onTryAgain}
        className="text-sm font-semibold text-[#0066CC] bg-transparent border-0 active:opacity-70"
      >
        Try a different number
      </button>
    </div>
  )
}
