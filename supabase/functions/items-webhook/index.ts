// items-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Item events and syncs
// them to Supabase in real-time. Complements the 4x-daily batch sync
// (sync-items) by keeping the catalog current within seconds of changes.
//
// Event routing (single endpoint, all event types):
//   item_created | item_updated  →  handleUpsert()  (UPSERT item + locations)
//   item_deleted                 →  handleDelete()  (soft-delete: status='inactive', never hard-delete)
//
// Always returns HTTP 200 — even on processing errors — to prevent Zoho
// from re-delivering the same webhook endlessly. Failures are logged to
// the webhook_errors table for async investigation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { makeLogger, computeDelta, logEvent } from '../_shared/logger.ts'
import { timingSafeEqualString } from '../_shared/webhook-auth.ts'

const logger = makeLogger('[items-webhook]')

// Fields watched for delta logging — tracks the changes that matter most
// operationally (pricing, stock, status).
const WATCHED_FIELDS = [
  'status', 'base_rate', 'purchase_rate',
  'available_stock', 'actual_available_stock',
  'brand', 'category_name', 'tax_percentage',
  'item_name', 'sku',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZohoWarehouse {
  warehouse_id: string
  warehouse_name: string
  status?: string
  is_primary?: boolean
  warehouse_stock_on_hand?: number | ''
  warehouse_available_stock?: number | ''
  warehouse_actual_available_stock?: number | ''
}

interface ZohoItemPayload {
  item_id: string
  name: string
  sku?: string
  status?: string
  item_type?: string
  product_type?: string
  rate?: number | ''
  purchase_rate?: number | ''
  description?: string
  category_id?: string
  category_name?: string
  brand?: string
  manufacturer_name?: string
  hsn_or_sac?: string
  unit?: string
  is_taxable?: boolean
  tax_id?: string
  tax_name?: string
  tax_percentage?: number | ''
  track_inventory?: boolean
  available_stock?: number | ''
  actual_available_stock?: number | ''
  reorder_level?: number | ''
  upc?: string
  ean?: string
  part_number?: string
  image_documents?: Array<{ image_url: string }>
  custom_fields?: Record<string, unknown>
  warehouses?: ZohoWarehouse[]
  created_time?: string
  last_modified_time?: string
}

interface ZohoWebhookPayload {
  event_type?: string
  webhook_event?: string
  data?: ZohoItemPayload | Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function int(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : Math.round(n)
}

function dec(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function normaliseEventType(raw: string | undefined): 'created' | 'updated' | 'deleted' | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '_')
  const CREATED = new Set(['item_created', 'create', 'created'])
  const UPDATED = new Set(['item_updated', 'update', 'updated', 'upsert'])
  const DELETED = new Set(['item_deleted', 'delete', 'deleted'])
  if (CREATED.has(lower)) return 'created'
  if (UPDATED.has(lower)) return 'updated'
  if (DELETED.has(lower)) return 'deleted'
  return null
}

async function logError(
  supabase: SupabaseClient,
  opts: { event_type: string; zoho_entity_id?: string; error_message: string; payload: unknown }
): Promise<void> {
  try {
    await supabase.from('webhook_errors').insert({
      webhook_type: 'items',
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
  item: ZohoItemPayload,
  eventType: string,
  rawPayload: unknown
): Promise<void> {
  const itemId = item.item_id
  if (!itemId) throw new Error('Missing item_id in payload')
  if (!item.name) throw new Error(`Missing item name for item_id=${itemId}`)

  // ── 1. Upsert categories if present ────────────────────────────────────────
  if (item.category_id && item.category_name) {
    const { error: catErr } = await supabase
      .from('categories')
      .upsert(
        { zoho_category_id: item.category_id, category_name: item.category_name },
        { onConflict: 'zoho_category_id', ignoreDuplicates: false }
      )
    if (catErr) logger.warn('CATEGORY_WARN', { item_id: itemId, err: catErr.message })
  }

  // ── 2. Upsert brand if present ─────────────────────────────────────────────
  if (item.brand?.trim()) {
    const { error: brandErr } = await supabase
      .from('brands')
      .upsert({ brand_name: item.brand.trim() }, { onConflict: 'brand_name', ignoreDuplicates: true })
    if (brandErr) logger.warn('BRAND_WARN', { item_id: itemId, err: brandErr.message })
  }

  // ── 3. Build item row ──────────────────────────────────────────────────────
  const itemRow = {
    zoho_item_id:              itemId,
    item_name:                 item.name,
    sku:                       item.sku?.trim() || `ITEM-${itemId}`,
    category_id:               item.category_id  || null,
    category_name:             item.category_name || null,
    brand:                     item.brand?.trim() || null,
    manufacturer:              item.manufacturer_name || null,
    description:               item.description || null,
    hsn_or_sac:                item.hsn_or_sac || null,
    unit:                      item.unit || 'pcs',
    status:                    item.status ?? 'active',
    item_type:                 item.item_type || 'inventory',
    product_type:              item.product_type || 'goods',
    base_rate:                 dec(item.rate),
    purchase_rate:             dec(item.purchase_rate),
    is_taxable:                item.is_taxable ?? true,
    tax_id:                    item.tax_id || null,
    tax_name:                  item.tax_name || null,
    tax_percentage:            dec(item.tax_percentage) ?? 18.0,
    track_inventory:           item.track_inventory ?? false,
    available_stock:           int(item.available_stock),
    actual_available_stock:    int(item.actual_available_stock),
    reorder_level:             int(item.reorder_level),
    upc:                       item.upc || null,
    ean:                       item.ean || null,
    part_number:               item.part_number || null,
    // image_urls:                (item.image_documents ?? []).map((img) => img.image_url).filter(Boolean), // Ignore from sync (will be updated manually and directly)
    custom_fields:             item.custom_fields ?? {},
    created_time:              item.created_time || null,
    last_modified_time:        item.last_modified_time || null,
    updated_at:                new Date().toISOString(),
  }

  // ── 4. Delta: fetch existing record and log what changed ───────────────────
  const { data: existing } = await supabase
    .from('items')
    .select(WATCHED_FIELDS.join(','))
    .eq('zoho_item_id', itemId)
    .maybeSingle()

  const { op, changed, changedCount } = computeDelta(
    existing as Record<string, unknown> | null,
    itemRow as unknown as Record<string, unknown>,
    WATCHED_FIELDS
  )
  if (op === 'insert') {
    logger.info('DELTA', { item_id: itemId, op: 'insert' })
  } else if (changedCount === 0) {
    logger.info('DELTA', { item_id: itemId, op: 'update', changed: 0, note: 'no watched fields changed' })
  } else {
    logger.info('DELTA', { item_id: itemId, op: 'update', changed: changedCount, ...changed })
  }

  // ── 5. Upsert the item row ─────────────────────────────────────────────────
  const { error: itemErr } = await supabase
    .from('items')
    .upsert(itemRow, { onConflict: 'zoho_item_id' })

  if (itemErr) {
    logger.error('UPSERT_FAIL', { item_id: itemId, event: eventType, err: itemErr.message })
    await logError(supabase, {
      event_type: eventType,
      zoho_entity_id: itemId,
      error_message: `Item upsert failed: ${itemErr.message}`,
      payload: rawPayload,
    })
    throw itemErr
  }

  // ── 6. Sync warehouse locations ────────────────────────────────────────────
  // Delete-then-insert so that removing a warehouse is correctly reflected.
  const warehouses: ZohoWarehouse[] = item.warehouses ?? []

  const { error: delErr } = await supabase
    .from('item_locations')
    .delete()
    .eq('zoho_item_id', itemId)

  if (delErr) {
    logger.warn('LOCATIONS_DEL_WARN', { item_id: itemId, err: delErr.message })
  }

  const locationRows = warehouses
    .filter((w) => w.warehouse_id)
    .map((w) => ({
      zoho_item_id:                  itemId,
      zoho_location_id:              w.warehouse_id,
      location_name:                 w.warehouse_name,
      location_status:               w.status ?? 'active',
      is_primary:                    w.is_primary ?? false,
      stock_on_hand:                 int(w.warehouse_stock_on_hand) ?? 0,
      available_stock:               int(w.warehouse_available_stock) ?? 0,
      actual_available_stock:        int(w.warehouse_actual_available_stock) ?? 0,
      updated_at:                    new Date().toISOString(),
    }))

  if (locationRows.length > 0) {
    const { error: locErr } = await supabase
      .from('item_locations')
      .insert(locationRows)

    if (locErr) {
      logger.warn('LOCATIONS_INS_WARN', { item_id: itemId, count: locationRows.length, err: locErr.message })
      await logError(supabase, {
        event_type: eventType,
        zoho_entity_id: itemId,
        error_message: `item_locations insert failed: ${locErr.message}`,
        payload: rawPayload,
      })
    }
  }

  logger.info('DONE', {
    item_id: itemId,
    event: eventType,
    op,
    changed: changedCount,
    warehouses: locationRows.length,
  })
  return { op, changed, changedCount }
}

// ── Delete handler (soft-delete) ─────────────────────────────────────────────

async function handleDelete(
  supabase: SupabaseClient,
  item: ZohoItemPayload,
  rawPayload: unknown
): Promise<void> {
  const itemId = item.item_id
  if (!itemId) throw new Error('Missing item_id in delete payload')

  logger.info('DELETE', { item_id: itemId, note: 'soft-deleting item + locations' })

  const { error: itemErr } = await supabase
    .from('items')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('zoho_item_id', itemId)

  if (itemErr) {
    logger.error('DELETE_FAIL', { item_id: itemId, err: itemErr.message })
    await logError(supabase, {
      event_type: 'deleted',
      zoho_entity_id: itemId,
      error_message: `Soft-delete failed: ${itemErr.message}`,
      payload: rawPayload,
    })
    throw itemErr
  }

  const { error: locErr } = await supabase
    .from('item_locations')
    .update({ location_status: 'inactive', updated_at: new Date().toISOString() })
    .eq('zoho_item_id', itemId)

  if (locErr) {
    logger.warn('LOCATIONS_DEACTIVATE_WARN', { item_id: itemId, err: locErr.message })
  }

  logger.info('DONE', { item_id: itemId, event: 'deleted', op: 'soft-delete' })
  return { op: 'soft-delete' as const, changed: {}, changedCount: 0 }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const t0 = Date.now()

  // ── Auth ───────────────────────────────────────────────────────────────────
  const expectedToken = Deno.env.get('ZOHO_WEBHOOK_TOKEN_ITEMS')
  if (!expectedToken) {
    logger.error('AUTH_FAIL', { reason: 'ZOHO_WEBHOOK_TOKEN_ITEMS env var not set' })
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
    logger.error('PARSE_FAIL', { reason: `unknown event_type "${rawEventType}"`, hint: 'add ?action=upsert or ?action=delete to the Zoho webhook URL' })
    return new Response('OK', { status: 200 })
  }

  const raw = rawPayload as Record<string, unknown>
  const item = (raw['item'] ?? raw['data'] ?? rawPayload) as ZohoItemPayload | undefined
  if (!item?.item_id) {
    logger.error('PARSE_FAIL', { reason: 'cannot extract item_id', payload_keys: Object.keys(raw) })
    return new Response('OK', { status: 200 })
  }

  logger.info('PARSE', { item_id: item.item_id, event: eventType, name: item.name, sku: item.sku })

  // ── Process ────────────────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const result = eventType === 'deleted'
      ? await handleDelete(supabase, item, rawPayload)
      : await handleUpsert(supabase, item, eventType, rawPayload)

    await logEvent({
      supabase,
      webhook_type:   'items',
      event_type:     eventType,
      zoho_entity_id: item.item_id,
      op:             result.op,
      changed_count:  result.changedCount,
      changed_fields: result.changed,
      status:         'success',
      duration_ms:    logger.elapsed(t0),
    })
  } catch (err) {
    const duration_ms = logger.elapsed(t0)
    logger.error('HANDLER_FAIL', { item_id: item.item_id, event: eventType, err: String(err), duration_ms })
    await logEvent({
      supabase,
      webhook_type:   'items',
      event_type:     eventType,
      zoho_entity_id: item.item_id,
      op:             null,
      changed_count:  null,
      changed_fields: null,
      status:         'error',
      duration_ms,
    })
  }

  return new Response('OK', { status: 200 })
})
