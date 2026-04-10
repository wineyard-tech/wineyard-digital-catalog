// sync-estimate-to-zoho — Database Webhook on INSERT public.estimates (catalog-app rows).
// Creates Zoho estimate, updates row, sends WhatsApp, broadcasts Realtime payload.
//
// Dashboard: Database → Webhooks → New → table public.estimates, event INSERT,
// HTTP POST https://<PROJECT_REF>.supabase.co/functions/v1/sync-estimate-to-zoho
// Headers: x-sync-estimate-secret: <same as SYNC_ESTIMATE_WEBHOOK_SECRET> (optional; omit secret env to skip check).
// Edge secrets: ZOHO_ORG_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_TIMEZONE (optional),
// WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ADMIN_NUMBER (fallback for location WA), plus default SUPABASE_*.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken } from '../_shared/zoho-client.ts'
import { formatOrgDateYmd } from '../_shared/zoho-org-date.ts'
import { timingSafeEqualString } from '../_shared/webhook-auth.ts'

const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3'

const BROADCAST_EVENT = 'sync'

interface LineItemRow {
  zoho_item_id?: string
  item_name?: string
  sku?: string
  quantity?: number
  rate?: number
  line_total?: number
  [key: string]: unknown
}

interface EstimateRecord {
  id: number
  public_id: string
  source: string | null
  zoho_sync_status: string
  zoho_estimate_id: string | null
  zoho_contact_id: string | null
  cart_hash: string | null
  line_items: LineItemRow[] | unknown
  notes: string | null
  location_id: string | null
  contact_phone: string
  contact_location: string | null
  subtotal: number
  tax_total: number
  total: number
  zoho_sync_attempts: number
}

function extractCEstimateId(estimateUrl: string | null): string | null {
  if (!estimateUrl) return null
  try {
    const url = new URL(estimateUrl)
    return url.searchParams.get('CEstimateID')
  } catch {
    return null
  }
}

function fmtInr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatItemsParam(items: LineItemRow[], max = 3): string {
  const visible = items.slice(0, max)
  const overflow = items.length - visible.length
  const lines = visible.map((item) => {
    const name = String(item.item_name ?? 'Item')
    const short = name.length > 30 ? `${name.slice(0, 27)}...` : name
    return `${short} x${Number(item.quantity ?? 0)} ${fmtInr(Number(item.line_total ?? 0))}`
  })
  if (overflow > 0) lines.push(`+${overflow} more item${overflow > 1 ? 's' : ''}`)
  return lines.join(' | ')
}

async function callWhatsAppApi(
  phoneNumberId: string,
  token: string,
  payload: Record<string, unknown>
): Promise<string | undefined> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      ...payload,
      to: String(payload.to ?? '').replace(/^\+/, ''),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WhatsApp API ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { messages?: Array<{ id: string }> }
  return data.messages?.[0]?.id
}

async function broadcastEstimateSync(
  supabase: SupabaseClient,
  publicId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const channel = supabase.channel(`estimate:${publicId}`, {
    config: { broadcast: { ack: false } },
  })
  try {
    await new Promise<void>((resolve) => {
      const done = async () => {
        try {
          await supabase.removeChannel(channel)
        } catch {
          /* ignore */
        }
        resolve()
      }
      const t = setTimeout(() => void done(), 8000)
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(t)
          try {
            await channel.send({
              type: 'broadcast',
              event: BROADCAST_EVENT,
              payload,
            })
          } catch (e) {
            console.error('[sync-estimate-to-zoho] channel.send:', e)
          }
          await done()
        }
      })
    })
  } catch (err) {
    console.error('[sync-estimate-to-zoho] broadcast failed:', err)
  }
}

function verifyWebhook(req: Request): boolean {
  const secret = Deno.env.get('SYNC_ESTIMATE_WEBHOOK_SECRET')?.trim()
  if (!secret) return true
  const header = req.headers.get('x-sync-estimate-secret')?.trim() ?? ''
  return timingSafeEqualString(header, secret)
}

