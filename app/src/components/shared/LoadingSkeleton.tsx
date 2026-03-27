export default function LoadingSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        padding: '0 16px',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            padding: 12,
          }}
        >
          {/* Image placeholder */}
          <div
            className="skeleton"
            style={{ height: 120, borderRadius: 8, marginBottom: 10 }}
          />
          {/* Name line */}
          <div className="skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 6, width: '80%' }} />
          {/* SKU line */}
          <div className="skeleton" style={{ height: 11, borderRadius: 4, marginBottom: 10, width: '50%' }} />
          {/* Price line */}
          <div className="skeleton" style={{ height: 16, borderRadius: 4, marginBottom: 8, width: '60%' }} />
          {/* Button */}
          <div className="skeleton" style={{ height: 36, borderRadius: 8 }} />
        </div>
      ))}
    </div>
  )
}
