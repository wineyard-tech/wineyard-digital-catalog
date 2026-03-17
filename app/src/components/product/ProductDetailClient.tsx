'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Search, Share2, Plus, Minus, ShoppingCart } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import { useCart } from '../cart/CartContext'

interface Props { id: string }

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#F3F4F6"/><text x="200" y="140" text-anchor="middle" fill="#9CA3AF" font-size="60">📷</text><text x="200" y="180" text-anchor="middle" fill="#D1D5DB" font-size="16">No image</text></svg>`
)}`

export default function ProductDetailClient({ id }: Props) {
  const router = useRouter()
  const { items, addItem, updateQty } = useCart()
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [relatedItems, setRelatedItems] = useState<CatalogItem[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [loading, setLoading] = useState(true)

  const cartEntry = item ? items.find((i) => i.zoho_item_id === item.zoho_item_id) : null
  const qty = cartEntry?.quantity ?? 0
  const isOOS = item?.stock_status === 'out_of_stock'
  const hasDiscount = item ? item.price_type === 'custom' && item.base_rate > item.final_price : false
  const imgSrc = !imgError && item?.image_url ? item.image_url : PLACEHOLDER

  useEffect(() => {
    // Fast path: read from sessionStorage (set by ProductCard before navigating)
    try {
      const raw = sessionStorage.getItem(`catalog_product_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as CatalogItem
        setItem(parsed)
        setLoading(false)
        // Fetch related items in background
        if (parsed.category_name) {
          fetch(`/api/catalog?category=${encodeURIComponent(parsed.category_name)}`)
            .then(r => r.json())
            .then(d => setRelatedItems(
              (d.items ?? []).filter((i: CatalogItem) => i.zoho_item_id !== id).slice(0, 6)
            ))
            .catch(() => {})
        }
        return
      }
    } catch { /* ignore corrupt storage */ }

    // Fallback: fetch all items and find by ID
    fetch('/api/catalog')
      .then(r => r.json())
      .then(d => {
        const found = (d.items ?? []).find((i: CatalogItem) => i.zoho_item_id === id)
        if (found) setItem(found)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  function handleAdd() {
    if (!item || isOOS) return
    addItem({
      zoho_item_id: item.zoho_item_id,
      item_name: item.item_name,
      sku: item.sku,
      quantity: 1,
      rate: item.final_price,
      tax_percentage: 18,
      line_total: item.final_price,
      image_url: item.image_url,
    })
  }

  function navigateToRelated(related: CatalogItem) {
    sessionStorage.setItem(`catalog_product_${related.zoho_item_id}`, JSON.stringify(related))
    router.push(`/product/${related.zoho_item_id}`)
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <span style={{ fontSize: 14, color: '#6B7280' }}>Loading…</span>
      </div>
    )
  }

  /* ── Not found ── */
  if (!item) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 12 }}>
        <p style={{ fontSize: 14, color: '#6B7280' }}>Product not found.</p>
        <button onClick={() => router.back()} style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>
          Go back
        </button>
      </div>
    )
  }

  /* ── Product detail ── */
  return (
    <div style={{ maxWidth: 768, margin: '0 auto', background: '#F8FAFB', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 20, display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 12, borderBottom: '1px solid #F3F4F6' }}>
        <button onClick={() => router.back()} aria-label="Go back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ArrowLeft size={22} color="#1A1A2E" />
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => router.push('/catalog')} aria-label="Search" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Search size={20} color="#6B7280" />
        </button>
        <button
          aria-label="Share"
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: item.item_name, url: window.location.href }).catch(() => {})
            }
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <Share2 size={20} color="#6B7280" />
        </button>
      </header>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>

        {/* Product image */}
        <div style={{ background: '#FFFFFF', position: 'relative', height: 280 }}>
          <Image
            src={imgSrc}
            alt={item.item_name}
            fill
            style={{ objectFit: 'contain', padding: 24 }}
            onError={() => setImgError(true)}
            unoptimized={!item.image_url || imgError}
            sizes="768px"
            priority
          />
          {/* Carousel dots (single image placeholder) */}
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0066CC' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D1D5DB' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D1D5DB' }} />
          </div>
        </div>

        {/* Product info */}
        <div style={{ background: '#FFFFFF', padding: '16px 16px 12px', borderBottom: '1px solid #F3F4F6' }}>
          {item.brand && (
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {item.brand}
            </p>
          )}
          <h1 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.3 }}>
            {item.item_name}
          </h1>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>
            {item.sku}{item.category_name ? ` · ${item.category_name}` : ''}
          </p>

          {/* Price row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
            {hasDiscount && (
              <>
                <span style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(item.base_rate)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: '#F0FDF4', padding: '2px 8px', borderRadius: 99 }}>
                  {Math.round((1 - item.final_price / item.base_rate) * 100)}% OFF
                </span>
              </>
            )}
          </div>

          {/* Stock status hint */}
          {item.stock_status === 'available' && item.available_stock > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#059669', fontWeight: 500 }}>
              ✓ In stock ({item.available_stock} units)
            </p>
          )}
          {item.stock_status === 'limited' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#B45309', fontWeight: 500 }}>
              ⚠ Limited — only {item.available_stock} left
            </p>
          )}
          {isOOS && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748B', fontWeight: 500 }}>
              Currently out of stock
            </p>
          )}
        </div>

        {/* Product Details accordion */}
        <div style={{ background: '#FFFFFF', marginTop: 8 }}>
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>Product Details</span>
            <span style={{ fontSize: 18, color: '#6B7280', display: 'inline-block', transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>⌄</span>
          </button>
          {detailsOpen && (
            <div style={{ padding: '12px 16px 14px' }}>
              {(([
                ['SKU', item.sku],
                item.brand ? ['Brand', item.brand] : null,
                item.category_name ? ['Category', item.category_name] : null,
                ['Tax', `${item.tax_percentage}% GST`],
                ['Stock', `${item.available_stock} units`],
              ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#6B7280', minWidth: 80 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#1A1A2E' }}>{value}</span>
                </div>
              )))}
            </div>
          )}
        </div>

        {/* People also buy */}
        {relatedItems.length > 0 && (
          <div style={{ marginTop: 8, background: '#FFFFFF', padding: '14px 0' }}>
            <p style={{ margin: '0 0 10px', padding: '0 16px', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
              People also buy
            </p>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
              {relatedItems.map((related) => (
                <button
                  key={related.zoho_item_id}
                  onClick={() => navigateToRelated(related)}
                  style={{ flexShrink: 0, width: 100, background: '#F8FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8, cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ height: 60, position: 'relative', marginBottom: 6 }}>
                    <Image
                      src={related.image_url || PLACEHOLDER}
                      alt={related.item_name}
                      fill
                      style={{ objectFit: 'contain' }}
                      unoptimized
                      sizes="100px"
                    />
                  </div>
                  <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 500, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {related.item_name}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#1A1A2E' }}>
                    {fmt(related.final_price)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 768, margin: '0 auto', background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px 24px', zIndex: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Price in footer */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
            {hasDiscount && (
              <span style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(item.base_rate)}</span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>incl. {item.tax_percentage}% GST</p>
        </div>

        {/* Add / Qty CTA */}
        {isOOS ? (
          <button disabled style={{ flex: 1, background: '#F3F4F6', color: '#9CA3AF', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700 }}>
            Out of Stock
          </button>
        ) : qty === 0 ? (
          <button
            onClick={handleAdd}
            style={{ flex: 1, background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={16} />
            Add
          </button>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#059669', borderRadius: 10, padding: '8px 16px' }}>
            <button onClick={() => updateQty(item.zoho_item_id, qty - 1)} aria-label="Decrease" style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <Minus size={18} />
            </button>
            <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 16 }}>{qty}</span>
            <button onClick={() => updateQty(item.zoho_item_id, qty + 1)} aria-label="Increase" style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <Plus size={18} />
            </button>
          </div>
        )}

        {/* View cart shortcut — only when item is in cart */}
        {qty > 0 && (
          <button
            onClick={() => router.push('/cart')}
            aria-label="View cart"
            style={{ width: 44, height: 44, background: '#E6F0FA', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ShoppingCart size={20} color="#0066CC" />
          </button>
        )}
      </div>
    </div>
  )
}
