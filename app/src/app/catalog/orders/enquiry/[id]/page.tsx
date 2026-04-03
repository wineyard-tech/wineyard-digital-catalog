'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, FileText } from 'lucide-react'
import { LineItemRow } from '@/components/orders/LineItemRow'
import { useCart } from '@/components/cart/CartContext'
import type { EnquiryDetail } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface ConfirmDialogProps {
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px 16px 0 0',
        padding: '24px 20px', width: '100%', maxWidth: 480,
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#1A1A2E' }}>
          Replace your cart?
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>
          Your current cart will be replaced with available items from this enquiry. You can then submit a new quote from the cart.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', fontSize: 14, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: '#059669', fontSize: 14, fontWeight: 600, color: '#FFFFFF', cursor: 'pointer' }}
          >
            Replace cart
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { items: cartItems, loadItems } = useCart()

  const [data, setData] = useState<EnquiryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const reorderingRef = useRef(false)

  useEffect(() => {
    fetch(`/api/enquiries/${id}`)
      .then((r) => {
        if (r.status === 403) throw new Error('Authentication required')
        if (r.status === 404) throw new Error('Enquiry not found')
        return r.json()
      })
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  // PHASE2_SO_ARCHIVE: const isConverted = data?.status === 'Converted'

  const availableItems = data?.line_items.filter((li) => li.stock_status !== 'out_of_stock') ?? []
  const unavailableCount = (data?.line_items.length ?? 0) - availableItems.length
  const allUnavailable = availableItems.length === 0 && (data?.line_items.length ?? 0) > 0

  // PHASE2_SO_ARCHIVE: const ctaLabel = isConverted ? 'Reorder' : 'Place Order'

  /* PHASE2_SO_ARCHIVE_START
  function handleCTA() {
    if (!data) return

    if (isConverted) {
      // Reorder: load available items into cart, navigate to cart
      if (availableItems.length === 0) return // guard: nothing available
      if (cartItems.length > 0) {
        setShowConfirm(true)
      } else {
        doReorder()
      }
    } else {
      // Pending / Expired: navigate to cart with estimate deep link
      router.push(`/cart?estimate_id=${data.estimate_id}`)
    }
  }
  PHASE2_SO_ARCHIVE_END */

  function handleCTA() {
    if (!data || reorderingRef.current) return
    if (availableItems.length === 0) return
    if (cartItems.length > 0) {
      setShowConfirm(true)
    } else {
      doReorder()
    }
  }

  function doReorder() {
    if (!data || reorderingRef.current) return
    reorderingRef.current = true
    loadItems(
      availableItems.map((li) => ({
        zoho_item_id: li.zoho_item_id,
        item_name: li.item_name,
        sku: li.sku,
        quantity: li.quantity,
        rate: li.rate,
        tax_percentage: 18 as const,
        line_total: li.quantity * li.rate,
        image_url: li.image_url,
      }))
    )
    router.push('/cart')
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 100 }}>
        {/* Skeleton header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#FFFFFF', borderBottom: '1px solid #F3F4F6', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="skeleton" style={{ width: 20, height: 20, borderRadius: 4 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 16, width: 120, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ height: 22, width: 64, borderRadius: 12 }} />
        </div>
        {/* Skeleton line items */}
        <div style={{ padding: '0 16px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
              <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 11, width: '40%', borderRadius: 4 }} />
              </div>
              <div className="skeleton" style={{ width: 52, height: 14, borderRadius: 4, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main style={{ maxWidth: 768, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#6B7280' }}>{error ?? 'Enquiry not found'}</p>
      </main>
    )
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    Pending:   { bg: '#FEF3C7', color: '#92400E' },
    Converted: { bg: '#D1FAE5', color: '#065F46' },
    Expired:   { bg: '#F3F4F6', color: '#6B7280' },
  }
  const chipStyle = statusColors[data.status] ?? { bg: '#F3F4F6', color: '#6B7280' }

  return (
    <main style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 100 }}>
      {/* Sticky header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
        >
          <ArrowLeft size={20} color="#1A1A2E" />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A1A2E' }}>{data.doc_number}</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>{formatDate(data.date)}</p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: chipStyle.bg, color: chipStyle.color }}>
          {data.status}
        </span>
      </div>

      {/* Unavailability warning */}
      {unavailableCount > 0 && !allUnavailable && (
        <div style={{
          margin: '12px 16px 0', padding: '10px 12px',
          background: '#FEF3C7', borderRadius: 8,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#92400E' }}>
            {unavailableCount} item{unavailableCount !== 1 ? 's are' : ' is'} currently unavailable and will not be added to your cart.
          </p>
        </div>
      )}

      {/* All unavailable warning */}
      {allUnavailable && (
        <div style={{
          margin: '12px 16px 0', padding: '10px 12px',
          background: '#FEE2E2', borderRadius: 8,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13, color: '#991B1B' }}>
            All items in this enquiry are currently out of stock.
          </p>
        </div>
      )}

      {/* Line items */}
      <div style={{ padding: '0 16px' }}>
        {data.line_items.map((li) => (
          <LineItemRow key={li.zoho_item_id} item={li} showAddToCart={false} />
        ))}
      </div>

      {/* Totals */}
      <div style={{ margin: '16px 16px 0', padding: 16, background: '#F9FAFB', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>Subtotal</span>
          <span style={{ fontSize: 13, color: '#1A1A2E' }}>{fmt(data.subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>GST (18%)</span>
          <span style={{ fontSize: 13, color: '#1A1A2E' }}>{fmt(data.tax_total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmt(data.subtotal)}</span>
        </div>
      </div>

      {/* Estimate PDF link */}
      {data.estimate_url && (
        <div style={{ margin: '12px 16px 0', textAlign: 'center' }}>
          <a
            href={data.estimate_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, color: '#0066CC',
              textDecoration: 'none',
            }}
          >
            <FileText size={15} />
            Estimate PDF
          </a>
        </div>
      )}

      {/* Fixed CTA */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxWidth: 768, margin: '0 auto',
        padding: '12px 16px 28px',
        background: '#FFFFFF',
        borderTop: '1px solid #F3F4F6',
      }}>
        <button
          onClick={handleCTA}
          disabled={allUnavailable}
          style={{
            width: '100%', padding: '14px',
            background: allUnavailable ? '#D1D5DB' : '#059669',
            border: 'none', borderRadius: 8,
            fontSize: 15, fontWeight: 700,
            color: allUnavailable ? '#6B7280' : '#FFFFFF',
            cursor: allUnavailable ? 'not-allowed' : 'pointer',
          }}
        >
          {'Reorder'}
        </button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          onConfirm={() => { setShowConfirm(false); doReorder() }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </main>
  )
}
