// items-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Item events and syncs
// them to Supabase in real-time. Complements the 4x-daily batch sync
// (sync-items) by keeping the catalog current within seconds of changes.
//
// Event routing (single endpoint, all event types):
//   item_created | item_updated  →  handleUpsert()
//   item_deleted                 →  handleDelete()
//
// Always returns HTTP 200 — even on processing errors — to prevent Zoho
// from re-delivering the same webhook endlessly. Failures are logged to
// the webhook_errors table for async investigation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Zoho sends either "item_created"/"item_updated"/"item_deleted" (snake_case)
// or "Create"/"Update"/"Delete" depending on webhook version — handle both.
interface ZohoWebhookPayload {
  event_type?: string   // "item_created" | "item_updated" | "item_deleted"
  webhook_event?: string // "Create" | "Update" | "Delete" (older format)
  data?: ZohoItemPayload | Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce Zoho's empty-string numeric fields to null for Postgres INTEGER columns. */
function int(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : Math.round(n)
}

/** Same coercion for DECIMAL columns. */
function dec(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

/**
 * Normalise Zoho's event_type to one of: 'created' | 'updated' | 'deleted' | null.
 * Zoho may send: "item_created", "item.created", "Create", "Update", "Delete", etc.
 * Uses an exact allow-list rather than substring match to avoid misrouting future
 * Zoho event types (e.g., "item_reactivated" would otherwise match 'created').
 */
function normaliseEventType(raw: string | undefined): 'created' | 'updated' | 'deleted' | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '_')
  const CREATED = new Set(['item_created', 'create', 'created'])
  const UPDATED = new Set(['item_updated', 'update', 'updated'])
  const DELETED = new Set(['item_deleted', 'delete', 'deleted'])
  if (CREATED.has(lower)) return 'created'
  if (UPDATED.has(lower)) return 'updated'
  if (DELETED.has(lower)) return 'deleted'
  return null
}

/** Log a processing failure to webhook_errors. Never throws. */
async function logError(
  supabase: SupabaseClient,
  opts: {
    event_type: string
    zoho_entity_id?: string
    error_message: string
    payload: unknown
  }
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
    // If even error logging fails, at least emit to function logs
    console.error('Failed to log webhook error:', e)
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
    if (catErr) console.warn(`Category upsert warning (${itemId}):`, catErr.message)
  }

  // ── 2. Upsert brand if present ─────────────────────────────────────────────
  if (item.brand?.trim()) {
    const { error: brandErr } = await supabase
      .from('brands')
      .upsert({ brand_name: item.brand.trim() }, { onConflict: 'brand_name', ignoreDuplicates: true })
    if (brandErr) console.warn(`Brand upsert warning (${itemId}):`, brandErr.message)
  }

  // ── 3. Upsert the item row ─────────────────────────────────────────────────
  // Field mapping mirrors sync-items/index.ts so both sync paths are consistent.
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
    image_urls:                (item.image_documents ?? []).map((img) => img.image_url).filter(Boolean),
    custom_fields:             item.custom_fields ?? {},
    created_time:              item.created_time || null,
    last_modified_time:        item.last_modified_time || null,
    updated_at:                new Date().toISOString(),
  }

  const { error: itemErr } = await supabase
    .from('items')
    .upsert(itemRow, { onConflict: 'zoho_item_id' })

  if (itemErr) {
    await logError(supabase, {
      event_type: eventType,
      zoho_entity_id: itemId,
      error_message: `Item upsert failed: ${itemErr.message}`,
      payload: rawPayload,
    })
    throw itemErr
  }

  // ── 4. Sync warehouse locations ────────────────────────────────────────────
  // Delete-then-insert (not UPSERT) because we must replace the full set of
  // locations atomically. A partial update leaves stale rows for any warehouse
  // that was removed. Crucially, the delete runs even when warehouses=[] so
  // that removing all locations from an item is correctly reflected.
  // The item row already exists at this point, so the FK constraint is satisfied.
  const warehouses: ZohoWarehouse[] = item.warehouses ?? []

  // Always delete existing locations — catches the "all warehouses removed" case
  const { error: delErr } = await supabase
    .from('item_locations')
    .delete()
    .eq('zoho_item_id', itemId)

  if (delErr) {
    console.warn(`item_locations delete warning (${itemId}):`, delErr.message)
  }

  // Only insert if there are warehouses to sync
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
      // Non-fatal: item is already saved; log but don't fail the whole request
      console.warn(`item_locations insert warning (${itemId}):`, locErr.message)
      await logError(supabase, {
        event_type: eventType,
        zoho_entity_id: itemId,
        error_message: `item_locations insert failed: ${locErr.message}`,
        payload: rawPayload,
      })
    }
  }

  console.log(`[items-webhook] ${eventType} OK — item_id=${itemId}, warehouses=${locationRows.length}`)
}

