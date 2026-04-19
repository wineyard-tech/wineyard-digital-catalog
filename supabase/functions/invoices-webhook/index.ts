// invoices-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Invoice events and syncs
// them to Supabase in real-time. Keeps invoice status, balances, and
// payment state current within seconds of changes in Zoho.
//
// Event routing (single endpoint, create + update only):
//   invoice_created | invoice_updated  →  handleUpsert()  (UPSERT invoice row)
//
// No delete handler — invoices carry financial/tax records and must be
// retained for audit. Always returns HTTP 200 to prevent Zoho retries.
// Failures are logged to the webhook_errors table for async investigation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { makeLogger, computeDelta, logEvent } from '../_shared/logger.ts'
import { timingSafeEqualString } from '../_shared/webhook-auth.ts'

const logger = makeLogger('[invoices-webhook]')

// Fields watched for delta logging — balance and status are the most critical
// signals for an invoice (tracks payment progress).
const WATCHED_FIELDS = [
  'status', 'total', 'balance', 'subtotal', 'tax_total',
  'due_date', 'payment_terms_label',
  'zoho_contact_id', 'invoice_number', 'einvoice_status',
  'estimate_number', 'zoho_estimate_id',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZohoLineItem {
  line_item_id?: string
  item_id?: string
  name?: string
  description?: string
  quantity?: number | ''
  unit?: string
  rate?: number | ''
  discount?: number | ''
  tax_id?: string
  tax_name?: string
  tax_percentage?: number | ''
  item_total?: number | ''
  [key: string]: unknown
}

interface ZohoInvoicePayload {
  invoice_id: string
  invoice_number?: string
  customer_id?: string
  customer_name?: string
  status?: string
  date?: string
  due_date?: string
  issued_date?: string
  payment_terms?: number | ''
  payment_terms_label?: string
  currency_code?: string
  exchange_rate?: number | ''
  discount_type?: string
  is_discount_before_tax?: boolean
  entity_discount_percent?: number | ''
  is_inclusive_tax?: boolean
  line_items?: ZohoLineItem[]
  sub_total?: number | ''
  tax_total?: number | ''
  total?: number | ''
  balance?: number | ''
  adjustment?: number | ''
  adjustment_description?: string
  adjustment_account?: string
  notes?: string
  terms_and_conditions?: string
  purchase_order?: string
  place_of_supply?: string
  gst_treatment?: string
  gstin?: string
  invoice_type?: string
  einvoice_status?: string
  branch_id?: string
  branch_name?: string
  accounts_receivable?: string
  tcs_amount?: number | ''
  tds_amount?: number | ''
  shipping_charge?: number | ''
  estimate_number?: string
  estimate_id?: string
  created_time?: string
  last_modified_time?: string
}

interface ZohoWebhookPayload {
  event_type?: string
  webhook_event?: string
  data?: ZohoInvoicePayload | Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dec(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function normaliseEventType(raw: string | undefined): 'created' | 'updated' | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '_')
  const CREATED = new Set(['invoice_created', 'create', 'created'])
  const UPDATED = new Set(['invoice_updated', 'update', 'updated', 'upsert'])
  if (CREATED.has(lower)) return 'created'
  if (UPDATED.has(lower)) return 'updated'
  return null
}

async function logError(
  supabase: SupabaseClient,
  opts: { event_type: string; zoho_entity_id?: string; error_message: string; payload: unknown }
): Promise<void> {
  try {
    await supabase.from('webhook_errors').insert({
      webhook_type: 'invoices',
      event_type: opts.event_type,
      zoho_entity_id: opts.zoho_entity_id ?? null,
      error_message: opts.error_message,
      payload: opts.payload,
    })
  } catch (e) {
    logger.error('LOG_ERR', { msg: 'Failed to write to webhook_errors', err: String(e) })
  }
}

// ── Upsert handler (Create + Update) ─────────────────────────────────────────

async function handleUpsert(
  supabase: SupabaseClient,
  invoice: ZohoInvoicePayload,
  eventType: string,
  rawPayload: unknown
): Promise<void> {
  const invoiceId = invoice.invoice_id
  if (!invoiceId) throw new Error('Missing invoice_id in payload')

  // ── Resolve contact_phone from local contacts table ─────────────────────────
  // Zoho invoice payloads include customer_id (= zoho_contact_id) but not phone.
  // contact_phone is NOT NULL so we look it up. Falls back to '' if the contact
  // is not yet synced locally.
  let contactPhone = ''
  if (invoice.customer_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone')
      .eq('zoho_contact_id', invoice.customer_id)
      .maybeSingle()
    if (contact?.phone) {
      contactPhone = contact.phone
    } else {
      logger.warn('PHONE_MISS', { invoice_id: invoiceId, customer_id: invoice.customer_id, note: 'contact not found locally — contact_phone will be empty' })
    }
  }

  logger.info('PHONE', { invoice_id: invoiceId, customer_id: invoice.customer_id ?? 'none', phone: contactPhone || '(empty)' })

  // Field mapping follows the invoices table schema exactly (20260324_invoices.sql).
  // zoho_sync_status is set to 'synced' — this row arrived directly from Zoho.
  const invoiceRow = {
    zoho_invoice_id:              invoiceId,
    invoice_number:               invoice.invoice_number || null,
    zoho_contact_id:              invoice.customer_id || null,
    customer_name:                invoice.customer_name || null,
    contact_phone:                contactPhone,
    status:                       invoice.status ?? 'draft',
    date:                         invoice.date || null,
    due_date:                     invoice.due_date || null,
    issued_date:                  invoice.issued_date || null,
    payment_terms:                invoice.payment_terms === '' ? null : (invoice.payment_terms ?? null),
    payment_terms_label:          invoice.payment_terms_label || null,
    currency_code:                invoice.currency_code || 'INR',
    exchange_rate:                dec(invoice.exchange_rate) ?? 1.0,
    discount_type:                invoice.discount_type || 'multi_discount',
    is_discount_before_tax:       invoice.is_discount_before_tax ?? true,
    entity_discount_percent:      dec(invoice.entity_discount_percent) ?? 0,
    is_inclusive_tax:             invoice.is_inclusive_tax ?? true,
    line_items:                   invoice.line_items ?? [],
    subtotal:                     dec(invoice.sub_total) ?? 0,
    tax_total:                    dec(invoice.tax_total) ?? 0,
    total:                        dec(invoice.total) ?? 0,
    balance:                      dec(invoice.balance) ?? 0,
    adjustment:                   dec(invoice.adjustment) ?? 0,
    adjustment_description:       invoice.adjustment_description || null,
    adjustment_account:           invoice.adjustment_account || null,
    notes:                        invoice.notes || null,
    terms_and_conditions:         invoice.terms_and_conditions || null,
    purchase_order:               invoice.purchase_order || null,
    place_of_supply:              invoice.place_of_supply || null,
    gst_treatment:                invoice.gst_treatment || null,
    gstin:                        invoice.gstin || null,
    invoice_type:                 invoice.invoice_type || 'Invoice',
    einvoice_status:              invoice.einvoice_status || null,
    branch_id:                    invoice.branch_id || null,
    branch_name:                  invoice.branch_name || null,
    accounts_receivable:          invoice.accounts_receivable || null,
    tcs_amount:                   dec(invoice.tcs_amount) ?? 0,
    tds_amount:                   dec(invoice.tds_amount) ?? 0,
    shipping_charge:              dec(invoice.shipping_charge) ?? 0,
    estimate_number:              invoice.estimate_number || null,
    zoho_estimate_id:             invoice.estimate_id || null,
    zoho_sync_status:             'synced',
    updated_at:                   new Date().toISOString(),
  }

  // ── Delta: fetch existing record and log what changed ──────────────────────
  const { data: existing } = await supabase
    .from('invoices')
    .select(WATCHED_FIELDS.join(','))
    .eq('zoho_invoice_id', invoiceId)
    .maybeSingle()

  const { op, changed, changedCount } = computeDelta(
    existing as Record<string, unknown> | null,
    invoiceRow as unknown as Record<string, unknown>,
    WATCHED_FIELDS
  )
  if (op === 'insert') {
    logger.info('DELTA', { invoice_id: invoiceId, op: 'insert', invoice_number: invoiceRow.invoice_number, status: invoiceRow.status })
  } else if (changedCount === 0) {
    logger.info('DELTA', { invoice_id: invoiceId, op: 'update', changed: 0, note: 'no watched fields changed' })
  } else {
    logger.info('DELTA', { invoice_id: invoiceId, op: 'update', changed: changedCount, ...changed })
  }

  const { error } = await supabase
    .from('invoices')
    .upsert(invoiceRow, { onConflict: 'zoho_invoice_id' })

  if (error) {
    logger.error('UPSERT_FAIL', { invoice_id: invoiceId, event: eventType, err: error.message })
    await logError(supabase, {
      event_type: eventType,
      zoho_entity_id: invoiceId,
      error_message: `Invoice upsert failed: ${error.message}`,
      payload: rawPayload,
    })
    throw error
  }

  logger.info('DONE', {
    invoice_id: invoiceId,
    event: eventType,
    op,
    changed: changedCount,
    status: invoiceRow.status,
    total: invoiceRow.total,
    balance: invoiceRow.balance,
    contact: invoice.customer_id ?? 'none',
  })
  return { op, changed, changedCount }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const t0 = Date.now()

  // ── Auth ───────────────────────────────────────────────────────────────────
  const expectedToken = Deno.env.get('ZOHO_WEBHOOK_TOKEN')
  if (!expectedToken) {
    logger.error('AUTH_FAIL', { reason: 'ZOHO_WEBHOOK_TOKEN env var not set' })
    return new Response('Unauthorized', { status: 401 })
  }

  const receivedToken = req.headers.get('x-zoho-webhook-token')
  if (!receivedToken) {
    logger.warn('AUTH_FAIL', { reason: 'x-zoho-webhook-token header missing' })
    return new Response('Unauthorized', { status: 401 })
  }
  if (!timingSafeEqualString(receivedToken, expectedToken)) {
    const masked = `${receivedToken.slice(0, 4)}...${receivedToken.slice(-4)}`
    logger.warn('AUTH_FAIL', { reason: 'token mismatch', received_masked: masked, expected_len: expectedToken.length })
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let rawPayload: ZohoWebhookPayload
  try {
    rawPayload = await req.json()
  } catch {
    logger.error('PARSE_FAIL', { reason: 'invalid JSON body' })
    return new Response('OK', { status: 200 })
  }

  const url = new URL(req.url)
  const rawEventType = rawPayload.event_type
    ?? rawPayload.webhook_event
    ?? url.searchParams.get('action')
    ?? undefined
  const eventType = normaliseEventType(rawEventType)

  logger.info('RECV', { event_raw: rawEventType ?? '(none)', event: eventType ?? 'unknown', url: url.pathname + url.search })

  if (!eventType) {
    logger.error('PARSE_FAIL', { reason: `unknown event_type "${rawEventType}"`, hint: 'add ?action=upsert to the Zoho webhook URL' })
    return new Response('OK', { status: 200 })
  }

  const raw = rawPayload as Record<string, unknown>
  const invoice = (raw['invoice'] ?? raw['data'] ?? rawPayload) as ZohoInvoicePayload | undefined
  if (!invoice?.invoice_id) {
    logger.error('PARSE_FAIL', { reason: 'cannot extract invoice_id', payload_keys: Object.keys(raw) })
    return new Response('OK', { status: 200 })
  }

  logger.info('PARSE', {
    invoice_id: invoice.invoice_id,
    event: eventType,
    invoice_number: invoice.invoice_number ?? '(absent)',
    status: invoice.status ?? '(absent)',
    customer_id: invoice.customer_id ?? '(absent)',
    balance: invoice.balance ?? '(absent)',
    last_modified: invoice.last_modified_time ?? '(absent)',
  })

  // ── Process ────────────────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const result = await handleUpsert(supabase, invoice, eventType, rawPayload)
    await logEvent({
      supabase,
      webhook_type:   'invoices',
      event_type:     eventType,
      zoho_entity_id: invoice.invoice_id,
      op:             result.op,
      changed_count:  result.changedCount,
      changed_fields: result.changed,
      status:         'success',
      duration_ms:    logger.elapsed(t0),
    })
  } catch (err) {
    const duration_ms = logger.elapsed(t0)
    logger.error('HANDLER_FAIL', { invoice_id: invoice.invoice_id, event: eventType, err: String(err), duration_ms })
    await logEvent({
      supabase,
      webhook_type:   'invoices',
      event_type:     eventType,
      zoho_entity_id: invoice.invoice_id,
      op:             null,
      changed_count:  null,
      changed_fields: null,
      status:         'error',
      duration_ms,
    })
  }

  return new Response('OK', { status: 200 })
})
