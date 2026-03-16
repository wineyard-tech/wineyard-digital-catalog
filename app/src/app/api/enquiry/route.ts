import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { createEstimate } from '@/lib/zoho'
import { sendQuotation } from '@/lib/whatsapp'
import type { EnquiryRequest, CartItem } from '../../../../../types/catalog'

export async function POST(request: NextRequest) {
  // ── Auth — guests cannot enquire ─────────────────────────────────────────
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required to submit enquiries' }, { status: 403 })
    }
    throw err
  }

  // ── Parse request body ────────────────────────────────────────────────────
  let body: EnquiryRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // ── Calculate totals ──────────────────────────────────────────────────────
  const subtotal = body.items.reduce((sum: number, item: CartItem) => sum + item.line_total, 0)
  const tax = Math.round(subtotal * 0.18 * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100

  const supabase = createServiceClient()

  // ── Insert draft estimate ─────────────────────────────────────────────────
  const { data: estimate, error: insertError } = await supabase
    .from('estimates')
    .insert({
      zoho_contact_id: session.zoho_contact_id,
      contact_phone: session.phone,
      status: 'draft',
      line_items: body.items,
      subtotal,
      tax_total: tax,
      total,
      notes: body.notes ?? null,
    })
    .select('id, estimate_number')
    .single()

  if (insertError || !estimate) {
    console.error('[enquiry] estimate insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create estimate' }, { status: 500 })
  }

  // ── Create estimate in Zoho Books ─────────────────────────────────────────
  let zohoEstimateId: string | null = null
  let whatsappSent = false

  try {
    const zohoRes = await createEstimate(
      session.zoho_contact_id,
      body.items,
      body.notes
    )

    zohoEstimateId = zohoRes.estimate?.estimate_id ?? null

    await supabase
      .from('estimates')
      .update({
        zoho_estimate_id: zohoEstimateId,
        status: 'sent',
      })
      .eq('id', estimate.id)
  } catch (err) {
    console.error('[enquiry] Zoho estimate creation failed:', err)
    // Continue — local estimate is saved; Zoho sync can retry
  }

  // ── Send WhatsApp quotation ───────────────────────────────────────────────
  try {
    await sendQuotation(session.phone, estimate.estimate_number, body.items, {
      subtotal,
      tax,
      total,
    })

    await supabase
      .from('estimates')
      .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
      .eq('id', estimate.id)

    whatsappSent = true
  } catch (err) {
    console.error('[enquiry] WhatsApp send failed:', err)
    // Non-fatal — estimate is still created
  }

  return NextResponse.json({
    success: true,
    estimate_number: estimate.estimate_number,
    whatsapp_sent: whatsappSent,
  })
}
