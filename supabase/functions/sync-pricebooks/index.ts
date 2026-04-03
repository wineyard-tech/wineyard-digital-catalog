// sync-pricebooks Edge Function
// Full sync: fetches all active pricebooks from Zoho and upserts item prices.
// Runs weekly (Sundays at 03:30 AM IST) via pg_cron, or triggered manually.
//
// Failsafe: if a pricebook references a zoho_item_id not yet in `items`,
// a stub item row is inserted (status='inactive') so the FK is satisfied.
// sync-items will overwrite the stub with real data on its next run.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, fetchAllZohoPages, zohoGet } from '../_shared/zoho-client.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

/** Coerce Zoho decimal strings/empty to number | null */
function dec(val: any): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const token = await getZohoToken(supabase)

    // ── Step 1: Fetch all pricebook metadata ──────────────────────────────────
    const pricebookList = await fetchAllZohoPages<any>(
      '/pricebooks',
      token,
      ORG_ID,
      'pricebooks'
    )
    console.log(`Found ${pricebookList.length} pricebooks in Zoho`)

    let pricebooksUpserted = 0
    let itemPricesUpserted = 0
    let stubItemsCreated = 0
    const errors: string[] = []

    for (const pb of pricebookList) {
      const pricebookId: string = pb.pricebook_id
      const pricebookName: string = pb.pricebook_name ?? pb.name ?? `Pricebook ${pricebookId}`

      // ── Step 2: Upsert pricebook metadata ─────────────────────────────────
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
        errors.push(`Pricebook ${pricebookId} catalog upsert: ${catalogErr.message}`)
        continue
      }
      pricebooksUpserted++

      // ── Step 3: Fetch all pricebook_items pages for this pricebook ────────────
      const pbItems: Array<{ item_id: string; pricebook_rate?: number; rate?: number }> = []
      let pbPage = 1
      let pbFailed = false
      while (true) {
        let pbDetail: any
        try {
          pbDetail = await zohoGet(`/pricebooks/${pricebookId}`, token, ORG_ID, { page: pbPage, per_page: 200 })
        } catch (e) {
          errors.push(`Pricebook ${pricebookId} detail fetch p${pbPage}: ${String(e)}`)
          pbFailed = true
          break
        }
        const pageItems: Array<{ item_id: string; pricebook_rate?: number; rate?: number }> =
          pbDetail?.pricebook?.pricebook_items ?? []
        pbItems.push(...pageItems)
        // Dual-condition: Zoho's has_more_page can be wrong when items list is filtered.
        // Only stop when both has_more_page is false AND we got a partial page.
        if (pageItems.length === 0) break
        if (!pbDetail?.page_context?.has_more_page && pageItems.length < 200) break
        pbPage++
      }
      if (pbFailed) continue

      if (pbItems.length === 0) continue

      // ── Step 4: Failsafe — ensure all referenced items exist ───────────────
      // Collect item IDs referenced by this pricebook
      const itemIds = pbItems.map(i => i.item_id)

      // Find which ones are missing from `items`
      const { data: existingItems } = await supabase
        .from('items')
        .select('zoho_item_id')
        .in('zoho_item_id', itemIds)

      const existingSet = new Set((existingItems ?? []).map((r: any) => r.zoho_item_id))
      const missingIds = itemIds.filter(id => !existingSet.has(id))

      if (missingIds.length > 0) {
        console.log(`Creating ${missingIds.length} stub items for pricebook ${pricebookId}`)
        const stubs = missingIds.map(id => ({
          zoho_item_id: id,
          item_name: `[Stub] ${id}`,
          sku: `STUB-${id}`,
          status: 'inactive',           // invisible to catalog until sync-items fills it in
          base_rate: 0,
          updated_at: new Date().toISOString(),
        }))

        // Row-by-row to avoid one bad stub blocking the rest
        for (const stub of stubs) {
          const { error: stubErr } = await supabase
            .from('items')
            .upsert(stub, { onConflict: 'zoho_item_id', ignoreDuplicates: true })
          if (stubErr) {
            errors.push(`Stub item ${stub.zoho_item_id}: ${stubErr.message}`)
          } else {
            stubItemsCreated++
          }
        }
      }

      // ── Step 5: Upsert item prices in batches of 200 ──────────────────────
      const priceRows = pbItems
        .map(pi => ({
          zoho_pricebook_id: pricebookId,
          zoho_item_id: pi.item_id,
          custom_rate: dec(pi.pricebook_rate ?? pi.rate) ?? 0,
          updated_at: new Date().toISOString(),
        }))
        // Only insert rows where the item now exists (stubs included)
        .filter(r => existingSet.has(r.zoho_item_id) || missingIds.includes(r.zoho_item_id))

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
            if (rowErr) {
              errors.push(`Price row ${pricebookId}/${row.zoho_item_id}: ${rowErr.message}`)
            } else {
              itemPricesUpserted++
            }
          }
        } else {
          itemPricesUpserted += batch.length
        }
      }
    }

    // ── Step 6: Mark pricebooks no longer in Zoho as inactive ─────────────────
    const activeIds = pricebookList.map((pb: any) => pb.pricebook_id)
    if (activeIds.length > 0) {
      await supabase
        .from('pricebook_catalog')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .not('zoho_pricebook_id', 'in', `(${activeIds.map((id: string) => `'${id}'`).join(',')})`)
    }

    const summary = {
      pricebooks_synced: pricebooksUpserted,
      item_prices_upserted: itemPricesUpserted,
      stub_items_created: stubItemsCreated,
      errors_count: errors.length,
      errors: errors.slice(0, 20), // cap log size
      synced_at: new Date().toISOString(),
    }

    console.log('sync-pricebooks complete:', summary)
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('sync-pricebooks error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
