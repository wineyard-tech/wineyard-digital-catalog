'use client'

import { useCart } from '../cart/CartContext'

export interface LineItem {
  zoho_item_id: string
  item_name: string
  sku: string
  quantity: number
  rate: number
  tax_percentage: number
  line_total: number
  image_url?: string | null
  stock_status?: 'available' | 'limited' | 'out_of_stock' | 'unknown'
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="#F3F4F6"/><text x="24" y="30" text-anchor="middle" font-size="22">🍷</text></svg>`
)}`

export function LineItemRow({ item }: { item: LineItem }) {
  const { addItem } = useCart()
  const isOOS = item.stock_status === 'out_of_stock'
  const isLimited = item.stock_status === 'limited'

  function handleAdd() {
    if (isOOS) return
    addItem({
      zoho_item_id: item.zoho_item_id,
      item_name: item.item_name,
      sku: item.sku,
      quantity: 1,
      rate: item.rate,
      tax_percentage: 18,
      line_total: item.rate,
      image_url: item.image_url,
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
      {/* Product image */}
      <img
        src={item.image_url ?? PLACEHOLDER}
        alt={item.item_name}
        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER }}
        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: '#F9FAFB' }}
      />

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 500, color: '#1A1A2E', lineHeight: 1.3 }}>
          {item.item_name}
        </p>
        <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF' }}>
          {item.sku} · {item.quantity} × {fmt(item.rate)}
        </p>
        {isOOS && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: 4 }}>
            Unavailable
          </span>
        )}
        {isLimited && !isOOS && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 4 }}>
            Low stock
          </span>
        )}
      </div>

      {/* Right side: total + add button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{fmt(item.line_total)}</span>
        <button
          onClick={handleAdd}
          disabled={isOOS}
          aria-label={`Add ${item.item_name} to cart`}
          style={{
            fontSize: 12, fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${isOOS ? '#D1D5DB' : '#059669'}`,
            background: 'transparent',
            color: isOOS ? '#9CA3AF' : '#059669',
            cursor: isOOS ? 'not-allowed' : 'pointer',
          }}
        >
          + Cart
        </button>
      </div>
    </div>
  )
}
