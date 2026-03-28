export function OrderRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: '#FFFFFF',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '14px 16px',
          }}
        >
          {/* Row 1: invoice number + date */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="skeleton" style={{ height: 14, width: 120, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 4 }} />
          </div>
          {/* Row 2: item count + total amount */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="skeleton" style={{ height: 11, width: 70, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
