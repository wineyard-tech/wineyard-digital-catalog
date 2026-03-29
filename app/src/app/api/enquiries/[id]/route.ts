import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { EnquiryDetail, EnquiryLineItemDetail, EnquiryStatus } from '@/types/catalog'

// ── GET /api/enquiries/[id] — Estimate detail with live stock availability ────

const EXPIRY_DAYS = 30

function computeStatus(row: {
  status: string
  created_at: string
  converted_to_salesorder_id: string | null
}): EnquiryStatus {
  if (row.converted_to_salesorder_id || row.status === 'accepted') return 'Converted'
  const ageDays = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays > EXPIRY_DAYS) return 'Expired'
  return 'Pending'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { data: estimate, error } = await supabase
    .from('estimates')
    .select('public_id, estimate_number, date, created_at, total, subtotal, tax_total, line_items, status, converted_to_salesorder_id')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) {
    console.error('[enquiries/id] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch enquiry' }, { status: 500 })
  }
  if (!estimate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rawLineItems = Array.isArray(estimate.line_items)
    ? (estimate.line_items as { zoho_item_id: string; item_name: string; sku: string; quantity: number; rate: number; tax_percentage: number; line_total: number }[])
    : []

  // Enrich line items with live stock data from items table
  const zohoItemIds = rawLineItems.map((li) => li.zoho_item_id).filter(Boolean)

  let stockMap = new Map<string, { available_stock: number | null; image_url: string | null }>()

  if (zohoItemIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('items')
      .select('zoho_item_id, available_stock, image_urls')
      .in('zoho_item_id', zohoItemIds)

    for (const row of itemRows ?? []) {
      const imageUrl = Array.isArray(row.image_urls) && row.image_urls.length > 0
        ? (row.image_urls[0] as string)
        : null
      stockMap.set(row.zoho_item_id, {
        available_stock: row.available_stock ?? null,
        image_url: imageUrl,
      })
    }
  }

  const lineItems: EnquiryLineItemDetail[] = rawLineItems.map((li) => {
    const stock = stockMap.get(li.zoho_item_id)
    const available_stock = stock?.available_stock ?? null

    let stock_status: EnquiryLineItemDetail['stock_status'] = 'unknown'
    if (available_stock !== null) {
      if (available_stock <= 0) stock_status = 'out_of_stock'
      else if (available_stock < 10) stock_status = 'limited'
      else stock_status = 'available'
    }

    return {
      zoho_item_id: li.zoho_item_id,
      item_name: li.item_name,
      sku: li.sku,
      quantity: li.quantity,
      rate: li.rate,
      tax_percentage: li.tax_percentage,
      line_total: (li.line_total ?? (li.rate * li.quantity)) || 0,
      image_url: stock?.image_url ?? null,
      available_stock,
      stock_status,
    }
  })

  const detail: EnquiryDetail = {
    id: estimate.public_id as string,
    doc_number: estimate.estimate_number,
    date: estimate.date ?? estimate.created_at?.slice(0, 10) ?? '',
    // PostgREST returns DECIMAL columns as strings — coerce to number for fmt()
    total: Number(estimate.total),
    subtotal: Number(estimate.subtotal ?? 0),
    tax_total: Number(estimate.tax_total ?? 0),
    status: computeStatus({
      status: estimate.status,
      created_at: estimate.created_at,
      converted_to_salesorder_id: estimate.converted_to_salesorder_id,
    }),
    estimate_id: estimate.public_id as string,
    line_items: lineItems,
  }

  return NextResponse.json(detail)
}
