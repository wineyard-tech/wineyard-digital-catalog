import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import CatalogClient from './CatalogClient'

async function fetchInitialCatalog(sessionToken: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/catalog?page=1`, {
      headers: { Cookie: `session_token=${sessionToken}` },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function CatalogPage() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session_token')?.value

  if (!sessionToken) {
    redirect('/auth/expired')
  }

  // Validate session
  const supabase = await createClient()
  const { data: session } = await supabase
    .from('sessions')
    .select('zoho_contact_id, contact_name')
    .eq('token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!session) {
    redirect('/auth/expired')
  }

  const initialData = await fetchInitialCatalog(sessionToken)

  return (
    <CatalogClient
      sessionToken={sessionToken}
      contactName={session.contact_name}
      initialItems={initialData?.items ?? []}
      initialCategories={initialData?.categories ?? []}
      initialBrands={initialData?.brands ?? []}
    />
  )
}
