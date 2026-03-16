'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import StatusSelect from './StatusSelect'

type EstimateStatus = 'draft' | 'received' | 'quoted' | 'confirmed' | 'fulfilled'

interface LineItem {
  item_name: string
  sku: string
  quantity: number
  rate: number
  line_total: number
}

interface Enquiry {
  id: string
  estimate_number: string
  contact_name: string
  phone: string
  item_count: number
  subtotal: number
  gst: number
  total: number
  status: EstimateStatus
  created_at: string
  line_items?: LineItem[]
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function EnquiryTable() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchEnquiries = useCallback(async () => {
    try {
      const res = await fetch('/api/admin')
      if (!res.ok) return
      const data = await res.json()
      setEnquiries(data.enquiries ?? [])
    } catch {
      // silently fail on background refresh
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEnquiries()
    intervalRef.current = setInterval(fetchEnquiries, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchEnquiries])

  async function handleStatusChange(id: string, status: EstimateStatus) {
    // Optimistic update
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)))
    try {
      await fetch(`/api/admin/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    } catch {
      fetchEnquiries() // revert on error
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280' }}>
        Loading enquiries…
      </div>
    )
  }

  if (enquiries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280' }}>
        <p style={{ fontSize: 32, margin: '0 0 12px' }}>📋</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>No enquiries yet</p>
        <p style={{ fontSize: 13 }}>Enquiries from integrators will appear here</p>
      </div>
    )
  }

  return (
    <div>
      {/* Auto-refresh indicator */}
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9CA3AF' }}>
        Auto-refreshes every 30s · {enquiries.length} enquir{enquiries.length !== 1 ? 'ies' : 'y'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enquiries.map((enquiry) => {
          const isExpanded = expandedId === enquiry.id
          return (
            <div
              key={enquiry.id}
              style={{
                background: '#FFFFFF',
                borderRadius: 12,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                overflow: 'hidden',
              }}
            >
              {/* Row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : enquiry.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 14, color: '#1A1A2E' }}>
                    {enquiry.estimate_number}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
                    {enquiry.contact_name} · {enquiry.item_count} item{enquiry.item_count !== 1 ? 's' : ''} · {timeAgo(enquiry.created_at)}
                  </p>
                </div>

                <span style={{ fontSize: 14, fontWeight: 700, color: '#0066CC', whiteSpace: 'nowrap' }}>
                  {fmt(enquiry.total)}
                </span>

                <div onClick={(e) => e.stopPropagation()}>
                  <StatusSelect
                    value={enquiry.status}
                    enquiryId={enquiry.id}
                    onChange={handleStatusChange}
                  />
                </div>

                <span style={{ fontSize: 16, color: '#9CA3AF', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  ↓
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #F3F4F6', padding: '12px 16px 16px' }}>
                  {/* WhatsApp link */}
                  <a
                    href={`https://wa.me/${enquiry.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#25D366',
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: 'none',
                      marginBottom: 12,
                    }}
                  >
                    💬 Chat with {enquiry.contact_name} ({enquiry.phone})
                  </a>

                  {/* Line items */}
                  {enquiry.line_items?.map((li, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: '6px 0',
                        borderBottom: '1px solid #F9FAFB',
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <p style={{ margin: '0 0 2px', fontWeight: 600 }}>{li.item_name}</p>
                        <p style={{ margin: 0, color: '#9CA3AF', fontSize: 11 }}>{li.sku} × {li.quantity}</p>
                      </div>
                      <span style={{ fontWeight: 600, color: '#374151' }}>{fmt(li.line_total)}</span>
                    </div>
                  ))}

                  {/* Totals */}
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
                      <span>Subtotal</span><span>{fmt(enquiry.subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
                      <span>GST (18%)</span><span>{fmt(enquiry.gst)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
                      <span>Total</span><span>{fmt(enquiry.total)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
