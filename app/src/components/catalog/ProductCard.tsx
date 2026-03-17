'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import { useCart } from '../cart/CartContext'

interface ProductCardProps {
  item: CatalogItem
  guestMode?: boolean
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#F3F4F6"/><text x="100" y="55" text-anchor="middle" fill="#9CA3AF" font-size="36">📷</text><text x="100" y="80" text-anchor="middle" fill="#D1D5DB" font-size="11">No image</text></svg>`)}`

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const BADGE_CONFIG = {
  available:    { label: 'Available',     bg: '#059669' },
  limited:      { label: 'Limited Stock', bg: '#B45309' },
  out_of_stock: { label: 'Out of Stock',  bg: '#64748B' },
}

export default function ProductCard({ item, guestMode = false }: ProductCardProps) {
  const { items, addItem, updateQty } = useCart()
  const [imgError, setImgError] = useState(false)

  const cartEntry = items.find((i) => i.zoho_item_id === item.zoho_item_id)
  const qty = cartEntry?.quantity ?? 0

  function handleAdd() {
    if (guestMode || isOOS) return
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

  const isOOS = item.stock_status === 'out_of_stock'
  const imgSrc = !imgError && item.image_url ? item.image_url : PLACEHOLDER
  const badge = BADGE_CONFIG[item.stock_status]

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Product image with overlaid badge + cart controls */}
      <div style={{ position: 'relative', height: 120, background: '#F9FAFB' }}>
        <Image
          src={imgSrc}
          alt={item.item_name}
          fill
          style={{ objectFit: 'contain', padding: 8 }}
          onError={() => setImgError(true)}
          sizes="(max-width: 640px) 50vw, 33vw"
          unoptimized={!item.image_url || imgError}
        />

        {/* Stock badge — top-left, rounded-b-md (bottom corners only) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            background: badge.bg,
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '0 0 6px 0',
            letterSpacing: '0.02em',
          }}
        >
          {badge.label}
        </div>

        {/* Cart controls — bottom-right inside image */}
        {!guestMode && (
          qty === 0 ? (
            <button
              onClick={handleAdd}
              disabled={isOOS}
              aria-label="Add to cart"
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                width: 32,
                height: 32,
                border: `2px solid ${isOOS ? '#9CA3AF' : '#059669'}`,
                borderRadius: 6,
                background: 'transparent',
                cursor: isOOS ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isOOS ? 0.5 : 1,
              }}
            >
              <Plus size={16} color={isOOS ? '#9CA3AF' : '#059669'} />
            </button>
          ) : (
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                display: 'flex',
                alignItems: 'center',
                background: '#059669',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => updateQty(item.zoho_item_id, qty - 1)}
                aria-label="Decrease quantity"
                style={{
                  width: 28,
                  height: 28,
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Minus size={14} />
              </button>
              <span
                style={{
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 13,
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {qty}
              </span>
              <button
                onClick={() => updateQty(item.zoho_item_id, qty + 1)}
                aria-label="Increase quantity"
                style={{
                  width: 28,
                  height: 28,
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          )
        )}
      </div>

      {/* Card content */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p
          style={{
            margin: '0 0 2px',
            fontSize: 14,
            fontWeight: 500,
            color: '#1A1A2E',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.item_name}
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9CA3AF' }}>{item.sku}</p>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0066CC' }}>{fmt(item.final_price)}</span>
          {item.price_type === 'custom' && item.base_rate !== item.final_price && (
            <span style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>
              {fmt(item.base_rate)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
