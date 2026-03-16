'use client'

interface CategoryFilterProps {
  categories: string[]
  active: string | null
  onSelect: (category: string | null) => void
}

export default function CategoryFilter({ categories, active, onSelect }: CategoryFilterProps) {
  if (categories.length === 0) return null

  const all = ['All', ...categories]

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        padding: '0 16px 8px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
      aria-label="Filter by category"
    >
      {all.map((cat) => {
        const isActive = cat === 'All' ? active === null : active === cat
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat === 'All' ? null : cat)}
            style={{
              flexShrink: 0,
              background: isActive ? '#0066CC' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#374151',
              border: isActive ? '1px solid #0066CC' : '1px solid #E5E7EB',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            aria-pressed={isActive}
          >
            {cat}
          </button>
        )
      })}
    </div>
  )
}
