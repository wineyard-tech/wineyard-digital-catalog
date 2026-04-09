'use client'

import { useRouter, usePathname } from 'next/navigation'
import {
  pickProductImageVariant,
  PRODUCT_IMAGE_W400,
  resolveProductThumbnailUrl,
} from '@/lib/catalog/resolve-product-thumbnail-url'
import { useCart } from './CartContext'

const THUMB_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect width="28" height="28" fill="#D1FAE5"/><text x="14" y="19" text-anchor="middle" fill="#059669" font-size="14">📦</text></svg>`
)}`

interface CartBarProps { bottom?: number }

export default function CartBar({ bottom = 76 }: CartBarProps) {
  const { items, itemCount } = useCart()
  const router = useRouter()
  const pathname = usePathname()

  // Hide on Orders tab and all Estimate/Invoice detail pages
  if (itemCount === 0 || pathname.startsWith('/catalog/orders')) return null

  const thumbnails = items.slice(0, 3)

  return (
    <div
      style={{
        position: 'fixed',
        bottom,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 39,
        minWidth: 200,
      }}
    >
      <button
        onClick={() => router.push('/cart')}
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
            {thumbnails.map((item, idx) => {
              const thumb =
                pickProductImageVariant(
                  item.image_urls ?? null,
                  item.category_icon_urls ?? null,
                  PRODUCT_IMAGE_W400
                ) ?? resolveProductThumbnailUrl(item.image_url, item.category_icon_url)
              return (
              <div
                key={item.zoho_item_id}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '2px solid #047857',
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
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={item.item_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={THUMB_PLACEHOLDER} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
            )})}
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
  )
}
