import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('categories')
    .select('zoho_category_id, category_name, display_order, icon_url, icon_urls')
    .eq('status', 'active')
    .order('display_order', { ascending: true })
    .order('category_name', { ascending: true })

  if (error) {
    console.error('categories fetch error', error)
    return NextResponse.json({ categories: [] })
  }

  return NextResponse.json({ categories: data ?? [] })
}
