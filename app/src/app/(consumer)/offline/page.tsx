'use client'

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F8FAFB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📶</div>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>
        You&apos;re offline
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6B7280', maxWidth: 300 }}>
        Your catalog is cached and ready to browse.
      </p>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: '#9CA3AF' }}>
        Connect to the internet to submit enquiries.
      </p>
      <button
        onClick={() => window.history.back()}
        style={{
          background: '#0066CC',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 10,
          padding: '12px 24px',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        ← Go back to catalog
      </button>
    </main>
  )
}
