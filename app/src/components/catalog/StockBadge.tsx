type StockStatus = 'available' | 'limited' | 'out_of_stock'

const CONFIG: Record<StockStatus, { label: string; bg: string; color: string }> = {
  available:    { label: 'Available',     bg: '#DCFCE7', color: '#15803D' },
  limited:      { label: 'Limited Stock', bg: '#FEF3C7', color: '#B45309' },
  out_of_stock: { label: 'Out of Stock',  bg: '#F3F4F6', color: '#6B7280' },
}

export default function StockBadge({ status }: { status: StockStatus }) {
  const { label, bg, color } = CONFIG[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: bg,
        color,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </span>
  )
}
