'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Minus, Bell } from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import { useCart } from '../cart/CartContext'

interface ProductCardProps {
  item: CatalogItem
  guestMode?: boolean
  disableNavigation?: boolean
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#F3F4F6"/><text x="100" y="90" text-anchor="middle" fill="#9CA3AF" font-size="36">📷</text><text x="100" y="116" text-anchor="middle" fill="#D1D5DB" font-size="11">No image</text></svg>`
)}`

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function ProductCard({ item, guestMode = false, disableNavigation = false }: ProductCardProps) {
  const { items, addItem, updateQty } = useCart()
  const [imgError, setImgError] = useState(false)
  const router = useRouter()

  const cartEntry = items.find((i) => i.zoho_item_id === item.zoho_item_id)
  const qty = cartEntry?.quantity ?? 0
  const isOOS = item.stock_status === 'out_of_stock'
  const imgSrc = !imgError && item.image_url
    ? item.image_url
    : item.category_icon_url ?? PLACEHOLDER
  const hasDiscount = item.price_type === 'custom' && item.base_rate > item.final_price

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation()
    if (guestMode || isOOS) return
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

  function handleNotify(e: React.MouseEvent) {
    e.stopPropagation()
    alert(`We'll notify you when ${item.item_name} is back in stock!`)
  }

  function handleQtyChange(e: React.MouseEvent, newQty: number) {
    e.stopPropagation()
    updateQty(item.zoho_item_id, newQty)
  }

  function handleCardClick() {
    if (disableNavigation) return
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`catalog_product_${item.zoho_item_id}`, JSON.stringify(item))
    }
    router.push(`/product/${item.zoho_item_id}`)
  }

  return (
    <div
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
      style={{
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      {/* Thumbnail — square container, contain so full product is always visible */}
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#F9FAFB' }}>
        <Image
          src={imgSrc}
          alt={item.item_name}
          fill
          style={{ objectFit: 'contain', padding: 8 }}
          onError={() => setImgError(true)}
          sizes="(max-width: 640px) 160px, 220px"
          unoptimized={!item.image_url || imgError}
        />

        {/* OOS-only badge — auto-width, centered over thumbnail */}
        {isOOS && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#64748B',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '0 0 6px 6px',
              letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
            }}
          >
            Out of Stock
          </div>
        )}

        {/* Cart controls — bottom-right inside image */}
        {!guestMode && (
          <>
            {isOOS ? (
              <button
                onClick={handleNotify}
                aria-label="Notify when available"
                style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 32, height: 32,
                  border: 'none', borderRadius: 6,
                  background: '#B45309', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(180,83,9,0.4)',
                }}
              >
                <Bell size={15} color="#FFFFFF" />
              </button>
            ) : qty === 0 ? (
              <button
                onClick={handleAdd}
                aria-label="Add to cart"
                style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 32, height: 32,
                  border: 'none', borderRadius: 6,
                  background: '#059669', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(5,150,105,0.4)',
                }}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
              </button>
            ) : (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 8, right: 8,
                  display: 'flex', alignItems: 'center',
                  background: '#059669', borderRadius: 6, overflow: 'hidden',
                }}
              >
                <button onClick={(e) => handleQtyChange(e, qty - 1)} aria-label="Decrease quantity"
                  style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Minus size={14} />
                </button>
                <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 13, minWidth: 18, textAlign: 'center' }}>{qty}</span>
                <button onClick={(e) => handleQtyChange(e, qty + 1)} aria-label="Increase quantity"
                  style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card content */}
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{
          margin: '0 0 2px', fontSize: 14, fontWeight: 500, color: '#1A1A2E',
          lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.item_name}
        </p>
        {item.brand && (
          <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF', lineHeight: 1.2 }}>
            {item.brand}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
          {hasDiscount && (
            <span style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(item.base_rate)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
