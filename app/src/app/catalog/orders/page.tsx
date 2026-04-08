'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { OrdersTab } from '@/components/orders/OrdersTab'
import { EnquiriesTab } from '@/components/orders/EnquiriesTab'

type Tab = 'orders' | 'enquiries'

function TabContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab: Tab = (searchParams.get('tab') as Tab) ?? 'orders'

  function setTab(tab: Tab) {
    router.push(`/catalog/orders?tab=${tab}`, { scroll: false })
  }

  return (
    <main style={{ minHeight: '100dvh', background: '#F8FAFB', paddingBottom: 100 }}>
      {/* Page header */}
      <div style={{
        padding: '16px 16px 0',
        background: '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#1A1A2E' }}>
          My Orders
        </h1>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {(['orders', 'enquiries'] as Tab[]).map((tab) => {
            const isActive = activeTab === tab
            const label = tab === 'orders' ? 'Invoices' : 'Enquiries'
            return (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #059669' : '2px solid transparent',
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#059669' : '#6B7280',
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'orders' ? <OrdersTab /> : <EnquiriesTab />}
    </main>
  )
}

export default function OrdersPage() {
  return (
    <Suspense>
      <TabContent />
    </Suspense>
  )
}
