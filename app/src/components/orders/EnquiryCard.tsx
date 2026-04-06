'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import type { EnquiryListItem } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const chipStyle: Record<string, CSSProperties> = {
  draft:    { background: '#F3F4F6', color: '#6B7280' },
  sent:     { background: '#FEF3C7', color: '#92400E' },
  accepted: { background: '#D1FAE5', color: '#065F46' },
  invoiced: { background: '#DBEAFE', color: '#1E40AF' },
  declined: { background: '#FEE2E2', color: '#991B1B' },
  expired:  { background: '#F3F4F6', color: '#6B7280' },
}

export function EnquiryCard({ item }: { item: EnquiryListItem }) {
  const router = useRouter()

  function handleClick() {
    router.push(`/catalog/orders/enquiry/${item.id}`)
  }

  const chip = chipStyle[item.status] ?? { background: '#F3F4F6', color: '#6B7280' }

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      style={{
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        padding: '14px 16px',
        cursor: 'pointer',
      }}
    >
      {/* Row 1: estimate number + status chip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{item.doc_number}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, ...chip }}>
          {item.status.toUpperCase()}
        </span>
      </div>

      {/* Row 2: item count + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#6B7280' }}>
          {item.item_count > 0 ? `${item.item_count} item${item.item_count !== 1 ? 's' : ''}` : '—'}
        </span>
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(item.date)}</span>
      </div>

      {/* Row 3: total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmt(item.total)}</span>
      </div>
    </div>
  )
}
