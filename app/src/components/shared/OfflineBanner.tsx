'use client'

import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    setIsOffline(!navigator.onLine)

    const handleOffline = () => setIsOffline(true)
    const handleOnline = () => setIsOffline(false)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="alert"
      style={{
        background: '#FEF3C7',
        borderBottom: '1px solid #FDE68A',
        color: '#92400E',
        fontSize: 13,
        fontWeight: 500,
        padding: '8px 16px',
        textAlign: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      You&apos;re offline — showing cached catalog. Connect to submit enquiries.
    </div>
  )
}
