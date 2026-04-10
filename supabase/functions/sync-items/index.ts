// sync-items Edge Function
// Incremental sync: fetches only items modified since yesterday 03:55 AM IST.
// Runs daily at 04:00 AM IST via pg_cron. The 5-minute overlap prevents
// records modified on the exact boundary minute from being missed.
// Stock tracking is intentionally skipped (Phase 1) — all items treated as available.
// Pricing uses item.rate (default selling price); pricebook tiers to be added in Phase 2.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, fetchAllZohoPages, getLastModifiedFilter } from '../_shared/zoho-client.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

/** Zoho returns "" for unset numeric fields — coerce to null for Postgres INTEGER columns. */
function int(val: any): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : Math.round(n)
}

/** Same for decimals. */
function dec(val: any): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

serve(async (req) => {
  // Allow manual trigger via POST, and scheduled calls
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const token = await getZohoToken(supabase)

    // Fetch only items modified since yesterday 03:55 AM IST (incremental sync)
    const lastModified = getLastModifiedFilter()
    console.log(`Fetching items modified since ${lastModified}`)

    const zohoItems = await fetchAllZohoPages<any>(
      '/items',
      token,
      ORG_ID,
      'items',
      { filter_by: 'Status.Active', last_modified_time: lastModified }
    )

    console.log(`Fetched ${zohoItems.length} modified items from Zoho`)

    // ── Upsert categories (deduplicated) ──────────────────────────────────────
    const categoryMap = new Map<string, string>()
    for (const item of zohoItems) {
      if (item.category_id && item.category_name) {
        categoryMap.set(item.category_id, item.category_name)
      }
    }

    if (categoryMap.size > 0) {
      const categories = Array.from(categoryMap.entries()).map(([id, name]) => ({
        zoho_category_id: id,
        category_name: name,
      }))
      const { error: catErr } = await supabase
        .from('categories')
        .upsert(categories, { onConflict: 'zoho_category_id', ignoreDuplicates: false })
      if (catErr) {
        // Batch failed — likely category_name UNIQUE conflict (duplicate names in Zoho).
        // Retry row-by-row to isolate the offending category without losing the rest.
        for (const cat of categories) {
          const { error: rowErr } = await supabase
            .from('categories')
            .upsert(cat, { onConflict: 'zoho_category_id', ignoreDuplicates: false })
          if (rowErr) console.warn(`Category "${cat.category_name}" (${cat.zoho_category_id}): ${rowErr.message}`)
        }
      }
    }

    // ── Upsert brands (deduplicated) ──────────────────────────────────────────
    const brandSet = new Set<string>()
    for (const item of zohoItems) {
      if (item.brand?.trim()) brandSet.add(item.brand.trim())
    }

    if (brandSet.size > 0) {
      const brands = Array.from(brandSet).map((name) => ({ brand_name: name }))
      const { error: brandErr } = await supabase
        .from('brands')
        .upsert(brands, { onConflict: 'brand_name', ignoreDuplicates: true })
      if (brandErr) console.warn('Brand upsert warning:', brandErr.message)
    }

    // ── Upsert items ──────────────────────────────────────────────────────────
    // Phase 1: stock values stored as-is from Zoho (-1 = tracking disabled).
    // Catalog treats all active items as available regardless of stock value.
    const rows = zohoItems.map((item: any) => ({
      zoho_item_id: item.item_id,
      item_name: item.name,
      sku: item.sku?.trim() || `ITEM-${item.item_id}`,  // fallback for Zoho items with no SKU
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
      base_rate: dec(item.rate),              // default selling price
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
      // image_urls: (item.image_documents ?? []).map((img: any) => img.image_url).filter(Boolean), // Ignore from sync (will be updated manually and directly)
      custom_fields: item.custom_fields ?? {},
      created_time: item.created_time || null,
      last_modified_time: item.last_modified_time || null,
      updated_at: new Date().toISOString(),
    }))

    // Upsert in batches of 100; fall back to row-by-row on conflict to handle duplicate SKUs in Zoho
    let upserted = 0
    let skipped = 0
    const skippedSkus: string[] = []

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error } = await supabase
        .from('items')
        .upsert(batch, { onConflict: 'zoho_item_id' })

      if (!error) {
        upserted += batch.length
        continue
      }

      // Batch failed (likely duplicate SKU) — retry row-by-row to isolate the offending item(s)
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('items')
          .upsert(row, { onConflict: 'zoho_item_id' })
        if (rowErr) {
          console.warn(`Skipping item "${row.item_name}" (SKU: ${row.sku}): ${rowErr.message}`)
          skippedSkus.push(row.sku)
          skipped++
        } else {
          upserted++
        }
      }
    }

    const summary = {
      items_synced: upserted,
      items_skipped_dup_sku: skipped,
      skipped_skus: skippedSkus,
      categories_found: categoryMap.size,
      brands_found: brandSet.size,
      last_modified_since: lastModified,
      synced_at: new Date().toISOString(),
    }

    console.log('sync-items complete:', summary)
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('sync-items error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
