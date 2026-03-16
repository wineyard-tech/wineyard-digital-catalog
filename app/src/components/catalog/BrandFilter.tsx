'use client'

interface BrandFilterProps {
  brands: string[]
  active: string | null
  onSelect: (brand: string | null) => void
}

export default function BrandFilter({ brands, active, onSelect }: BrandFilterProps) {
  if (brands.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '0 16px 12px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
      aria-label="Filter by brand"
    >
      {brands.map((brand) => {
        const isActive = active === brand
        return (
          <button
            key={brand}
            onClick={() => onSelect(isActive ? null : brand)}
            style={{
              flexShrink: 0,
              background: isActive ? '#E6F0FA' : '#FFFFFF',
              color: isActive ? '#0066CC' : '#6B7280',
              border: isActive ? '1px solid #0066CC' : '1px solid #E5E7EB',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            aria-pressed={isActive}
          >
            {brand}
          </button>
        )
      })}
    </div>
  )
}
