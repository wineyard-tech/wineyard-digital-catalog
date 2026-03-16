'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { CatalogItem } from '../../../../types/catalog'
import StockBadge from './StockBadge'
import { useCart } from '../cart/CartContext'

interface ProductCardProps {
  item: CatalogItem
  guestMode?: boolean
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#F3F4F6"/><text x="100" y="55" text-anchor="middle" fill="#9CA3AF" font-size="36">📷</text><text x="100" y="80" text-anchor="middle" fill="#D1D5DB" font-size="11">No image</text></svg>`)}`

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function ProductCard({ item, guestMode = false }: ProductCardProps) {
  const { items, addItem, updateQty } = useCart()
  const [imgError, setImgError] = useState(false)

  const cartEntry = items.find((i) => i.zoho_item_id === item.zoho_item_id)
  const qty = cartEntry?.quantity ?? 0

  function handleAdd() {
    if (guestMode || qty > 0) return
    addItem({
      zoho_item_id: item.zoho_item_id,
      item_name: item.item_name,
      sku: item.sku,
      quantity: 1,
      rate: item.final_price,
      tax_percentage: 18,
      line_total: item.final_price,
    })
  }

  const isOOS = item.stock_status === 'out_of_stock'
  const priceLabel = item.price_type === 'custom' ? 'Your Price' : 'MRP'
  const imgSrc = !imgError && item.image_url ? item.image_url : PLACEHOLDER

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Product image */}
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
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p
          style={{
            margin: '0 0 2px',
            fontSize: 13,
            fontWeight: 600,
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
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#9CA3AF' }}>{item.sku}</p>

        <div style={{ marginBottom: 8 }}>
          <StockBadge status={item.stock_status} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>{priceLabel} </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0066CC' }}>{fmt(item.final_price)}</span>
        </div>

        {/* Add to cart / qty controls */}
        {guestMode ? (
          <button
            disabled
            title="WhatsApp us to register and get your custom pricing"
            style={{
              width: '100%',
              background: '#F3F4F6',
              color: '#9CA3AF',
              border: 'none',
              borderRadius: 8,
              padding: '9px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'not-allowed',
            }}
          >
            Register to Order
          </button>
        ) : qty === 0 ? (
          <button
            onClick={handleAdd}
            disabled={isOOS}
            style={{
              width: '100%',
              background: isOOS ? '#F3F4F6' : '#059669',
              color: isOOS ? '#9CA3AF' : '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              padding: '9px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: isOOS ? 'not-allowed' : 'pointer',
            }}
          >
            {isOOS ? 'Out of Stock' : 'Add to Cart'}
          </button>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#E6F0FA',
              borderRadius: 8,
              padding: '4px 8px',
            }}
          >
            <button
              onClick={() => updateQty(item.zoho_item_id, qty - 1)}
              aria-label="Decrease quantity"
              style={{
                width: 28,
                height: 28,
                background: '#FFFFFF',
                border: '1px solid #0066CC',
                borderRadius: 6,
                color: '#0066CC',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              −
            </button>
            <span style={{ fontWeight: 700, color: '#0066CC', fontSize: 15, minWidth: 24, textAlign: 'center' }}>
              {qty}
            </span>
            <button
              onClick={() => updateQty(item.zoho_item_id, qty + 1)}
              aria-label="Increase quantity"
              style={{
                width: 28,
                height: 28,
                background: '#0066CC',
                border: 'none',
                borderRadius: 6,
                color: '#FFFFFF',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