function parseWebhookBody(raw: string): { record: Record<string, unknown> | null } {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    if (j.record && typeof j.record === 'object') {
      return { record: j.record as Record<string, unknown> }
    }
    if (j.type === 'INSERT' && j.record) {
      return { record: j.record as Record<string, unknown> }
    }
  } catch {
    /* ignore */
  }
  return { record: null }
}

async function markEstimateSent(zohoEstimateId: string, token: string, orgId: string): Promise<void> {
  const res = await fetch(
    `${ZOHO_API_BASE}/estimates/${zohoEstimateId}/status/sent?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    }
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`mark sent failed ${res.status}: ${errText}`)
  }
}

async function getEstimatePublicUrl(
  zohoEstimateId: string,
  token: string,
  orgId: string
): Promise<string | null> {
  const res = await fetch(
    `${ZOHO_API_BASE}/estimates/${zohoEstimateId}?organization_id=${orgId}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!res.ok) return null
  const data = (await res.json()) as { estimate?: { estimate_url?: string } }
  return data.estimate?.estimate_url ?? null
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  if (!verifyWebhook(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { record: rec } = parseWebhookBody(rawBody)
  const id = rec?.id
  if (typeof id !== 'number' && typeof id !== 'string') {
    return new Response(JSON.stringify({ ok: true, note: 'no record id' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rowId = typeof id === 'string' ? parseInt(id, 10) : id
  if (!Number.isFinite(rowId)) {
    return new Response(JSON.stringify({ ok: true, note: 'invalid id' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: row, error: loadErr } = await supabase
    .from('estimates')
    .select(
      [
        'id',
        'public_id',
        'source',
        'zoho_sync_status',
        'zoho_estimate_id',
        'zoho_contact_id',
        'cart_hash',
        'line_items',
        'notes',
        'location_id',
        'contact_phone',
        'contact_location',
        'subtotal',
        'tax_total',
        'total',
        'zoho_sync_attempts',
      ].join(',')
    )
    .eq('id', rowId)
    .maybeSingle()

  if (loadErr || !row) {
    console.error('[sync-estimate-to-zoho] load row:', loadErr?.message)
    return new Response(JSON.stringify({ error: 'row not found' }), { status: 200 })
  }

  const est = row as unknown as EstimateRecord

  if (est.source !== 'catalog-app') {
    return new Response(JSON.stringify({ ok: true, skipped: 'not catalog-app' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (est.zoho_sync_status === 'SYNCED' || est.zoho_estimate_id) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already synced' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orgId = Deno.env.get('ZOHO_ORG_ID')?.trim() ?? ''
  const orgTz = Deno.env.get('ZOHO_ORG_TIMEZONE')?.trim() || 'Asia/Kolkata'
  const waToken = Deno.env.get('WHATSAPP_TOKEN') ?? ''
  const waPhoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''

  const lineItems = Array.isArray(est.line_items) ? (est.line_items as LineItemRow[]) : []
  const contactId = est.zoho_contact_id
  if (!contactId) {
    await failRow(supabase, est, 'missing zoho_contact_id', waToken, waPhoneId)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (!orgId) {
    await failRow(supabase, est, 'missing ZOHO_ORG_ID', waToken, waPhoneId)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: dup } = await supabase
    .from('estimates')
    .select('id, public_id, estimate_number, estimate_url, zoho_estimate_id')
    .eq('zoho_contact_id', contactId)
    .eq('cart_hash', est.cart_hash ?? '')
    .eq('zoho_sync_status', 'SYNCED')
    .gt('created_at', cutoff)
    .neq('id', est.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (dup) {
    const attempts = (est.zoho_sync_attempts ?? 0) + 1
    await supabase
      .from('estimates')
      .update({
        zoho_sync_status: 'FAILED',
        zoho_sync_error: 'duplicate_cart_recent_synced',
        zoho_sync_attempts: attempts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', est.id)

    const dupPayload = {
      zoho_sync_status: 'FAILED',
      estimate_number: null as string | null,
      estimate_url: null as string | null,
      status: 'draft',
      duplicate_of: {
        public_id: dup.public_id,
        estimate_number: dup.estimate_number,
        estimate_url: dup.estimate_url,
        zoho_estimate_id: dup.zoho_estimate_id,
      },
    }
    await broadcastEstimateSync(supabase, est.public_id, dupPayload)

    const { data: contact } = await supabase
      .from('contacts')
      .select('contact_name, phone')
      .eq('zoho_contact_id', contactId)
      .maybeSingle()
    const customerName = (contact?.contact_name as string) ?? 'Customer'
    const { data: loc } = est.location_id
      ? await supabase
          .from('locations')
          .select('location_name, phone')
          .eq('zoho_location_id', est.location_id)
          .maybeSingle()
      : { data: null }

    await sendWhatsAppForOutcome(
      'FAILED',
      {
        publicId: est.id.toString(),
        customerPhone: est.contact_phone,
        customerName,
        locationPhone: loc?.phone ?? null,
        locationName: loc?.location_name ?? null,
        estimateNumber: dup.estimate_number ?? '—',
        estimateUrl: dup.estimate_url,
        zohoEstimateId: dup.zoho_estimate_id ?? '',
        items: lineItems,
        total: Number(est.total),
        contactLocation: est.contact_location,
        contactPhone: est.contact_phone,
        itemCount: lineItems.length,
      },
      waToken,
      waPhoneId
    ).catch((e) => console.error('[sync-estimate-to-zoho] WA duplicate path:', e))

    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let token: string
  try {
    token = await getZohoToken(supabase)
  } catch (e) {
    console.error('[sync-estimate-to-zoho] token:', e)
    await failRow(supabase, est, e instanceof Error ? e.message : String(e), waToken, waPhoneId)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  const now = new Date()
  const today = formatOrgDateYmd(now, orgTz)
  const expiry = formatOrgDateYmd(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), orgTz)
  const gstNote = `All prices inclusive of GST`
  const notesText = [gstNote, est.notes].filter(Boolean).join('\n')

  const zohoBody: Record<string, unknown> = {
    customer_id: contactId,
    date: today,
    expiry_date: expiry,
    is_inclusive_tax: false,
    tax_treatment: 'out_of_scope',
    location_id: est.location_id ?? null,
    line_items: lineItems.map((item) => {
      const name = String(item.item_name ?? 'Item')
      const sku = item.sku ? String(item.sku) : ''
      const description = sku ? `${name} (${sku})` : name
      return {
        item_id: item.zoho_item_id,
        name,
        description,
        quantity: item.quantity,
        rate: item.rate,
      }
    }),
    notes: notesText,
  }
  if (est.location_id) zohoBody.location_id = est.location_id

  let zohoEstimateId: string
  let zohoEstimateNumber: string

  try {
    const res = await fetch(`${ZOHO_API_BASE}/estimates?organization_id=${orgId}`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zohoBody),
    })
    const raw = await res.text()
    if (!res.ok) {
      throw new Error(`POST estimates ${res.status}: ${raw.slice(0, 2000)}`)
    }
    const created = JSON.parse(raw) as {
      code?: number
      message?: string
      estimate?: { estimate_id?: string; estimate_number?: string }
    }
    if (created.code !== undefined && created.code !== 0) {
      throw new Error(`Zoho API code=${created.code} ${created.message ?? ''}`.trim())
    }
    zohoEstimateId = created.estimate?.estimate_id ?? ''
    zohoEstimateNumber = created.estimate?.estimate_number ?? ''
    if (!zohoEstimateId) throw new Error(`no estimate_id in Zoho response: ${raw.slice(0, 1500)}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[sync-estimate-to-zoho] create:', msg)
    await failRow(supabase, est, msg, orgId, waToken, waPhoneId)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  try {
    await markEstimateSent(zohoEstimateId, token, orgId)
  } catch (e) {
    console.warn('[sync-estimate-to-zoho] mark sent:', e instanceof Error ? e.message : e)
  }

  const estimateUrl = await getEstimatePublicUrl(zohoEstimateId, token, orgId)

  const attempts = (est.zoho_sync_attempts ?? 0) + 1
  const { error: upErr } = await supabase
    .from('estimates')
    .update({
      zoho_estimate_id: zohoEstimateId,
      estimate_number: zohoEstimateNumber,
      status: 'sent',
      estimate_url: estimateUrl,
      zoho_sync_status: 'SYNCED',
      zoho_sync_attempts: attempts,
      zoho_sync_error: null,
      notes: notesText,
      expires_at: formatOrgDateYmd(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), orgTz),
      updated_at: new Date().toISOString(),
    })
    .eq('id', est.id)

  if (upErr) {
    console.error('[sync-estimate-to-zoho] update row:', upErr.message)
  }

  const syncPayload = {
    zoho_sync_status: 'SYNCED',
    estimate_number: zohoEstimateNumber,
    estimate_url: estimateUrl,
    status: 'sent',
  }
  await broadcastEstimateSync(supabase, est.public_id, syncPayload)

  const { data: contact } = await supabase
    .from('contacts')
    .select('contact_name')
    .eq('zoho_contact_id', contactId)
    .maybeSingle()
  const customerName = (contact?.contact_name as string) ?? 'Customer'

  const { data: loc } = est.location_id
    ? await supabase
        .from('locations')
        .select('location_name, phone')
        .eq('zoho_location_id', est.location_id)
        .maybeSingle()
    : { data: null }

  try {
    const customerMessageId = await sendWhatsAppForOutcome(
      'SYNCED',
      {
        publicId: est.id.toString(),
        customerPhone: est.contact_phone,
        customerName,
        locationPhone: loc?.phone ?? null,
        locationName: loc?.location_name ?? null,
        estimateNumber: zohoEstimateNumber,
        estimateUrl,
        zohoEstimateId,
        items: lineItems,
        total: Number(est.total),
        contactLocation: est.contact_location,
        contactPhone: est.contact_phone,
        itemCount: lineItems.length,
      },
      waToken,
      waPhoneId
    )
    if (customerMessageId) {
      await supabase
        .from('estimates')
        .update({
          status: 'sent',
          whatsapp_sent: true,
          app_whatsapp_sent: true,
          whatsapp_sent_at: new Date().toISOString(),
          app_whatsapp_message_id: customerMessageId,
        })
        .eq('id', est.id)
    }
  } catch (e) {
    console.error('[sync-estimate-to-zoho] WA success path:', e)
  }

  return new Response(JSON.stringify({ ok: true, zoho_estimate_id: zohoEstimateId }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

interface NotifyCtx {
  publicId: string
  customerPhone: string
  customerName: string
  locationPhone: string | null
  locationName: string | null
  estimateNumber: string
  estimateUrl: string | null
  zohoEstimateId: string
  items: LineItemRow[]
  total: number
  contactLocation: string | null
  contactPhone: string
  itemCount: number
}

async function failRow(
  supabase: SupabaseClient,
  est: EstimateRecord,
  errMsg: string,
  waToken: string,
  waPhoneId: string
): Promise<string | null> {
  const attempts = (est.zoho_sync_attempts ?? 0) + 1
  await supabase
    .from('estimates')
    .update({
      zoho_sync_status: 'FAILED',
      zoho_sync_error: errMsg.slice(0, 8000),
      zoho_sync_attempts: attempts,
      updated_at: new Date().toISOString(),
    })
    .eq('id', est.id)

  await broadcastEstimateSync(supabase, est.public_id, {
    zoho_sync_status: 'FAILED',
    estimate_number: null,
    estimate_url: null,
    status: 'draft',
  })

  const contactId = est.zoho_contact_id
  const { data: contact } = contactId
    ? await supabase.from('contacts').select('contact_name').eq('zoho_contact_id', contactId).maybeSingle()
    : { data: null }
  const customerName = (contact?.contact_name as string) ?? 'Customer'

  const lineItems = Array.isArray(est.line_items) ? (est.line_items as LineItemRow[]) : []
  const { data: loc } = est.location_id
    ? await supabase
        .from('locations')
        .select('location_name, phone')
        .eq('zoho_location_id', est.location_id)
        .maybeSingle()
    : { data: null }

  const customerMessageId = await sendWhatsAppForOutcome(
    'FAILED',
    {
      publicId: est.id.toString(),
      customerPhone: est.contact_phone,
      customerName,
      locationPhone: loc?.phone ?? null,
      locationName: loc?.location_name ?? null,
      estimateNumber: '—',
      estimateUrl: null,
      zohoEstimateId: '',
      items: lineItems,
      total: Number(est.total),
      contactLocation: est.contact_location,
      contactPhone: est.contact_phone,
      itemCount: lineItems.length,
    },
    waToken,
    waPhoneId
  ).catch((e) => console.error('[sync-estimate-to-zoho] WA fail path:', e))
  return customerMessageId ?? null // null if failed to send any message
}

async function sendWhatsAppForOutcome(
  outcome: 'SYNCED' | 'FAILED',
  ctx: NotifyCtx,
  waToken: string,
  waPhoneId: string
): Promise<string | null> {
  if (!waToken?.trim() || !waPhoneId?.trim()) {
    console.warn('[sync-estimate-to-zoho] WhatsApp env not set — skipping templates')
    return null
  }
  const fmtTotal = fmtInr(ctx.total)
  const itemsSummary = formatItemsParam(ctx.items)
  let customerMessageId: string | null = null
  
  if (outcome === 'SYNCED') {
    customerMessageId = await callWhatsAppApi(waPhoneId, waToken, {
      to: ctx.customerPhone,
      type: 'template',
      template: {
        name: 'wineyard_customer_notification',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'item_count', text: String(ctx.itemCount) },
              { type: 'text', parameter_name: 'location_name', text: ctx.locationName ?? 'Himayatnagar' },
              { type: 'text', parameter_name: 'total_amount', text: fmtTotal },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: extractCEstimateId(ctx.estimateUrl) ?? ctx.zohoEstimateId },
            ],
          },
        ],
      },
    }) ?? null
  } else {
    customerMessageId = await callWhatsAppApi(waPhoneId, waToken, {
      to: ctx.customerPhone,
      type: 'template',
      template: {
        name: 'wineyard_customer_notification_sync_failed',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters:  [
              { type: 'text', parameter_name: 'item_count', text: String(ctx.itemCount) },
              { type: 'text', parameter_name: 'location_name', text: ctx.locationName ?? 'Himayatnagar' },
              { type: 'text', parameter_name: 'total_amount', text: fmtTotal },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [ // use Estimate publicId instead of Zoho estimate_id since Zoho estimate could not be created
              { type: 'text', text: ctx.public_id ?? '' }
            ],
          },
        ],
      },
    }) ?? null
  }

  const locPhone = ctx.locationPhone ?? Deno.env.get('WHATSAPP_ADMIN_NUMBER')?.trim()
  if (!locPhone) return

  if (outcome === 'SYNCED') {
    await callWhatsAppApi(waPhoneId, waToken, {
      to: locPhone,
      type: 'template',
      template: {
        name: 'wineyard_location_notification',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'location_name', text: ctx.locationName ?? 'Wine Yard Team' },
              { type: 'text', parameter_name: 'estimate_number', text: ctx.estimateNumber },
              { type: 'text', parameter_name: 'contact_name', text: ctx.customerName },
              { type: 'text', parameter_name: 'contact_phone_number', text: ctx.contactPhone },
              { type: 'text', parameter_name: 'contact_location', text: ctx.contactLocation ?? 'Unknown' },
              { type: 'text', parameter_name: 'total_amount', text: fmtTotal },
              { type: 'text', parameter_name: 'item_count', text: String(ctx.itemCount) },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: extractCEstimateId(ctx.estimateUrl) ?? ctx.zohoEstimateId },
            ],
          },
        ],
      },
    })
  } else {
    await callWhatsAppApi(waPhoneId, waToken, {
      to: locPhone,
      type: 'template',
      template: {
        name: 'wineyard_location_notification_sync_failed',
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'location_name', text: ctx.locationName ?? 'Wine Yard Team' },
              { type: 'text', parameter_name: 'contact_name', text: ctx.customerName },
              { type: 'text', parameter_name: 'contact_phone_number', text: ctx.contactPhone },
              { type: 'text', parameter_name: 'contact_location', text: ctx.contactLocation ?? 'Unknown' },
              { type: 'text', parameter_name: 'total_amount', text: fmtTotal },
              { type: 'text', parameter_name: 'item_count', text: String(ctx.itemCount) },
            ],
          },
        ],
      },
    })
  }
  return customerMessageId ?? null // null if failed to send any message
}
