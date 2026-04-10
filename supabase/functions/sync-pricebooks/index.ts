// sync-pricebooks Edge Function
// Same Zoho flow as initial_sync(pricebooks): full GET /pricebooks list (paginated list only),
// batch upsert pricebook_catalog, then one GET /pricebooks/{id} per book (no per-book line-item
// pagination). Missing `items` rows are filled via GET /items/{id} before pricebook_items upsert.
//
// Daily ~5:05 AM IST via pg_cron (scripts/deploy-cron.sql), or triggered manually.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, fetchAllZohoPages, zohoGet, getLastModifiedFilter } from '../_shared/zoho-client.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

function dec(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function int(val: unknown): number | null {
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

    const lastModified = getLastModifiedFilter()
    console.log(`Fetching pricebooks modified since ${lastModified}`)

    const zohoBooks = await fetchAllZohoPages<any>('/pricebooks', token, ORG_ID, 'pricebooks', { last_modified_time: lastModified })
    console.log(`[sync-pricebooks] found ${zohoBooks.length} pricebook(s) in Zoho`)

    if (zohoBooks.length === 0) {
      return new Response(
        JSON.stringify({
          pricebooks_synced: 0,
          item_prices_upserted: 0,
          missing_items_fetched: 0,
          errors_count: 0,
          errors: [],
          synced_at: new Date().toISOString(),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    const catalogRows = zohoBooks.map((pb: any) => ({
      zoho_pricebook_id: pb.pricebook_id,
      pricebook_name: pb.pricebook_name || pb.name || `Pricebook ${pb.pricebook_id}`,
      currency_id: pb.currency_id || 'INR',
      is_active: (pb.status ?? 'active') === 'active',
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    const { error: catErr } = await supabase
      .from('pricebook_catalog')
      .upsert(catalogRows, { onConflict: 'zoho_pricebook_id', ignoreDuplicates: false })

    if (catErr) {
      return new Response(JSON.stringify({ error: `catalog upsert: ${catErr.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let itemPricesUpserted = 0
    let missingItemsFetched = 0
    const errors: string[] = []

    for (const pb of zohoBooks) {
      const pbName = pb.pricebook_name ?? pb.name ?? pb.pricebook_id

      let detail: any
      try {
        detail = await zohoGet(`/pricebooks/${pb.pricebook_id}`, token, ORG_ID)
      } catch (e) {
        errors.push(`Pricebook ${pb.pricebook_id} detail: ${String(e)}`)
        continue
      }

      if (detail.code !== 0) {
        errors.push(`Pricebook ${pbName}: ${detail.message}`)
        continue
      }

      const priceItems: any[] = detail.pricebook?.pricebook_items ?? []
      if (priceItems.length === 0) continue

      const itemRows = priceItems
        .map((pi: any) => ({
          zoho_pricebook_id: pb.pricebook_id,
          zoho_item_id: pi.item_id,
          custom_rate: dec(pi.pricebook_rate ?? pi.rate) ?? 0,
          updated_at: new Date().toISOString(),
        }))
        .filter((r: any) => r.zoho_item_id)

      if (itemRows.length === 0) continue

      const pbItemIds = itemRows.map((r: any) => r.zoho_item_id)
      const { data: existingItems } = await supabase
        .from('items')
        .select('zoho_item_id')
        .in('zoho_item_id', pbItemIds)

      const existingSet = new Set((existingItems ?? []).map((r: any) => r.zoho_item_id))
      const missingIds = pbItemIds.filter((id: string) => !existingSet.has(id))

      if (missingIds.length > 0) {
        console.log(`[sync-pricebooks] ${pbName}: fetching ${missingIds.length} missing item(s) from Zoho`)
        for (const itemId of missingIds) {
          try {
            const itemDetail = await zohoGet(`/items/${itemId}`, token, ORG_ID)
            if (itemDetail.code === 0 && itemDetail.item?.item_id) {
              const item = itemDetail.item
              const { error: itemErr } = await supabase
                .from('items')
                .upsert(
                  {
                    zoho_item_id: item.item_id,
                    item_name: item.name,
                    sku: item.sku?.trim() || `ITEM-${item.item_id}`,
                    category_id: item.category_id || null,
                    category_name: item.category_name || null,
                    brand: item.brand?.trim() || null,
                    manufacturer: item.manufacturer_name || null,
                    description: item.description || null,
                    hsn_or_sac: item.hsn_or_sac || null,
                    unit: item.unit || 'pcs',
                    status: item.status ?? 'active',
                    item_type: item.item_type || 'inventory',
                    product_type: item.product_type || 'goods',
                    base_rate: dec(item.rate),
                    purchase_rate: dec(item.purchase_rate),
                    is_taxable: item.is_taxable ?? true,
                    tax_id: item.tax_id || null,
                    tax_name: item.tax_name || null,
                    tax_percentage: dec(item.tax_percentage) ?? 18.0,
                    track_inventory: item.track_inventory ?? false,
                    available_stock: int(item.available_stock),
                    actual_available_stock: int(item.actual_available_stock),
                    reorder_level: int(item.reorder_level),
                    upc: item.upc || null,
                    ean: item.ean || null,
                    part_number: item.part_number || null,
                    custom_fields: item.custom_fields ?? {},
                    created_time: item.created_time || null,
                    last_modified_time: item.last_modified_time || null,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'zoho_item_id' }
                )
              if (!itemErr) {
                existingSet.add(item.item_id)
                missingItemsFetched++
              } else {
                errors.push(`Fetch item ${itemId}: ${itemErr.message}`)
              }
            } else {
              errors.push(`Item ${itemId} not found in Zoho (${pbName}): ${itemDetail.message}`)
            }
          } catch (e) {
            errors.push(`Fetch item ${itemId}: ${String(e)}`)
          }
        }
      }

      const safeItemRows = itemRows.filter((r: any) => existingSet.has(r.zoho_item_id))
      if (safeItemRows.length === 0) continue

      const { error: batchErr } = await supabase
        .from('pricebook_items')
        .upsert(safeItemRows, { onConflict: 'zoho_pricebook_id,zoho_item_id', ignoreDuplicates: false })

      if (batchErr) {
        errors.push(`Batch upsert ${pbName}: ${batchErr.message}`)
        for (const row of safeItemRows) {
          const { error: rowErr } = await supabase
            .from('pricebook_items')
            .upsert(row, { onConflict: 'zoho_pricebook_id,zoho_item_id', ignoreDuplicates: false })
          if (rowErr) {
            errors.push(`Price row ${pb.pricebook_id}/${row.zoho_item_id}: ${rowErr.message}`)
          } else {
            itemPricesUpserted++
          }
        }
      } else {
        itemPricesUpserted += safeItemRows.length
      }
    }

    const summary = {
      pricebooks_synced: catalogRows.length,
      item_prices_upserted: itemPricesUpserted,
      missing_items_fetched: missingItemsFetched,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
      synced_at: new Date().toISOString(),
    }

    console.log('[sync-pricebooks] complete:', summary)
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
