'use client'

import { useState } from 'react'
import { useCart } from './CartContext'
import CartSheet from './CartSheet'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function CartBar() {
  const { itemCount, subtotal } = useCart()
  const [open, setOpen] = useState(false)

  if (itemCount === 0) return null

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#0066CC',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 40,
          boxShadow: '0 -2px 16px rgba(0,102,204,0.25)',
        }}
      >
        <div style={{ color: '#FFFFFF' }}>
          <span
            style={{
              background: '#FFFFFF',
              color: '#0066CC',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
              marginRight: 8,
            }}
          >
            {itemCount}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>item{itemCount !== 1 ? 's' : ''} in cart</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: '#FFFFFF',
            color: '#0066CC',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          aria-label="View cart"
        >
          {fmt(subtotal)}
          <span style={{ fontSize: 16 }}>›</span>
        </button>
      </div>

      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
