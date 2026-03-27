export function EnquiryRowSkeleton({ count = 4 }: { count?: number }) {
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
          {/* Row 1: estimate number + status chip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="skeleton" style={{ height: 14, width: 110, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 20, width: 64, borderRadius: 12 }} />
          </div>
          {/* Row 2: date */}
          <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 4, marginBottom: 8 }} />
          {/* Row 3: item count + amount */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="skeleton" style={{ height: 11, width: 70, borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 14, width: 56, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
