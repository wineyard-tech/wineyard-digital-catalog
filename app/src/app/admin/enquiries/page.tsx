import EnquiryTable from '../../../components/admin/EnquiryTable'

export default function AdminEnquiriesPage() {
  return (
    <main style={{ background: '#F8FAFB', minHeight: '100vh' }}>
      <header
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1A1A2E' }}>Enquiries</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>WineYard Catalog Admin</p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{
              background: '#F3F4F6',
              border: 'none',
              borderRadius: 8,
              color: '#374151',
              fontSize: 13,
              padding: '7px 14px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Logout
          </button>
        </form>
      </header>
      <div style={{ padding: '16px 24px' }}>
        <EnquiryTable />
      </div>
    </main>
  )
}
