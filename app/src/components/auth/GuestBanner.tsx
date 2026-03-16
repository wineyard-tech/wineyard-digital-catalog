const wabaNumber = process.env.NEXT_PUBLIC_WABA_NUMBER ?? '91XXXXXXXXXX'

export default function GuestBanner() {
  return (
    <div
      style={{
        background: '#0066CC',
        color: '#FFFFFF',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
        <strong>Browsing as guest</strong> · Prices shown are MRP
      </p>
      <a
        href={`https://wa.me/${wabaNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flexShrink: 0,
          background: '#25D366',
          color: '#FFFFFF',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        Get your pricing →
      </a>
    </div>
  )
}
