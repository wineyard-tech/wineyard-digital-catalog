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

  // Fetch categories + a per-category product count in parallel.
  const supabase = createServiceClient()
  const [{ data: rawCategories }, { data: itemRows }] = await Promise.all([
    supabase
      .from('categories' as never)
      .select('zoho_category_id, category_name, display_order, icon_url')
      .eq('status', 'active')
      .order('display_order', { ascending: true })
      .order('category_name', { ascending: true }),
    // Single lightweight query — only category_name strings, no joins.
    (supabase as never as { from: (t: string) => { select: (cols: string) => { eq: (k: string, v: string) => Promise<{ data: { category_name: string | null }[] | null }> } } })
      .from('items')
      .select('category_name')
      .eq('status', 'active'),
  ])

  // Aggregate counts in JS — avoids needing a GROUP BY view or RPC.
  const countMap: Record<string, number> = {}
  for (const row of (itemRows ?? []) as { category_name: string | null }[]) {
    if (row.category_name) countMap[row.category_name] = (countMap[row.category_name] ?? 0) + 1
  }

  const categories: Category[] = ((rawCategories ?? []) as unknown as Category[]).map(cat => ({
    ...cat,
    product_count: countMap[cat.category_name] ?? 0,
  }))

  return (
    <HomeClient
      contactName={contactName}
      categories={categories}
      initialQuery={q ?? ''}
    />
  )
}
