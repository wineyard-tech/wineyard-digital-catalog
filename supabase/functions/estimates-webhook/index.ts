// estimates-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Estimate events and syncs
// them to Supabase in real-time. Complements the batch sync path by keeping
// estimate status current within seconds of changes in Zoho.
//
// Event routing (single endpoint, create + update only):
//   estimate_created | estimate_updated  →  handleUpsert()  (UPSERT estimate row)
//
// No delete handler — estimates carry financial history and are not deleted
// via webhook. Always returns HTTP 200 to prevent Zoho retries. Failures are
// logged to the webhook_errors table for async investigation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { makeLogger, computeDelta, logEvent } from '../_shared/logger.ts'

const logger = makeLogger('[estimates-webhook]')

// Fields watched for delta logging — status transitions are the most important
// signal here (draft → sent → accepted → invoiced).
const WATCHED_FIELDS = [
  'status', 'total', 'subtotal', 'tax_total',
  'expiry_date', 'notes', 'zoho_contact_id', 'estimate_number',
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

interface ZohoEstimatePayload {
  estimate_id: string
  estimate_number?: string
  customer_id?: string
  customer_name?: string
  status?: string
  date?: string
  expiry_date?: string
  currency_code?: string
  exchange_rate?: number | ''
  line_items?: ZohoLineItem[]
  sub_total?: number | ''
  tax_total?: number | ''
  total?: number | ''
  notes?: string
  place_of_supply?: string
  gst_treatment?: string
  gstin?: string
  created_time?: string
  last_modified_time?: string
}

interface ZohoWebhookPayload {
  event_type?: string
  webhook_event?: string
  data?: ZohoEstimatePayload | Record<string, unknown>
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
  const CREATED = new Set(['estimate_created', 'create', 'created'])
  const UPDATED = new Set(['estimate_updated', 'update', 'updated', 'upsert'])
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
      webhook_type: 'estimates',
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
  estimate: ZohoEstimatePayload,
  eventType: string,
  rawPayload: unknown
): Promise<void> {
  const estimateId = estimate.estimate_id
  if (!estimateId) throw new Error('Missing estimate_id in payload')

  // ── Resolve contact_phone from local contacts table ─────────────────────────
  // Zoho estimate payloads include customer_id (= zoho_contact_id) but not phone.
  // contact_phone is NOT NULL so we look it up. Falls back to '' if the contact
  // is not yet synced locally (e.g. estimate webhook fires before contact webhook).
  let contactPhone = ''
  if (estimate.customer_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone')
      .eq('zoho_contact_id', estimate.customer_id)
      .maybeSingle()
    if (contact?.phone) {
      contactPhone = contact.phone
    } else {
      logger.warn('PHONE_MISS', { estimate_id: estimateId, customer_id: estimate.customer_id, note: 'contact not found locally — contact_phone will be empty' })
    }
  }

  logger.info('PHONE', { estimate_id: estimateId, customer_id: estimate.customer_id ?? 'none', phone: contactPhone || '(empty)' })

  // Field mapping follows the estimates table schema. zoho_sync_status is set to
  // 'synced' because this row arrived directly from Zoho — no pending push needed.
  const estimateRow = {
    zoho_estimate_id:  estimateId,
    estimate_number:   estimate.estimate_number || `ZOHO-EST-${estimateId}`,
    zoho_contact_id:   estimate.customer_id || null,
    contact_phone:     contactPhone,
    status:            estimate.status ?? 'draft',
    date:              estimate.date || null,
    expiry_date:       estimate.expiry_date || null,
    line_items:        estimate.line_items ?? [],
    subtotal:          dec(estimate.sub_total) ?? 0,
    tax_total:         dec(estimate.tax_total) ?? 0,
    total:             dec(estimate.total) ?? 0,
    notes:             estimate.notes || null,
    zoho_sync_status:  'synced',
    updated_at:        new Date().toISOString(),
  }

  // ── Delta: fetch existing record and log what changed ──────────────────────
  const { data: existing } = await supabase
    .from('estimates')
    .select(WATCHED_FIELDS.join(','))
    .eq('zoho_estimate_id', estimateId)
    .maybeSingle()

  const { op, changed, changedCount } = computeDelta(
    existing as Record<string, unknown> | null,
    estimateRow as unknown as Record<string, unknown>,
    WATCHED_FIELDS
  )
  if (op === 'insert') {
    logger.info('DELTA', { estimate_id: estimateId, op: 'insert', estimate_number: estimateRow.estimate_number, status: estimateRow.status })
  } else if (changedCount === 0) {
    logger.info('DELTA', { estimate_id: estimateId, op: 'update', changed: 0, note: 'no watched fields changed' })
  } else {
    logger.info('DELTA', { estimate_id: estimateId, op: 'update', changed: changedCount, ...changed })
  }

  const { error } = await supabase
    .from('estimates')
    .upsert(estimateRow, { onConflict: 'zoho_estimate_id' })

  if (error) {
    logger.error('UPSERT_FAIL', { estimate_id: estimateId, event: eventType, err: error.message })
    await logError(supabase, {
      event_type: eventType,
      zoho_entity_id: estimateId,
      error_message: `Estimate upsert failed: ${error.message}`,
      payload: rawPayload,
    })
    throw error
  }

  logger.info('DONE', {
    estimate_id: estimateId,
    event: eventType,
    op,
    changed: changedCount,
    status: estimateRow.status,
    total: estimateRow.total,
    contact: estimate.customer_id ?? 'none',
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
  if (receivedToken !== expectedToken) {
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
  const estimate = (raw['estimate'] ?? raw['data'] ?? rawPayload) as ZohoEstimatePayload | undefined
  if (!estimate?.estimate_id) {
    logger.error('PARSE_FAIL', { reason: 'cannot extract estimate_id', payload_keys: Object.keys(raw) })
    return new Response('OK', { status: 200 })
  }

  logger.info('PARSE', {
    estimate_id: estimate.estimate_id,
    event: eventType,
    estimate_number: estimate.estimate_number ?? '(absent)',
    status: estimate.status ?? '(absent)',
    customer_id: estimate.customer_id ?? '(absent)',
    last_modified: estimate.last_modified_time ?? '(absent)',
  })

  // ── Process ────────────────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const result = await handleUpsert(supabase, estimate, eventType, rawPayload)
    await logEvent({
      supabase,
      webhook_type:   'estimates',
      event_type:     eventType,
      zoho_entity_id: estimate.estimate_id,
      op:             result.op,
      changed_count:  result.changedCount,
      changed_fields: result.changed,
      status:         'success',
      duration_ms:    logger.elapsed(t0),
    })
  } catch (err) {
    const duration_ms = logger.elapsed(t0)
    logger.error('HANDLER_FAIL', { estimate_id: estimate.estimate_id, event: eventType, err: String(err), duration_ms })
    await logEvent({
      supabase,
      webhook_type:   'estimates',
      event_type:     eventType,
      zoho_entity_id: estimate.estimate_id,
      op:             null,
      changed_count:  null,
      changed_fields: null,
      status:         'error',
      duration_ms,
    })
  }

  return new Response('OK', { status: 200 })
})
