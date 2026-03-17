'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Minus, Plus, Trash2, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { useCart } from './CartContext'
import type { EnquiryResponse } from '../../../../types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const GST_RATE = 0.18

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F3F4F6"/><text x="28" y="34" text-anchor="middle" fill="#9CA3AF" font-size="22">📷</text></svg>`
)}`

export default function CartPage() {
  const router = useRouter()
  const { items, subtotal, updateQty, removeItem, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EnquiryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const gst = Math.round(subtotal * GST_RATE)
  const total = subtotal + gst
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  async function handleGetQuote() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data: EnquiryResponse = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to submit enquiry')
      setResult(data)
      clearCart()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Success screen ── */
  if (result) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', background: '#F8FAFB' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>Quotation sent!</h2>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>{result.estimate_number}</p>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6B7280' }}>Check your WhatsApp — your quote is on its way.</p>
        <button
          onClick={() => router.push('/catalog')}
          style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Back to Catalog
        </button>
      </div>
    )
  }

  /* ── Main cart ── */
  return (
    <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8FAFB' }}>

      {/* Sticky header */}
      <header style={{ position: 'sticky', top: 0, background: '#FFFFFF', borderBottom: '1px solid #F3F4F6', zIndex: 20, display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
        <button onClick={() => router.back()} aria-label="Go back" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, width: 32 }}>
          <ArrowLeft size={22} color="#1A1A2E" />
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1A1A2E', flex: 1, textAlign: 'center' }}>Cart</h1>
        {/* Clear Cart */}
        <button
          onClick={clearCart}
          disabled={items.length === 0}
          style={{ background: 'none', border: 'none', cursor: items.length === 0 ? 'default' : 'pointer', color: items.length === 0 ? '#D1D5DB' : '#EF4444', fontSize: 13, fontWeight: 600, padding: '4px 0', width: 48, textAlign: 'right' }}
        >
          Clear
        </button>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>

        {/* Item list */}
        <div style={{ background: '#FFFFFF', marginBottom: 8 }}>
          {items.map((item, idx) => (
            <div
              key={item.zoho_item_id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '14px 16px',
                borderBottom: idx < items.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              {/* Thumbnail */}
              <div style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', background: '#F9FAFB', flexShrink: 0, position: 'relative' }}>
                <Image
                  src={item.image_url || PLACEHOLDER}
                  alt={item.item_name}
                  fill
                  style={{ objectFit: 'cover' }}
                  unoptimized
                  sizes="56px"
                />
              </div>

              {/* Name + SKU + Delete */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 500, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.item_name}
                </p>
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#9CA3AF' }}>{item.sku}</p>
                <button
                  onClick={() => removeItem(item.zoho_item_id)}
                  aria-label="Remove item"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Qty selector + subtotal */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#059669', borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    onClick={() => updateQty(item.zoho_item_id, item.quantity - 1)}
                    aria-label="Decrease"
                    style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={13} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', minWidth: 20, textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(item.zoho_item_id, item.quantity + 1)}
                    aria-label="Increase"
                    style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
                  {fmt(item.line_total)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bill Details */}
        <div style={{ margin: '0 16px 8px', background: '#FFFFFF', borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Bill Details</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#6B7280' }}>Total Amount ({itemCount} items)</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A2E' }}>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#6B7280' }}>GST (18%)</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A2E' }}>{fmt(gst)}</span>
          </div>
          <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>To Pay</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Delivery location */}
        <div style={{ margin: '0 16px 16px', background: '#FFFFFF', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>📍</span>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
              Delivery to Himayatnagar Warehouse
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
              From WineYard Outlet, Banjara Hills
            </p>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 768, margin: '0 auto', background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px 28px', zIndex: 20 }}>
        {error && (
          <p style={{ margin: '0 0 8px', padding: '8px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, fontSize: 13 }}>
            {error} —{' '}
            <button onClick={handleGetQuote} style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              retry
            </button>
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {/* WhatsApp Quote — outline */}
          <button
            onClick={handleGetQuote}
            disabled={loading || items.length === 0}
            style={{ flex: 1, background: '#FFFFFF', color: '#059669', border: '1.5px solid #059669', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <MessageCircle size={16} />
            WhatsApp Quote
          </button>
          {/* Place Order — filled */}
          <button
            onClick={() => alert('Order placement coming soon!')}
            disabled={loading || items.length === 0}
            style={{ flex: 1, background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            Place Order →
          </button>
        </div>

        {/* Subtext */}
        <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
          {itemCount} items · Share quote or place order directly
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
