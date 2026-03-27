import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { CartItem } from '@/types/catalog'

interface EstimateRow {
  id: number
  public_id: string
  estimate_number: string
  zoho_sync_status: string
  line_items: CartItem[]
  subtotal: number
  tax_total: number
  total: number
  created_at: string
  zoho_contact_id: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth required — only the owning contact can fetch their estimate
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('estimates')
    .select('id, public_id, estimate_number, zoho_sync_status, line_items, subtotal, tax_total, total, created_at, zoho_contact_id')
    .eq('public_id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  const estimate = data as EstimateRow

  // Ensure the requesting user owns this estimate
  if (estimate.zoho_contact_id !== session.zoho_contact_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // expiry_time = 24 hours after creation
  const expiresAt = new Date(new Date(estimate.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString()

  return NextResponse.json({
    estimate_number: estimate.estimate_number,
    zoho_sync_status: estimate.zoho_sync_status,
    line_items: estimate.line_items,
    subtotal: estimate.subtotal,
    tax_total: estimate.tax_total,
    total: estimate.total,
    expires_at: expiresAt,
  })
}
