import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import GuestBanner from '../../../components/auth/GuestBanner'
import GuestCatalogClient from './GuestCatalogClient'

interface GuestPageProps {
  params: Promise<{ token: string }>
}

async function fetchGuestCatalog() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/catalog?price_type=base&page=1`, {
      next: { revalidate: 120 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function GuestPage({ params }: GuestPageProps) {
  const { token } = await params
  const supabase = await createClient()

  const { data: guestSession } = await supabase
    .from('guest_sessions')
    .select('id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!guestSession) {
    redirect('/auth/expired')
  }

  // Increment page_views (fire and forget — ignore errors)
  supabase.rpc('increment_guest_page_views', { session_token: token }).then(() => {})

  const initialData = await fetchGuestCatalog()

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 24 }}>
      <GuestBanner />
      <GuestCatalogClient
        initialItems={initialData?.items ?? []}
        initialCategories={initialData?.categories ?? []}
        initialBrands={initialData?.brands ?? []}
      />
    </div>
  )
}
