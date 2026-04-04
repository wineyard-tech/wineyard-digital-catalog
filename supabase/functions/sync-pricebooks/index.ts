// sync-pricebooks Edge Function
// Incremental sync: fetches only pricebooks modified since yesterday 03:55 AM IST.
// Runs weekly (Sundays at 03:30 AM IST) via pg_cron, or triggered manually.
//
// Consistent with sync-items and sync-contacts: uses getLastModifiedFilter() so only
// records changed in the last ~24 hours are fetched, preventing full-scan timeouts.
//
// Failsafe: if a pricebook references a zoho_item_id not yet in `items`,
// the real item is fetched from Zoho (GET /items/{id}) and inserted before the
// pricebook_item row is created — no stubs, no FK violations.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, fetchAllZohoPages, zohoGet, getLastModifiedFilter } from '../_shared/zoho-client.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

/** Coerce Zoho decimal strings/empty to number | null */
function dec(val: any): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

/** Coerce Zoho decimal strings/empty to integer | null */
function int(val: any): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : Math.round(n)
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

    // ── Step 1: Fetch pricebooks modified in the last ~24 hours ──────────────
    const lastModified = getLastModifiedFilter()
    console.log(`Fetching pricebooks modified since ${lastModified}`)

    const pricebookList = await fetchAllZohoPages<any>(
      '/pricebooks',
      token,
      ORG_ID,
      'pricebooks',
      { last_modified_time: lastModified }
    )
    console.log(`Found ${pricebookList.length} modified pricebook(s) in Zoho`)

    if (pricebookList.length === 0) {
      return new Response(JSON.stringify({
        pricebooks_synced: 0,
        item_prices_upserted: 0,
        missing_items_fetched: 0,
        errors_count: 0,
        errors: [],
        synced_at: new Date().toISOString(),
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    let pricebooksUpserted = 0
    let itemPricesUpserted = 0
    let missingItemsFetched = 0
    const errors: string[] = []

    for (const pb of pricebookList) {
      const pricebookId: string = pb.pricebook_id
      const pricebookName: string = pb.pricebook_name ?? pb.name ?? `Pricebook ${pricebookId}`

      // ── Step 2: Upsert pricebook metadata ───────────────────────────────────
      const { error: catalogErr } = await supabase
        .from('pricebook_catalog')
        .upsert({
          zoho_pricebook_id: pricebookId,
          pricebook_name: pricebookName,
          currency_id: pb.currency_id || 'INR',
          is_active: (pb.status ?? 'active') === 'active',
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

      // ── Step 4: Failsafe — fetch any referenced items missing from `items` ────
      // pricebook_items.zoho_item_id has an FK to items — fetch real item data from
      // Zoho rather than inserting stubs so the catalog has correct data immediately.
      const itemIds = pbItems.map(i => i.item_id)

      const { data: existingItems } = await supabase
        .from('items')
        .select('zoho_item_id')
        .in('zoho_item_id', itemIds)

      const existingSet = new Set((existingItems ?? []).map((r: any) => r.zoho_item_id))
      const missingIds = itemIds.filter(id => !existingSet.has(id))

      if (missingIds.length > 0) {
        console.log(`Fetching ${missingIds.length} missing item(s) from Zoho for pricebook ${pricebookId}`)
        for (const itemId of missingIds) {
          try {
            const itemDetail = await zohoGet(`/items/${itemId}`, token, ORG_ID)
            if (itemDetail.code === 0 && itemDetail.item?.item_id) {
              const item = itemDetail.item
              const { error: itemErr } = await supabase
                .from('items')
                .upsert({
                  zoho_item_id:           item.item_id,
                  item_name:              item.name,
                  sku:                    item.sku?.trim() || `ITEM-${item.item_id}`,
                  category_id:            item.category_id || null,
                  category_name:          item.category_name || null,
                  brand:                  item.brand?.trim() || null,
                  manufacturer:           item.manufacturer_name || null,
                  description:            item.description || null,
                  hsn_or_sac:             item.hsn_or_sac || null,
                  unit:                   item.unit || 'pcs',
                  status:                 item.status ?? 'active',
                  item_type:              item.item_type || 'inventory',
                  product_type:           item.product_type || 'goods',
                  base_rate:              dec(item.rate),
                  purchase_rate:          dec(item.purchase_rate),
                  is_taxable:             item.is_taxable ?? true,
                  tax_id:                 item.tax_id || null,
                  tax_name:               item.tax_name || null,
                  tax_percentage:         dec(item.tax_percentage) ?? 18.0,
                  track_inventory:        item.track_inventory ?? false,
                  available_stock:        int(item.available_stock),
                  actual_available_stock: int(item.actual_available_stock),
                  reorder_level:          int(item.reorder_level),
                  upc:                    item.upc || null,
                  ean:                    item.ean || null,
                  part_number:            item.part_number || null,
                  custom_fields:          item.custom_fields ?? {},
                  created_time:           item.created_time || null,
                  last_modified_time:     item.last_modified_time || null,
                  updated_at:             new Date().toISOString(),
                }, { onConflict: 'zoho_item_id' })
              if (!itemErr) {
                existingSet.add(item.item_id)
                missingItemsFetched++
              } else {
                errors.push(`Fetch item ${itemId}: ${itemErr.message}`)
              }
            } else {
              errors.push(`Item ${itemId} not found in Zoho (pricebook ${pricebookId}): ${itemDetail.message}`)
            }
          } catch (e) {
            errors.push(`Fetch item ${itemId}: ${String(e)}`)
          }
        }
      }

      // ── Step 5: Upsert item prices — only for items that now exist ────────────
      const priceRows = pbItems
        .filter(pi => existingSet.has(pi.item_id))
        .map(pi => ({
          zoho_pricebook_id: pricebookId,
          zoho_item_id: pi.item_id,
          custom_rate: dec((pi as any).pricebook_rate ?? pi.rate) ?? 0,
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

    const summary = {
      pricebooks_synced: pricebooksUpserted,
      item_prices_upserted: itemPricesUpserted,
      missing_items_fetched: missingItemsFetched,
      last_modified_since: lastModified,
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
