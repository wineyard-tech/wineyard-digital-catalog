import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['draft', 'received', 'quoted', 'confirmed', 'fulfilled'] as const
type EstimateStatus = (typeof VALID_STATUSES)[number]

function buildSsrClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )
}

async function requireAdminUser(request: NextRequest) {
  try {
    const ssrClient = buildSsrClient(request)
    const { data: { user }, error } = await ssrClient.auth.getUser()
    if (error || !user) return null
    return user
  } catch {
    return null
  }
}

// ─── PATCH /api/admin/[id] — update estimate status ─────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdminUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status } = body
  if (!status || !VALID_STATUSES.includes(status as EstimateStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('estimates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`
      id,
      estimate_number,
      status,
      updated_at,
      contacts (
        contact_name,
        phone
      )
    `)
    .single()

  if (error || !data) {
    console.error('[admin PATCH] update error:', error)
    return NextResponse.json({ error: 'Estimate not found or update failed' }, { status: 404 })
  }

  return NextResponse.json({ estimate: data })
}
