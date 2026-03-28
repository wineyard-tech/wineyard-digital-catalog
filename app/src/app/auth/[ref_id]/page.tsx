import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '../../../lib/supabase/server'
import OtpForm from '../../../components/auth/OtpForm'

interface AuthPageProps {
  params: Promise<{ ref_id: string }>
}

export default async function AuthPage({ params }: AuthPageProps) {
  const { ref_id } = await params
  const supabase = await createClient()

  // Validate ref_id — must be unused, not expired
  const { data: authRequest } = await supabase
    .from('auth_requests')
    .select('ref_id, phone')
    .eq('ref_id', ref_id)
    .eq('used', false)
    .gt('ref_expires_at', new Date().toISOString())
    .single()

  if (!authRequest) {
    redirect('/auth/expired')
  }

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
      }}
    >
      {/* Logo / header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Image
            src="/wine-yard-logo.png"
            alt="Wine Yard Technologies"
            width={140}
            height={100}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>
          Wine Yard Catalog
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
          Enter the 6-digit OTP sent to your WhatsApp
        </p>
      </div>

      {/* OTP form */}
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          padding: 24,
        }}
      >
        <OtpForm refId={ref_id} />
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
        Didn&apos;t get the OTP? Send any message to Wine Yard on WhatsApp to get a new link.
      </p>
    </main>
  )
}
