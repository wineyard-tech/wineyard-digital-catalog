import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import HomeClient, { type Category } from '@/components/catalog/HomeClient'

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session_token')?.value

  let contactName: string | null = null

  if (sessionToken) {
    const session = await getSession(sessionToken)
    if (session) {
      contactName = session.contact_name ?? null
    }
  }

  // Fetch categories sorted by display_order for the tab bar.
  // If `categories` doesn't appear in the generated types, run scripts/generate-types.sh.
  const supabase = createServiceClient()
  const { data: rawCategories } = await supabase
    .from('categories' as never)
    .select('zoho_category_id, category_name, display_order, icon_url')
    .eq('status', 'active')
    .order('display_order', { ascending: true })
    .order('category_name', { ascending: true })

  return (
    <HomeClient
      contactName={contactName}
      categories={(rawCategories ?? []) as unknown as Category[]}
      initialQuery={q ?? ''}
    />
  )
}
