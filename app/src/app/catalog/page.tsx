import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { resolvePrice } from '@/lib/pricing'
import CatalogClient from './CatalogClient'

export default async function CatalogPage() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session_token')?.value

  // Resolve session for authenticated users — anonymous users get null (no redirect)
  let contactName: string | null = null
  let zohoContactId: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) {
      contactName = session.contact_name ?? null
      zohoContactId = session.zoho_contact_id
    }
  }

  // Fetch first page of items — base pricing for anonymous, pricebook for authenticated
  const { items: initialItems } = await resolvePrice(zohoContactId, { page: 1 })

  // Derive filter values from first-page data for filter chips
  const initialCategories = [...new Set(initialItems.map(i => i.category_name).filter(Boolean))] as string[]
  const initialBrands = [...new Set(initialItems.map(i => i.brand).filter(Boolean))] as string[]

  return (
    <CatalogClient
      contactName={contactName}
      initialItems={initialItems}
      initialCategories={initialCategories}
      initialBrands={initialBrands}
    />
  )
}
