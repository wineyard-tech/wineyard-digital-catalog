import type { CatalogItem } from '../../../../types/catalog'
import ProductCard from './ProductCard'
import LoadingSkeleton from '../shared/LoadingSkeleton'

interface ProductGridProps {
  items: CatalogItem[]
  loading?: boolean
  guestMode?: boolean
}

export default function ProductGrid({ items, loading = false, guestMode = false }: ProductGridProps) {
  if (loading) return <LoadingSkeleton count={6} />

  if (items.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          color: '#6B7280',
        }}
      >
        <p style={{ fontSize: 32, margin: '0 0 12px' }}>🔍</p>
        <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: '#374151' }}>No products found</p>
        <p style={{ fontSize: 13, margin: 0 }}>Try adjusting your search or filters</p>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        padding: '0 16px 16px',
      }}
    >
      {items.map((item) => (
        <ProductCard key={item.zoho_item_id} item={item} guestMode={guestMode} />
      ))}
    </div>
  )
}
