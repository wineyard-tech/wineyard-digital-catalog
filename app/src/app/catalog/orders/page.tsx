'use client'

import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import type { OrderListItem } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status, syncStatus }: { status: string; syncStatus: string }) {
  const isPending = syncStatus === 'pending_zoho_sync'
  const label = isPending ? 'Syncing' : status.charAt(0).toUpperCase() + status.slice(1)
  const colors: Record<string, { bg: string; color: string }> = {
    confirmed: { bg: '#D1FAE5', color: '#065F46' },
    draft:     { bg: '#FEF9C3', color: '#92400E' },
    accepted:  { bg: '#DBEAFE', color: '#1E40AF' },
    cancelled: { bg: '#FEE2E2', color: '#991B1B' },
    Syncing:   { bg: '#F3F4F6', color: '#6B7280' },
  }
  const style = colors[isPending ? 'Syncing' : status] ?? { bg: '#F3F4F6', color: '#6B7280' }

  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: style.bg, color: style.color }}>
      {label}
    </span>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/orders')
      .then((r) => {
        if (r.status === 403) throw new Error('Please log in to view your orders.')
        return r.json()
      })
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setOrders(data.orders ?? [])
      })
      .catch((err) => setError(err.message ?? 'Failed to load orders'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <main style={{ padding: '80px 16px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ width: 24, height: 24, border: '3px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ padding: '80px 16px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <ClipboardList size={48} color="#D1D5DB" strokeWidth={1.5} style={{ marginBottom: 16 }} />
        <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>{error}</p>
      </main>
    )
  }

  if (orders.length === 0) {
    return (
      <main style={{ padding: '80px 16px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <ClipboardList size={48} color="#D1D5DB" strokeWidth={1.5} style={{ marginBottom: 16 }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E', margin: '0 0 6px' }}>No orders yet</p>
        <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
          Your placed orders will appear here.
        </p>
      </main>
    )
  }

  return (
    <main style={{ paddingBottom: 100 }}>
      {/* Page header */}
      <div style={{ padding: '20px 16px 12px', background: '#FFFFFF', borderBottom: '1px solid #F3F4F6', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1A2E' }}>My Orders</h1>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Order list */}
      <div style={{ padding: '8px 0' }}>
        {orders.map((order) => (
          <div
            key={order.id}
            style={{ background: '#FFFFFF', margin: '0 0 8px', padding: '14px 16px' }}
          >
            {/* Row 1: SO number + status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
                {order.salesorder_number}
              </span>
              <StatusBadge status={order.status} syncStatus={order.zoho_sync_status} />
            </div>

            {/* Row 2: item count + date */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                {order.estimate_number ? ` · from ${order.estimate_number}` : ''}
              </span>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                {formatDate(order.created_at)}
              </span>
            </div>

            {/* Row 3: total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>
                {fmt(order.total)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
