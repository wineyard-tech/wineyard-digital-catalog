'use client'

import { useState } from 'react'
import { useCart } from './CartContext'
import CartSheet from './CartSheet'

export default function CartBar() {
  const { items, itemCount } = useCart()
  const [open, setOpen] = useState(false)

  if (itemCount === 0) return null

  const thumbnails = items.slice(0, 3)

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 40,
          minWidth: 200,
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="View cart"
          style={{
            background: '#059669',
            border: 'none',
            borderRadius: 999,
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            width: '100%',
            justifyContent: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {/* Overlapping product thumbnails */}
          {thumbnails.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {thumbnails.map((item, idx) => (
                <div
                  key={item.zoho_item_id}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: '2px solid #059669',
                    background: '#F0FDF4',
                    overflow: 'hidden',
                    marginLeft: idx === 0 ? 0 : -10,
                    position: 'relative',
                    zIndex: thumbnails.length - idx,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.item_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 12 }}>🛒</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>View Cart</span>

          <span
            style={{
              background: 'rgba(255,255,255,0.25)',
              color: '#FFFFFF',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 8px',
            }}
          >
            {itemCount}
          </span>
        </button>
      </div>

      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
