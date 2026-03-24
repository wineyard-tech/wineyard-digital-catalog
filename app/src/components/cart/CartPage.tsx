'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Minus, Plus, Trash2, MessageCircle, MapPin } from 'lucide-react'
import Image from 'next/image'
import { useCart } from './CartContext'
import CompleteYourOrder from './CompleteYourOrder'
import type { EnquiryResponse, OrderResponse, CartItem } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const GST_RATE = 0.18

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F3F4F6"/><text x="28" y="34" text-anchor="middle" fill="#9CA3AF" font-size="22">📷</text></svg>`
)}`

interface AuthState {
  authenticated: boolean
  contact_name?: string
}

interface EstimateBanner {
  public_id: string          // UUID — passed as estimate_id when placing order
  estimate_number: string
  zoho_sync_status: string
  expires_at: string
}

export default function CartPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { items, subtotal, updateQty, removeItem, clearCart, loadItems } = useCart()

  const [loading, setLoading] = useState(false)
  const [orderLoading, setOrderLoading] = useState(false)
  const [quoteResult, setQuoteResult] = useState<EnquiryResponse | null>(null)
  const [orderResult, setOrderResult] = useState<OrderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [showRegModal, setShowRegModal] = useState(false)
  const [estimateBanner, setEstimateBanner] = useState<EstimateBanner | null>(null)
  const [deliveryArea, setDeliveryArea] = useState<string | null>(null)

  // Read wl cookie for delivery location display
  useEffect(() => {
    try {
      const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('wl='))
      if (match) {
        const data = JSON.parse(decodeURIComponent(match.slice(3)))
        setDeliveryArea(data.area || data.city || null)
      }
    } catch { /* malformed cookie — ignore */ }
  }, [])

  const gst = Math.round(subtotal * GST_RATE)
  const total = subtotal + gst
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  // ── Check auth state on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data: AuthState) => setAuthState(data))
      .catch(() => setAuthState({ authenticated: false }))
  }, [])

  // ── Handle deep link: ?estimate_id=<uuid> ────────────────────────────────
  useEffect(() => {
    const estimateId = searchParams.get('estimate_id')
    if (!estimateId) return

    fetch(`/api/estimates/${estimateId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        loadItems(data.line_items as CartItem[])
        setEstimateBanner({
          public_id: estimateId,
          estimate_number: data.estimate_number,
          zoho_sync_status: data.zoho_sync_status,
          expires_at: data.expires_at,
        })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function requireAuth(onSuccess: () => void) {
    if (!authState?.authenticated) {
      setShowRegModal(true)
      fetch('/api/admin-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'unregistered_quote_attempt' }),
      }).catch(() => {})
      return
    }
    onSuccess()
  }

  async function handleGetQuote() {
    requireAuth(async () => {
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
        setQuoteResult(data)
        clearCart()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    })
  }

  async function handlePlaceOrder() {
    requireAuth(async () => {
      setOrderLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            estimate_id: estimateBanner?.public_id ?? undefined,
          }),
        })
        const data: OrderResponse = await res.json()

        if (!res.ok || (!data.success && !data.duplicate)) {
          throw new Error(data.error ?? 'Failed to place order')
        }

        if (data.duplicate) {
          // Same cart already ordered within 1 hour — warn and redirect to orders
          setError(`Order ${data.salesorder_number} already placed for this cart. Redirecting to your orders...`)
          setTimeout(() => router.push('/catalog/orders'), 2000)
          return
        }

        setOrderResult(data)
        clearCart()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      } finally {
        setOrderLoading(false)
      }
    })
  }

  function openAdminWhatsApp() {
    const wabaLink = process.env.NEXT_PUBLIC_WABA_LINK ?? ''
    if (wabaLink) window.open(wabaLink, '_blank')
  }

  // ── Quote success screen ──────────────────────────────────────────────────
  if (quoteResult) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', background: '#F8FAFB' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>Quotation sent!</h2>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>{quoteResult.estimate_number}</p>
        {quoteResult.sync_pending && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#D97706', background: '#FFFBEB', padding: '4px 10px', borderRadius: 6 }}>
            Quote syncing with system — we&apos;ll confirm shortly.
          </p>
        )}
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6B7280' }}>
          {quoteResult.whatsapp_sent ? 'Check your WhatsApp — your quote is on its way.' : 'Quote saved. WhatsApp delivery may be delayed.'}
        </p>
        <button
          onClick={() => router.push('/catalog')}
          style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Back to Catalog
        </button>
      </div>
    )
  }

  // ── Order success screen ──────────────────────────────────────────────────
  if (orderResult) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', background: '#F8FAFB' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>Order Placed!</h2>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>{orderResult.salesorder_number}</p>
        {orderResult.sync_pending && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#D97706', background: '#FFFBEB', padding: '4px 10px', borderRadius: 6 }}>
            Order syncing with system — we&apos;ll confirm shortly.
          </p>
        )}
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#1A1A2E', fontWeight: 500 }}>
          Our team will contact you in the next 1 hour for delivery details.
        </p>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: '#6B7280' }}>
          {orderResult.whatsapp_sent ? 'Order confirmation sent to your WhatsApp.' : 'Order saved. WhatsApp confirmation may be delayed.'}
        </p>
        <button
          onClick={() => router.push('/catalog/orders')}
          style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12, width: '100%', maxWidth: 280 }}
        >
          View My Orders
        </button>
        <button
          onClick={() => router.push('/catalog')}
          style={{ background: 'none', border: '1.5px solid #E5E7EB', color: '#6B7280', borderRadius: 10, padding: '12px 32px', fontSize: 14, cursor: 'pointer', width: '100%', maxWidth: 280 }}
        >
          Back to Catalog
        </button>
      </div>
    )
  }

  const anyLoading = loading || orderLoading
  const isButtonDisabled = anyLoading || items.length === 0

  // ── Main cart ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8FAFB' }}>

      {/* Sticky header */}
      <header style={{ position: 'sticky', top: 0, background: '#FFFFFF', borderBottom: '1px solid #F3F4F6', zIndex: 20, display: 'flex', alignItems: 'center', padding: '14px 16px' }}>
        <button onClick={() => router.back()} aria-label="Go back" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, width: 32 }}>
          <ArrowLeft size={22} color="#1A1A2E" />
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1A1A2E', flex: 1, textAlign: 'center' }}>Cart</h1>
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

        {/* Deep link estimate banner */}
        {estimateBanner && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>
              {estimateBanner.zoho_sync_status === 'pending_zoho_sync'
                ? 'Quote #pending — syncing with system...'
                : `Reviewing Quote #${estimateBanner.estimate_number}`}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
              Valid until {new Date(estimateBanner.expires_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        )}

        {/* Item list */}
        <div style={{ background: '#FFFFFF', marginTop: 8, marginBottom: 8 }}>
          {items.map((item, idx) => (
            <div
              key={item.zoho_item_id}
              style={{ display: 'flex', gap: 12, padding: '14px 16px', borderBottom: idx < items.length - 1 ? '1px solid #F3F4F6' : 'none' }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', background: '#F9FAFB', flexShrink: 0, position: 'relative' }}>
                <Image src={item.image_url || PLACEHOLDER} alt={item.item_name} fill style={{ objectFit: 'cover' }} unoptimized sizes="56px" />
              </div>

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

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#059669', borderRadius: 6, overflow: 'hidden' }}>
                  <button onClick={() => updateQty(item.zoho_item_id, item.quantity - 1)} aria-label="Decrease" style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Minus size={13} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                  <button onClick={() => updateQty(item.zoho_item_id, item.quantity + 1)} aria-label="Increase" style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={13} />
                  </button>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{fmt(item.line_total)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Complete your Order — recommendations strip */}
        <CompleteYourOrder />

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
          <MapPin size={16} color="#0066CC" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
              Delivering to {deliveryArea ?? 'your location'}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>From nearest WineYard warehouse</p>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 768, margin: '0 auto', background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px 28px', zIndex: 20 }}>
        {error && (
          <p style={{ margin: '0 0 8px', padding: '8px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, fontSize: 13 }}>
            {error}
          </p>
        )}

        {authState && !authState.authenticated && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
            Registration required to request quotes or place orders
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {/* WhatsApp Quote — outline */}
          <button
            onClick={handleGetQuote}
            disabled={isButtonDisabled}
            title={!authState?.authenticated ? 'Registration Required' : undefined}
            style={{
              flex: 1,
              background: '#FFFFFF',
              color: isButtonDisabled ? '#9CA3AF' : '#059669',
              border: `1.5px solid ${isButtonDisabled ? '#D1D5DB' : '#059669'}`,
              borderRadius: 10,
              padding: '12px 0',
              fontSize: 14,
              fontWeight: 700,
              cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {loading
              ? <span style={{ width: 16, height: 16, border: '2px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
              : <MessageCircle size={16} />
            }
            {loading ? 'Sending...' : 'Get Quote'}
          </button>

          {/* Place Order — filled */}
          <button
            onClick={handlePlaceOrder}
            disabled={isButtonDisabled}
            title={!authState?.authenticated ? 'Registration Required' : undefined}
            style={{
              flex: 1,
              background: isButtonDisabled ? '#D1D5DB' : '#059669',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              padding: '12px 0',
              fontSize: 14,
              fontWeight: 700,
              cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {orderLoading
              ? <span style={{ width: 16, height: 16, border: '2px solid #FFFFFF', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
              : null
            }
            {orderLoading ? 'Placing...' : 'Place Order →'}
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
          {itemCount} items · Share quote or place order directly
        </p>
      </div>

      {/* Registration Required modal */}
      {showRegModal && (
        <div
          onClick={() => setShowRegModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#FFFFFF', borderRadius: '16px 16px 0 0', padding: '24px 24px 40px', width: '100%', maxWidth: 768, textAlign: 'center' }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1A1A2E' }}>
              Register to Get Quotes
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6B7280', lineHeight: 1.5 }}>
              You need to be registered with WineYard Technologies to request quotes or place orders. Contact us to get set up.
            </p>
            <button
              onClick={openAdminWhatsApp}
              style={{ width: '100%', background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}
            >
              <MessageCircle size={18} />
              Contact WineYard
            </button>
            <button
              onClick={() => setShowRegModal(false)}
              style={{ width: '100%', background: 'none', border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '12px 0', fontSize: 14, color: '#6B7280', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
