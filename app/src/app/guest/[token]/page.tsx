import { redirect } from 'next/navigation'
import {
  validateGuestSessionToken,
  incrementGuestPageViewsFireAndForget,
} from '@/lib/auth/server-lookups'
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

  const ok = await validateGuestSessionToken(token)
  if (!ok) {
    redirect('/auth/expired')
  }

  incrementGuestPageViewsFireAndForget(token)

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
