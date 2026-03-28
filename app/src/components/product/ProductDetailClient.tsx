'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Search, Plus, Minus, X } from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import { useCart } from '../cart/CartContext'
import CartBar from '../cart/CartBar'
import ProductCard from '../catalog/ProductCard'

interface Props { id: string }

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#F3F4F6"/><text x="240" y="220" text-anchor="middle" fill="#9CA3AF" font-size="72">📷</text><text x="240" y="268" text-anchor="middle" fill="#D1D5DB" font-size="20">No image</text></svg>`
)}`

export default function ProductDetailClient({ id }: Props) {
  const router = useRouter()
  const { items, addItem, updateQty } = useCart()
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [fbtItems, setFbtItems] = useState<CatalogItem[]>([])
  const [moreCategoryItems, setMoreCategoryItems] = useState<CatalogItem[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cartEntry = item ? items.find((i) => i.zoho_item_id === item.zoho_item_id) : null
  const qty = cartEntry?.quantity ?? 0
  const hasDiscount = item ? item.price_type === 'custom' && item.base_rate > item.final_price : false
  const imgSrc = !imgError && item?.image_url
    ? item.image_url
    : item?.category_icon_url ?? PLACEHOLDER

  useEffect(() => {
    // Fast path: read from sessionStorage (set by ProductCard before navigating)
    try {
      const raw = sessionStorage.getItem(`catalog_product_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as CatalogItem
        setItem(parsed)
        setLoading(false)
        // Fetch recommendation sections in background
        fetch(`/api/recommendations/frequently-bought-together?product_id=${encodeURIComponent(id)}`)
          .then(r => r.json())
          .then(d => setFbtItems(d.items ?? []))
          .catch(() => {})

        if (parsed.category_name) {
          fetch(`/api/recommendations/more-in-category?product_id=${encodeURIComponent(id)}&category=${encodeURIComponent(parsed.category_name)}`)
            .then(r => r.json())
            .then(d => setMoreCategoryItems(d.items ?? []))
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
        if (found) {
          setItem(found)
          fetch(`/api/recommendations/frequently-bought-together?product_id=${encodeURIComponent(id)}`)
            .then(r => r.json())
            .then(rec => setFbtItems(rec.items ?? []))
            .catch(() => {})
          if (found.category_name) {
            fetch(`/api/recommendations/more-in-category?product_id=${encodeURIComponent(id)}&category=${encodeURIComponent(found.category_name)}`)
              .then(r => r.json())
              .then(rec => setMoreCategoryItems(rec.items ?? []))
              .catch(() => {})
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchLoading(true)
      fetch(`/api/catalog?q=${encodeURIComponent(searchQuery.trim())}`)
        .then(r => r.ok ? r.json() : { items: [] })
        .then(data => setSearchResults(data.items ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery])

  function handleAdd() {
    if (!item) return
    addItem({
      zoho_item_id: item.zoho_item_id,
      item_name: item.item_name,
      sku: item.sku,
      quantity: 1,
      rate: item.final_price,
      tax_percentage: 18,
      line_total: item.final_price,
      image_url: item.image_url ?? item.category_icon_url,
    })
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
      <header style={{ position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 20, borderBottom: '1px solid #F3F4F6' }}>
        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
            <button
              data-no-haptic
              onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}
              aria-label="Close search"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
            >
              <ArrowLeft size={22} color="#1A1A2E" />
            </button>
            <div style={{ flex: 1, position: 'relative' }}>
              {/* Outer span: centering only */}
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                <Search size={15} color="#9CA3AF" />
              </span>
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products, SKU, brand…"
                style={{
                  width: '100%', boxSizing: 'border-box' as const,
                  background: '#F3F4F6', border: 'none', borderRadius: 10,
                  padding: '9px 32px 9px 30px', fontSize: 14,
                  color: '#1A1A2E', outline: 'none',
                }}
                aria-label="Search products"
              />
              {searchQuery && (
                <button
                  data-no-haptic
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear"
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
                >
                  <X size={14} color="#9CA3AF" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 12 }}>
            <button onClick={() => router.back()} aria-label="Go back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <ArrowLeft size={22} color="#1A1A2E" />
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setSearchOpen(true)} aria-label="Search" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <Search size={20} color="#6B7280" />
            </button>
          </div>
        )}
      </header>

      {/* Search results overlay — replaces body when search is open */}
      {searchOpen && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100, background: '#FFFFFF' }}>
          {!searchQuery.trim() ? (
            <p style={{ padding: '32px 16px', textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
              Type to search products
            </p>
          ) : searchLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ borderRadius: 12, height: 200 }} />
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <p style={{ padding: '32px 16px', textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
              No products found for &ldquo;{searchQuery}&rdquo;
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12 }}>
              {searchResults.map(r => (
                <ProductCard key={r.zoho_item_id} item={r} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scrollable body — hidden when search is open */}
      {!searchOpen && <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>

        {/* Product image — square 1:1 container, capped at 480px */}
        <div style={{ background: '#FFFFFF', position: 'relative', aspectRatio: '1 / 1', maxHeight: 480 }}>
          <Image
            src={imgSrc}
            alt={item.item_name}
            fill
            style={{ objectFit: 'contain', padding: 8 }}
            onError={() => setImgError(true)}
            unoptimized={!item.image_url || imgError}
            sizes="(max-width: 640px) 100vw, 480px"
            priority
          />
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

        {/* Frequently Bought Together */}
        {fbtItems.length > 0 && (
          <div style={{ marginTop: 8, background: '#FFFFFF', padding: '14px 0' }}>
            <p style={{ margin: '0 0 10px', padding: '0 16px', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
              Frequently Bought Together
            </p>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 4px', scrollbarWidth: 'none' }}>
              {fbtItems.map((related) => (
                <div key={related.zoho_item_id} style={{ flexShrink: 0, width: 160 }}>
                  <ProductCard item={related} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* More in [Category Name] */}
        {moreCategoryItems.length > 0 && item.category_name && (
          <div style={{ marginTop: 8, background: '#FFFFFF', padding: '14px 0' }}>
            <p style={{ margin: '0 0 10px', padding: '0 16px', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
              More in {item.category_name}
            </p>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 4px', scrollbarWidth: 'none' }}>
              {moreCategoryItems.map((related) => (
                <div key={related.zoho_item_id} style={{ flexShrink: 0, width: 160 }}>
                  <ProductCard item={related} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>}

      {/* Floating CartBar — shows above bottom bar when cart has items */}
      {!searchOpen && <CartBar bottom={88} />}

      {/* Sticky bottom bar — hidden when search is open */}
      {!searchOpen && <>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 768, margin: '0 auto', background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px 24px', zIndex: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Price in footer */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
            {hasDiscount && (
              <span style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(item.base_rate)}</span>
            )}
          </div>
        </div>

        {/* Add / Qty CTA — compact fixed width */}
        {qty === 0 ? (
          <button
            onClick={handleAdd}
            style={{ width: 130, background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={15} />
            Add
          </button>
        ) : (
          <div style={{ width: 130, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#059669', borderRadius: 10, padding: '8px 14px' }}>
            <button onClick={() => updateQty(item.zoho_item_id, qty - 1)} aria-label="Decrease" style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <Minus size={16} />
            </button>
            <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 15 }}>{qty}</span>
            <button onClick={() => updateQty(item.zoho_item_id, qty + 1)} aria-label="Increase" style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <Plus size={16} />
            </button>
          </div>
        )}
      </div></>}
    </div>
  )
}
