// pricebooks-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Pricebook events and syncs
// them in real-time. Complements the weekly sync-pricebooks batch.
//
// Event routing:
//   pricebook_created | pricebook_updated  →  handleUpsert()
//   pricebook_deleted                      →  handleDelete() (marks is_active=false)
//
// Always returns HTTP 200 to prevent Zoho from re-delivering endlessly.
// Errors are logged but never bubble up as 4xx/5xx to Zoho.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, zohoGet } from '../_shared/zoho-client.ts'
import { makeLogger, logEvent } from '../_shared/logger.ts'

const logger = makeLogger('[pricebooks-webhook]')
const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

function dec(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

interface ZohoPricebookItem {
  item_id: string
  rate: number | string
}

interface ZohoPricebookPayload {
  pricebook_id: string
  pricebook_name?: string
  status?: string
  items?: ZohoPricebookItem[]
}

interface ZohoWebhookPayload {
  event_type?: string
  operation?: string
  pricebook?: ZohoPricebookPayload
  pricebook_id?: string
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleUpsert(
  supabase: SupabaseClient,
  pricebookId: string,
  pricebookName: string
): Promise<void> {
  // 1. Upsert pricebook metadata
  logger.info('CATALOG_UPSERT', { pricebook_id: pricebookId, name: pricebookName })

  const { error: catalogErr } = await supabase
    .from('pricebook_catalog')
    .upsert({
      zoho_pricebook_id: pricebookId,
      pricebook_name: pricebookName,
      is_active: true,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'zoho_pricebook_id' })

  if (catalogErr) {
    logger.error('CATALOG_UPSERT_FAIL', { pricebook_id: pricebookId, err: catalogErr.message })
    return
  }

  // 2. Fetch full pricebook with item prices from Zoho (webhook payload may be partial)
  logger.info('ZOHO_FETCH', { pricebook_id: pricebookId, note: 'fetching full pricebook detail from Zoho' })

  let token: string
  try {
    token = await getZohoToken(supabase)
  } catch (e) {
    logger.error('TOKEN_FAIL', { pricebook_id: pricebookId, err: String(e) })
    return
  }

  let pbDetail: Record<string, unknown>
  try {
    pbDetail = await zohoGet(`/pricebooks/${pricebookId}`, token, ORG_ID)
  } catch (e) {
    logger.error('ZOHO_FETCH_FAIL', { pricebook_id: pricebookId, err: String(e) })
    return
  }

  const pbItems: ZohoPricebookItem[] = (pbDetail as Record<string, unknown> & { pricebook?: { items?: ZohoPricebookItem[] } })?.pricebook?.items ?? []
  logger.info('ZOHO_FETCH_OK', { pricebook_id: pricebookId, item_count: pbItems.length })

  if (pbItems.length === 0) {
    logger.info('DONE', { pricebook_id: pricebookId, note: 'no items — skipping price upsert' })
    return
  }

  // 3. Failsafe — ensure all referenced items exist locally (create stubs for unknowns)
  const itemIds = pbItems.map(i => i.item_id)
  const { data: existingItems } = await supabase
    .from('items')
    .select('zoho_item_id')
    .in('zoho_item_id', itemIds)

  const existingSet = new Set((existingItems ?? []).map((r: Record<string, unknown>) => r.zoho_item_id as string))
  const missingIds = itemIds.filter(id => !existingSet.has(id))

  if (missingIds.length > 0) {
    logger.warn('STUBS', { pricebook_id: pricebookId, count: missingIds.length, ids: missingIds })
    for (const id of missingIds) {
      const { error: stubErr } = await supabase
        .from('items')
        .upsert({
          zoho_item_id: id,
          item_name: `[Stub] ${id}`,
          sku: `STUB-${id}`,
          status: 'inactive',
          base_rate: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'zoho_item_id', ignoreDuplicates: true })

      if (stubErr) logger.warn('STUB_WARN', { item_id: id, err: stubErr.message })
    }
  }

  // 4. Upsert item prices in batches of 200
  const priceRows = pbItems.map(pi => ({
    zoho_pricebook_id: pricebookId,
    zoho_item_id: pi.item_id,
    custom_rate: dec(pi.rate) ?? 0,
    updated_at: new Date().toISOString(),
  }))

  let upsertedCount = 0
  let failedCount = 0

  for (let i = 0; i < priceRows.length; i += 200) {
    const batch = priceRows.slice(i, i + 200)
    const { error: priceErr } = await supabase
      .from('pricebook_items')
      .upsert(batch, { onConflict: 'zoho_pricebook_id,zoho_item_id' })

    if (priceErr) {
      logger.warn('PRICES_BATCH_WARN', { pricebook_id: pricebookId, batch_start: i, err: priceErr.message, note: 'falling back to row-by-row' })
      // Retry row-by-row to isolate individual failures
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('pricebook_items')
          .upsert(row, { onConflict: 'zoho_pricebook_id,zoho_item_id' })
        if (rowErr) {
          logger.warn('PRICE_ROW_WARN', { pricebook_id: pricebookId, item_id: row.zoho_item_id, err: rowErr.message })
          failedCount++
        } else {
          upsertedCount++
        }
      }
    } else {
      upsertedCount += batch.length
    }
  }

  logger.info('DONE', { pricebook_id: pricebookId, upserted: upsertedCount, failed: failedCount })
  return { upsertedCount, failedCount }
}

async function handleDelete(supabase: SupabaseClient, pricebookId: string): Promise<void> {
  logger.info('DELETE', { pricebook_id: pricebookId, note: 'soft-deleting — marking is_active=false' })

  const { error } = await supabase
    .from('pricebook_catalog')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('zoho_pricebook_id', pricebookId)

  if (error) {
    logger.error('DELETE_FAIL', { pricebook_id: pricebookId, err: error.message })
  } else {
    logger.info('DONE', { pricebook_id: pricebookId, event: 'deleted', op: 'soft-delete' })
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const t0 = Date.now()

  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 })
  }

  let payload: ZohoWebhookPayload
  try {
    payload = await req.json()
  } catch {
    logger.error('PARSE_FAIL', { reason: 'invalid JSON body' })
    return new Response('OK', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const rawEvent = (payload.event_type ?? payload.operation ?? '').toLowerCase()
  const isDelete = rawEvent.includes('delete')
  const isUpsert = rawEvent.includes('create') || rawEvent.includes('update')

  const pricebookId   = payload.pricebook?.pricebook_id ?? payload.pricebook_id ?? ''
  const pricebookName = payload.pricebook?.pricebook_name ?? `Pricebook ${pricebookId}`

  logger.info('RECV', { event_raw: rawEvent || '(none)', pricebook_id: pricebookId || '(missing)' })

  if (!pricebookId) {
    logger.error('PARSE_FAIL', { reason: 'missing pricebook_id', payload_keys: Object.keys(payload) })
    return new Response('OK', { status: 200 })
  }

  logger.info('PARSE', { pricebook_id: pricebookId, name: pricebookName, is_delete: isDelete, is_upsert: isUpsert })

  try {
    if (isDelete) {
      await handleDelete(supabase, pricebookId)
      await logEvent({
        supabase,
        webhook_type:   'pricebooks',
        event_type:     'deleted',
        zoho_entity_id: pricebookId,
        op:             'soft-delete',
        changed_count:  null,
        changed_fields: null,
        status:         'success',
        duration_ms:    logger.elapsed(t0),
      })
    } else {
      if (!isUpsert) logger.warn('UNKNOWN_EVENT', { event_raw: rawEvent, note: 'treating as upsert' })
      const { upsertedCount, failedCount } = await handleUpsert(supabase, pricebookId, pricebookName)
      await logEvent({
        supabase,
        webhook_type:   'pricebooks',
        event_type:     rawEvent || 'upsert',
        zoho_entity_id: pricebookId,
        op:             'update',
        changed_count:  upsertedCount,
        changed_fields: failedCount > 0 ? { failed_rows: { from: null, to: failedCount } } : null,
        status:         'success',
        duration_ms:    logger.elapsed(t0),
      })
    }
  } catch (err) {
    const duration_ms = logger.elapsed(t0)
    logger.error('HANDLER_FAIL', { pricebook_id: pricebookId, event: rawEvent, err: String(err), duration_ms })
    await logEvent({
      supabase,
      webhook_type:   'pricebooks',
      event_type:     rawEvent || 'unknown',
      zoho_entity_id: pricebookId,
      op:             null,
      changed_count:  null,
      changed_fields: null,
      status:         'error',
      duration_ms,
    })
  }

  return new Response('OK', { status: 200 })
})
