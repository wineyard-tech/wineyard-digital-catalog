'use client'

import { useState } from 'react'
import { Minus, Plus, Trash2, MessageCircle, X } from 'lucide-react'

const CART_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F3F4F6"/><text x="28" y="34" text-anchor="middle" fill="#D1D5DB" font-size="22">📷</text></svg>`
)}`
import { useCart } from './CartContext'
import type { EnquiryResponse } from '@/types/catalog'

interface CartSheetProps {
  open: boolean
  onClose: () => void
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const GST_RATE = 0.18

export default function CartSheet({ open, onClose }: CartSheetProps) {
  const { items, subtotal, updateQty, removeItem, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EnquiryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const gst = Math.round(subtotal * GST_RATE)
  const total = subtotal + gst

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
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to submit enquiry')
      }
      setResult(data)
      clearCart()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 50,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '85vh',
          background: '#FFFFFF',
          borderRadius: '16px 16px 0 0',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #F3F4F6',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1A1A2E' }}>Your Cart</h2>
          <button
            onClick={handleClose}
            aria-label="Close cart"
            style={{
              background: 'none',
              border: 'none',
              color: '#6B7280',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Success state */}
        {result ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1A1A2E' }}>
              Quotation sent!
            </h3>
            <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>
              {result.estimate_number}
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6B7280' }}>
              Check your WhatsApp — your quote is on its way.
            </p>
            <button
              onClick={handleClose}
              style={{
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: '12px 32px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Cart items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {items.map((item) => (
                <div
                  key={item.zoho_item_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    borderBottom: '1px solid #F9FAFB',
                  }}
                >
                  {/* Product thumbnail */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url || CART_PLACEHOLDER}
                    alt={item.item_name}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = CART_PLACEHOLDER }}
                    style={{
                      width: 56, height: 56, flexShrink: 0,
                      objectFit: 'contain', borderRadius: 8,
                      background: '#F9FAFB', padding: 4,
                      border: '1px solid #F3F4F6',
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: '0 0 2px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#1A1A2E',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.item_name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>{item.sku}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: '#0066CC' }}>
                      {fmt(item.line_total)}
                    </p>
                  </div>

                  {/* Qty controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => updateQty(item.zoho_item_id, item.quantity - 1)}
                      aria-label="Decrease"
                      style={{
                        width: 28,
                        height: 28,
                        background: '#F3F4F6',
                        border: 'none',
                        borderRadius: 6,
                        color: '#374151',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.zoho_item_id, item.quantity + 1)}
                      aria-label="Increase"
                      style={{
                        width: 28,
                        height: 28,
                        background: '#059669',
                        border: 'none',
                        borderRadius: 6,
                        color: '#FFFFFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => removeItem(item.zoho_item_id)}
                      aria-label="Remove item"
                      style={{
                        width: 28,
                        height: 28,
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals + CTA */}
            <div
              style={{
                padding: '12px 16px 24px',
                borderTop: '1px solid #E5E7EB',
                background: '#FFFFFF',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#6B7280' }}>Subtotal</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#6B7280' }}>GST (18%)</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(gst)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    borderTop: '1px solid #F3F4F6',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>Total</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0066CC' }}>{fmt(total)}</span>
                </div>
              </div>

              {error && (
                <p
                  style={{
                    margin: '0 0 10px',
                    padding: '8px 12px',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {error} —{' '}
                  <button
                    onClick={handleGetQuote}
                    style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    retry
                  </button>
                </p>
              )}

              <button
                onClick={handleGetQuote}
                disabled={loading || items.length === 0}
                style={{
                  width: '100%',
                  background: loading ? '#6B7280' : '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px 0',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        border: '2px solid rgba(255,255,255,0.4)',
                        borderTopColor: '#FFFFFF',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    Sending quote…
                  </>
                ) : (
                  <>
                    <MessageCircle size={18} />
                    Get Quote on WhatsApp
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
