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

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

function dec(val: any): number | null {
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
  pricebook_id?: string // sometimes top-level on delete
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleUpsert(
  supabase: SupabaseClient,
  pricebookId: string,
  pricebookName: string
): Promise<void> {
  // 1. Upsert pricebook metadata
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
    console.error(`handleUpsert: catalog upsert failed for ${pricebookId}:`, catalogErr.message)
    return
  }

  // 2. Fetch full pricebook with item prices from Zoho (webhook payload may be partial)
  let token: string
  try {
    token = await getZohoToken(supabase)
  } catch (e) {
    console.error('handleUpsert: token fetch failed:', String(e))
    return
  }

  let pbDetail: any
  try {
    pbDetail = await zohoGet(`/pricebooks/${pricebookId}`, token, ORG_ID)
  } catch (e) {
    console.error(`handleUpsert: detail fetch failed for ${pricebookId}:`, String(e))
    return
  }

  const pbItems: ZohoPricebookItem[] = pbDetail?.pricebook?.items ?? []
  if (pbItems.length === 0) {
    console.log(`handleUpsert: pricebook ${pricebookId} has no items, skipping price upsert`)
    return
  }

  // 3. Failsafe — ensure all referenced items exist (stubs for unknown items)
  const itemIds = pbItems.map(i => i.item_id)

  const { data: existingItems } = await supabase
    .from('items')
    .select('zoho_item_id')
    .in('zoho_item_id', itemIds)

  const existingSet = new Set((existingItems ?? []).map((r: any) => r.zoho_item_id))
  const missingIds = itemIds.filter(id => !existingSet.has(id))

  if (missingIds.length > 0) {
    console.log(`handleUpsert: creating ${missingIds.length} stub items for pricebook ${pricebookId}`)
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

      if (stubErr) console.warn(`Stub item ${id}:`, stubErr.message)
    }
  }

  // 4. Upsert item prices in batches
  const priceRows = pbItems.map(pi => ({
    zoho_pricebook_id: pricebookId,
    zoho_item_id: pi.item_id,
    custom_rate: dec(pi.rate) ?? 0,
    updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < priceRows.length; i += 200) {
    const batch = priceRows.slice(i, i + 200)
    const { error: priceErr } = await supabase
      .from('pricebook_items')
      .upsert(batch, { onConflict: 'zoho_pricebook_id,zoho_item_id' })

    if (priceErr) {
      // Retry row-by-row to isolate failures
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('pricebook_items')
          .upsert(row, { onConflict: 'zoho_pricebook_id,zoho_item_id' })
        if (rowErr) console.warn(`Price row ${pricebookId}/${row.zoho_item_id}:`, rowErr.message)
      }
    }
  }

  console.log(`handleUpsert: done for pricebook ${pricebookId}, ${priceRows.length} prices upserted`)
}

async function handleDelete(supabase: SupabaseClient, pricebookId: string): Promise<void> {
  // Soft-delete: mark inactive rather than hard-delete to preserve audit trail.
  // ON DELETE CASCADE on pricebook_items will handle cleanup if needed later.
  const { error } = await supabase
    .from('pricebook_catalog')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('zoho_pricebook_id', pricebookId)

  if (error) {
    console.error(`handleDelete: failed for ${pricebookId}:`, error.message)
  } else {
    console.log(`handleDelete: pricebook ${pricebookId} marked inactive`)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  // Always return 200 to prevent Zoho from re-delivering
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 })
  }

  let payload: ZohoWebhookPayload
  try {
    payload = await req.json()
  } catch {
    console.warn('pricebooks-webhook: invalid JSON payload')
    return new Response('OK', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Normalise event type — Zoho sends either snake_case or PascalCase
  const rawEvent = (payload.event_type ?? payload.operation ?? '').toLowerCase()
  const isDelete = rawEvent.includes('delete')
  const isUpsert = rawEvent.includes('create') || rawEvent.includes('update')

  const pricebookId =
    payload.pricebook?.pricebook_id ?? payload.pricebook_id ?? ''
  const pricebookName =
    payload.pricebook?.pricebook_name ?? `Pricebook ${pricebookId}`

  if (!pricebookId) {
    console.warn('pricebooks-webhook: missing pricebook_id in payload', JSON.stringify(payload))
    return new Response('OK', { status: 200 })
  }

  console.log(`pricebooks-webhook: ${rawEvent} for pricebook ${pricebookId}`)

  try {
    if (isDelete) {
      await handleDelete(supabase, pricebookId)
    } else if (isUpsert) {
      await handleUpsert(supabase, pricebookId, pricebookName)
    } else {
      console.warn(`pricebooks-webhook: unknown event_type "${rawEvent}", treating as upsert`)
      await handleUpsert(supabase, pricebookId, pricebookName)
    }
  } catch (err) {
    // Log but never fail — Zoho must receive 200
    console.error('pricebooks-webhook: unhandled error:', String(err))
  }

  return new Response('OK', { status: 200 })
})