// ── Delete handler ────────────────────────────────────────────────────────────

async function handleDelete(
  supabase: SupabaseClient,
  item: ZohoItemPayload,
  rawPayload: unknown
): Promise<void> {
  const itemId = item.item_id
  if (!itemId) throw new Error('Missing item_id in delete payload')

  // CASCADE on item_locations means child rows are auto-deleted when the item row goes.
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('zoho_item_id', itemId)

  if (error) {
    await logError(supabase, {
      event_type: 'deleted',
      zoho_entity_id: itemId,
      error_message: `Delete failed: ${error.message}`,
      payload: rawPayload,
    })
    throw error
  }

  console.log(`[items-webhook] deleted OK — item_id=${itemId}`)
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const expectedToken = Deno.env.get('ZOHO_WEBHOOK_TOKEN_ITEMS')
  if (!expectedToken) {
    // Misconfigured deployment — log clearly so ops can diagnose, still reject
    console.error('[items-webhook] ZOHO_WEBHOOK_TOKEN_ITEMS env var is not set')
    return new Response('Unauthorized', { status: 401 })
  }

  const receivedToken = req.headers.get('x-zoho-webhook-token')
  if (!receivedToken) {
    console.warn('[items-webhook] 401 — x-zoho-webhook-token header is MISSING from request. Zoho custom header not configured.')
    return new Response('Unauthorized', { status: 401 })
  }
  if (receivedToken !== expectedToken) {
    const masked = `${receivedToken.slice(0, 4)}...${receivedToken.slice(-4)}`
    console.warn(`[items-webhook] 401 — token MISMATCH. Received: "${masked}" (len=${receivedToken.length}), Expected len=${expectedToken.length}`)
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let rawPayload: ZohoWebhookPayload
  try {
    rawPayload = await req.json()
  } catch {
    console.error('[items-webhook] Failed to parse JSON body')
    // Malformed body — return 200 anyway (Zoho should not retry parse failures)
    return new Response('OK', { status: 200 })
  }

  // Resolve event type from either field Zoho might send
  const rawEventType = rawPayload.event_type ?? rawPayload.webhook_event
  const eventType = normaliseEventType(rawEventType)

  if (!eventType) {
    console.error(`[items-webhook] Unknown event_type: "${rawEventType}"`)
    return new Response('OK', { status: 200 })
  }

  // Zoho normally embeds the item under rawPayload.data, but some webhook
  // versions send the item at the top level (rawPayload.item_id directly).
  // Fall back to the top-level payload shape if .data is absent.
  const item = (rawPayload.data ?? rawPayload) as ZohoItemPayload | undefined
  if (!item?.item_id) {
    console.error('[items-webhook] Cannot extract item_id from payload:', JSON.stringify(rawPayload))
    return new Response('OK', { status: 200 })
  }

  console.log(`[items-webhook] Received event="${eventType}" item_id="${item.item_id}"`)

  // ── Process ────────────────────────────────────────────────────────────────
  // Create a fresh client per request — Edge Functions are stateless and
  // reusing a module-level singleton risks cross-request token contamination.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    if (eventType === 'deleted') {
      await handleDelete(supabase, item, rawPayload)
    } else {
      // 'created' or 'updated' — same upsert path
      await handleUpsert(supabase, item, eventType, rawPayload)
    }
  } catch (err) {
    // Error already logged inside handlers; return 200 to stop Zoho retries.
    console.error(`[items-webhook] Processing error (${eventType}):`, err)
  }

  return new Response('OK', { status: 200 })
})
