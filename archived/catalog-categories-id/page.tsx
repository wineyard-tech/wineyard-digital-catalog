'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import type { CatalogItem } from '@/types/catalog'
import { useCart } from '../../../../components/cart/CartContext'
import ProductCard from '../../../../components/catalog/ProductCard'
import { use } from 'react'

// ── Placeholder SVG ───────────────────────────────────────────────────────────
const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="#F3F4F6"/><text x="60" y="52" text-anchor="middle" fill="#9CA3AF" font-size="24">📷</text></svg>`
)}`

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

// ── Compact card for the Bestsellers horizontal rail ─────────────────────────
function TopRailCard({ item }: { item: CatalogItem }) {
  const { items, addItem, updateQty } = useCart()
  const [imgError, setImgError] = useState(false)
  const router = useRouter()

  const cartEntry = items.find((i) => i.zoho_item_id === item.zoho_item_id)
  const qty = cartEntry?.quantity ?? 0
  const isOOS = item.stock_status === 'out_of_stock'
  const imgSrc = !imgError && item.image_url ? item.image_url : PLACEHOLDER

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation()
    if (isOOS) return
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

  function handleQtyChange(e: React.MouseEvent, newQty: number) {
    e.stopPropagation()
    updateQty(item.zoho_item_id, newQty)
  }

  return (
    <div
      onClick={() => router.push(`/product/${item.zoho_item_id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/product/${item.zoho_item_id}`)}
      style={{
        width: 140,
        flexShrink: 0,
        background: '#FFFFFF',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <div style={{ position: 'relative', height: 100, background: '#F9FAFB' }}>
        <Image
          src={imgSrc}
          alt={item.item_name}
          fill
          style={{ objectFit: 'cover' }}
          onError={() => setImgError(true)}
          sizes="140px"
          unoptimized={!item.image_url || imgError}
        />
        {isOOS && (
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            background: '#64748B', color: '#FFF', fontSize: 10, fontWeight: 600,
            padding: '3px 8px', borderRadius: '0 0 5px 5px', whiteSpace: 'nowrap',
          }}>
            Out of Stock
          </div>
        )}
        {!isOOS && qty === 0 && (
          <button onClick={handleAdd} aria-label="Add to cart"
            style={{
              position: 'absolute', bottom: 6, right: 6,
              width: 28, height: 28,
              border: '2px solid #059669', borderRadius: 6,
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <span style={{ color: '#059669', fontSize: 18, lineHeight: 1, fontWeight: 700 }}>+</span>
          </button>
        )}
        {!isOOS && qty > 0 && (
          <div onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 6, right: 6,
              display: 'flex', alignItems: 'center',
              background: '#059669', borderRadius: 6, overflow: 'hidden',
            }}>
            <button onClick={(e) => handleQtyChange(e, qty - 1)} aria-label="Decrease"
              style={{ width: 24, height: 24, background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              −
            </button>
            <span style={{ color: '#FFF', fontWeight: 700, fontSize: 12, minWidth: 16, textAlign: 'center' }}>{qty}</span>
            <button onClick={(e) => handleQtyChange(e, qty + 1)} aria-label="Increase"
              style={{ width: 24, height: 24, background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              +
            </button>
          </div>
        )}
      </div>
      <div style={{ padding: '6px 8px 8px' }}>
        <p style={{
          margin: '0 0 2px', fontSize: 12, fontWeight: 500, color: '#1A1A2E',
          lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.item_name}
        </p>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
      </div>
    </div>
  )
}

// ── Skeleton card for the Bestsellers rail ────────────────────────────────────
function RailCardSkeleton() {
  return (
    <div style={{
      width: 140, flexShrink: 0,
      background: '#FFFFFF', borderRadius: 10,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden',
    }}>
      <div className="skeleton" style={{ height: 100 }} />
      <div style={{ padding: '6px 8px 8px' }}>
        <div className="skeleton" style={{ height: 11, borderRadius: 3, marginBottom: 5, width: '80%' }} />
        <div className="skeleton" style={{ height: 11, borderRadius: 3, marginBottom: 6, width: '50%' }} />
        <div className="skeleton" style={{ height: 14, borderRadius: 3, width: '40%' }} />
      </div>
    </div>
  )
}

// ── Skeleton card for the product grid ───────────────────────────────────────
function GridCardSkeleton() {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden',
    }}>
      <div className="skeleton" style={{ height: 130 }} />
      <div style={{ padding: '8px 10px 10px' }}>
        <div className="skeleton" style={{ height: 12, borderRadius: 3, marginBottom: 5, width: '80%' }} />
        <div className="skeleton" style={{ height: 12, borderRadius: 3, marginBottom: 8, width: '50%' }} />
        <div className="skeleton" style={{ height: 16, borderRadius: 3, width: '45%' }} />
      </div>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
      {children}
    </h2>
  )
}

// ── Main Category Detail Page ─────────────────────────────────────────────────

interface PageProps { params: Promise<{ id: string }> }

const HEADER_H = 52

export default function CategoryDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()

  const [categoryName, setCategoryName] = useState<string>('')
  const [topProducts, setTopProducts] = useState<CatalogItem[]>([])
  const [allProducts, setAllProducts] = useState<CatalogItem[]>([])
  const [assocProducts, setAssocProducts] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [prodRes, assocRes] = await Promise.all([
        fetch(`/api/categories/${id}/products`),
        fetch(`/api/categories/${id}/associations`),
      ])
      const [prodData, assocData] = await Promise.all([
        prodRes.ok ? prodRes.json() : null,
        assocRes.ok ? assocRes.json() : null,
      ])
      const resolvedName: string = prodData?.category_name || assocData?.category_name || ''
      setCategoryName(resolvedName)
      if (prodData) {
        const items: CatalogItem[] = prodData.items ?? []
        setTopProducts(items.slice(0, 5))
        setAllProducts(items)
      }
      if (assocData) setAssocProducts(assocData.products ?? [])
    } catch (err) {
      console.error('Category detail fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 140 }}>

      {/* ── Fixed Header: back + category name (or skeleton) ─────────────── */}
      <header
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          maxWidth: 768, margin: '0 auto',
          height: HEADER_H,
          background: '#FFFFFF',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Back to categories"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
        >
          <ArrowLeft size={22} color="#0F172A" />
        </button>

        {loading ? (
          // Title skeleton — matches header height feel
          <div className="skeleton" style={{ height: 16, width: 140, borderRadius: 4 }} />
        ) : (
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
            {categoryName}
          </h1>
        )}
      </header>

      {/* Spacer */}
      <div style={{ height: HEADER_H }} aria-hidden="true" />

      {loading ? (
        /* ── Skeleton layout matching the actual content structure ────── */
        <>
          {/* Bestsellers rail skeleton */}
          <section style={{ marginTop: 16 }}>
            <div style={{ padding: '0 16px', marginBottom: 10 }}>
              <div className="skeleton" style={{ height: 16, width: 100, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 4, overflow: 'hidden' }}>
              {[1, 2, 3].map(i => <RailCardSkeleton key={i} />)}
            </div>
          </section>

          {/* All Products grid skeleton */}
          <section style={{ padding: '20px 12px 0' }}>
            <div style={{ marginBottom: 10 }}>
              <div className="skeleton" style={{ height: 16, width: 90, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[1, 2, 3, 4].map(i => <GridCardSkeleton key={i} />)}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* ── Bestsellers — horizontal scroll rail ──────────────────────── */}
          {topProducts.length > 0 && (
            <section style={{ marginTop: 16 }}>
              <div style={{ padding: '0 16px', marginBottom: 10 }}>
                <SectionHeading>Bestsellers</SectionHeading>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingBottom: 4,
                  scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {topProducts.map((item) => (
                  <TopRailCard key={item.zoho_item_id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* ── All Products — 2-col grid, sorted by popularity ────────────── */}
          {allProducts.length > 0 && (
            <section style={{ padding: '20px 12px 0' }}>
              <div style={{ marginBottom: 10, paddingLeft: 4 }}>
                <SectionHeading>All Products</SectionHeading>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {allProducts.map((item) => (
                  <ProductCard key={item.zoho_item_id} item={item} />
                ))}
              </div>
            </section>
          )}

          {allProducts.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              No products in this category yet.
            </div>
          )}

          {/* ── Frequently bought with [Category] ─────────────────────────── */}
          {assocProducts.length > 0 && (
            <section style={{ padding: '24px 12px 0' }}>
              <div style={{ marginBottom: 10, paddingLeft: 4 }}>
                <SectionHeading>Frequently bought with {categoryName}</SectionHeading>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {assocProducts.map((item) => (
                  <ProductCard key={item.zoho_item_id} item={item} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
