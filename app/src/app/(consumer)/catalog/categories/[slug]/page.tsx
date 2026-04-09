import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { resolvePrice } from '@/lib/pricing'
import CategoryClient from './CategoryClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const categoryName = decodeURIComponent(slug)

  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session_token')?.value

  let contactName: string | null = null
  let zohoContactId: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) {
      zohoContactId = session.zoho_contact_id
      contactName = session.contact_person_name ?? session.contact_name
    }
  }

  const { items: initialItems } = await resolvePrice(zohoContactId, { category: categoryName, page: 1 })

  return (
    <CategoryClient
      categoryName={categoryName}
      contactName={contactName}
      initialItems={initialItems}
    />
  )
}
