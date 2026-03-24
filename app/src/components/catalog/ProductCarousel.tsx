'use client'

import { useRouter } from 'next/navigation'
import type { CatalogItem } from '@/types/catalog'
import ProductCard from './ProductCard'

interface ProductCarouselProps {
  title: string
  items: CatalogItem[]
  loading?: boolean
  seeAllHref?: string
}

function CarouselSkeleton({ title }: { title?: string }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        {title ? (
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>{title}</h2>
        ) : (
          <div className="skeleton" style={{ height: 16, borderRadius: 4, width: 130 }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              flexShrink: 0,
              width: 156,
              borderRadius: 8,
              background: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <div className="skeleton" style={{ height: 120 }} />
            <div style={{ padding: '8px 10px 10px' }}>
              <div className="skeleton" style={{ height: 13, borderRadius: 4, marginBottom: 6, width: '80%' }} />
              <div className="skeleton" style={{ height: 11, borderRadius: 4, marginBottom: 8, width: '50%' }} />
              <div className="skeleton" style={{ height: 15, borderRadius: 4, width: '60%' }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ProductCarousel({ title, items, loading = false, seeAllHref }: ProductCarouselProps) {
  const router = useRouter()

  if (loading) return <CarouselSkeleton title={title || undefined} />
  if (items.length === 0) return null

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>{title}</h2>
        {seeAllHref && (
          <button
            onClick={() => router.push(seeAllHref)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: '#0066CC',
              fontWeight: 500,
              padding: 0,
            }}
          >
            See all Products &gt;
          </button>
        )}
      </div>

      {/* Horizontally scrollable row — reuses existing ProductCard */}
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
        } as React.CSSProperties}
      >
        {items.map(item => (
          <div key={item.zoho_item_id} style={{ flexShrink: 0, width: 156 }}>
            <ProductCard item={item} />
          </div>
        ))}
      </div>
    </section>
  )
}
