// initial_sync Edge Function
// Large-scale full sync from Zoho Books — no last_modified_time filter.
// Designed for first-run or full resync scenarios with 15k+ records.
//
// Entities sync in pages (200 records/page); has_more_page checked every page.
// Categories/brands/item_locations are upserted inline per items page to keep memory flat.
// Contact_persons are only inserted for contacts that were successfully upserted
// (prevents FK violations when a contact is skipped due to phone conflict).
//
// POST body (all optional):
//   {
//     "entity": "locations" | "items" | "pricebooks" | "contacts" | "invoices" | "estimates" | "all",
//     "page_from": 1,   // contacts/invoices/estimates — resume from page N (default 1)
//     "page_to": 999,   // contacts/invoices/estimates — stop after page N (default all)
//     "days": 90        // invoices/estimates — how many days back to sync (default 90)
//   }
//
// All paginated responses include: page_from, page_to, has_more, next_page.
// When has_more=true, pass next_page as page_from in the next call.
//
// Recommended invocation order for first-time full sync:
//   1. POST { "entity": "locations" }               — sync warehouses/branches first (FK dependency)
//   2. POST { "entity": "items" }                   — syncs items + item_locations
//   3. POST { "entity": "pricebooks" }              — syncs pricebook catalog + per-item prices (run after items)
//   4. POST { "entity": "contacts", "page_from": 1,  "page_to": 15 }   — ~3000 contacts
//   5. POST { "entity": "contacts", "page_from": 16, "page_to": 30 }   — next 3000
//   6. POST { "entity": "contacts", "page_from": 31 }                  — remainder
//   7. POST { "entity": "invoices", "days": 90 }    — last 90 days; chain via next_page if has_more
//   8. POST { "entity": "estimates", "days": 90 }   — last 90 days; chain via next_page if has_more
//
// page_from/page_to exist because large datasets hit WORKER_LIMIT beyond ~3000 records per
// invocation (each fallback row-by-row retry multiplies DB calls significantly).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, zohoGet, streamZohoPages, fetchAllZohoPages } from '../_shared/zoho-client.ts'
import { normalizeIndianPhone, extractPhoneFromContact, describeContactPhones } from '../_shared/phone-normalizer.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

/** Coerce Zoho's "" / null / undefined numeric fields to an integer or null. */
function int(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : Math.round(n)
}

/** Same as int() but preserves decimal precision. */
function dec(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

// ─────────────────────────────────────────────────────────────────────────────
// Locations sync
// Fetches all warehouses and branches from Zoho using the unified /settings/warehouses
// endpoint (docs: https://www.zoho.com/books/api/v3/locations/).
// Must run before items sync — item_locations has a FK to locations.
// ─────────────────────────────────────────────────────────────────────────────
async function syncLocations(supabase: ReturnType<typeof createClient>, token: string, geocode = true) {
  // GET /locations — returns both warehouses and branches in one call.
  // Docs: https://www.zoho.com/books/api/v3/locations/#list-all-locations
  // Uses the same zohoapis.in domain as all other endpoints; path is /locations (not /warehouses)
  const json = await zohoGet('/locations', token, ORG_ID)
  if (json.code !== 0) throw new Error(`[locations] Zoho error: ${json.message}`)
  const zohoWarehouses: any[] = json.locations ?? []

  if (zohoWarehouses.length === 0) {
    console.log('[locations] no warehouses returned from Zoho')
    return { locations_upserted: 0 }
  }

  const rows = zohoWarehouses.map((loc: any) => ({
    zoho_location_id: loc.location_id,
    location_name:    loc.location_name,
    location_type:    loc.location_type ?? 'warehouse',  // 'warehouse' | 'branch'
    is_primary:       loc.is_primary ?? false,
    status:           loc.status ?? 'active',
    address:          loc.address ?? null,
    email:            loc.email || null,
    phone:            loc.phone || null,
    updated_at:       new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('locations')
    .upsert(rows, { onConflict: 'zoho_location_id', ignoreDuplicates: false })

  if (error) throw new Error(`[locations] upsert failed: ${error.message}`)

  console.log(`[locations] upserted ${rows.length} warehouses`)

  // Geocode any newly-added or previously unresolved locations
  const geocodeResult = geocode ? await geocodeLocations(supabase) : { geocoded: 0, failed: 0 }

  return { locations_upserted: rows.length, ...geocodeResult }
}

// ─────────────────────────────────────────────────────────────────────────────
// Geocode locations
// Calls Google Maps Geocoding API for any locations that have a populated address
// but no lat/lng yet. Called from syncLocations after the upsert so new warehouses
// are geocoded on first sync.
// ─────────────────────────────────────────────────────────────────────────────
async function geocodeLocations(supabase: ReturnType<typeof createClient>) {
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) {
    console.warn('[geocode] GOOGLE_MAPS_API_KEY not set — skipping geocoding')
    return { geocoded: 0, failed: 0 }
  }

  const { data: rows, error } = await supabase
    .from('locations')
    .select('zoho_location_id, location_name, address')
    .is('latitude', null)
    .not('address', 'is', null)

  if (error) {
    console.error('[geocode] failed to fetch un-geocoded locations:', error.message)
    return { geocoded: 0, failed: 0 }
  }

  if (!rows || rows.length === 0) {
    console.log('[geocode] all locations already geocoded')
    return { geocoded: 0, failed: 0 }
  }

  console.log(`[geocode] geocoding ${rows.length} location(s)`)
  let geocoded = 0
  let failed = 0

  for (const row of rows) {
    // Build address string — address may be a JSON object from Zoho
    const addressStr = typeof row.address === 'string'
      ? row.address
      : [
          row.address?.address,
          row.address?.city,
          row.address?.state,
          row.address?.zip,
          'India',
        ].filter(Boolean).join(', ')

    if (!addressStr.trim()) {
      console.warn(`[geocode] location ${row.zoho_location_id} has empty address — skipping`)
      failed++
      continue
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressStr)}&key=${apiKey}`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
        console.warn(`[geocode] location ${row.zoho_location_id} (${row.location_name}): status=${data.status}`)
        failed++
        continue
      }

      const { lat, lng } = data.results[0].geometry.location
      const { error: updErr } = await supabase
        .from('locations')
        .update({ latitude: lat, longitude: lng, updated_at: new Date().toISOString() })
        .eq('zoho_location_id', row.zoho_location_id)

      if (updErr) {
        console.error(`[geocode] update failed for ${row.zoho_location_id}: ${updErr.message}`)
        failed++
      } else {
        console.log(`[geocode] ${row.location_name}: (${lat}, ${lng})`)
        geocoded++
      }
    } catch (err) {
      console.error(`[geocode] ${row.zoho_location_id}: ${String(err)}`)
      failed++
    }
  }

  console.log(`[geocode] done — geocoded=${geocoded}, failed=${failed}`)
  return { geocoded, failed }
}

// ─────────────────────────────────────────────────────────────────────────────
// Items + item_locations full sync
// Streams all active items from Zoho, page by page (200/page).
// Upserts categories, brands, items, and per-warehouse stock (item_locations) per page.
// Run AFTER syncLocations — item_locations.zoho_location_id references locations.
// ─────────────────────────────────────────────────────────────────────────────
async function syncAllItems(supabase: ReturnType<typeof createClient>, token: string) {
  let itemsUpserted    = 0
  let itemsSkipped     = 0
  let locRowsUpserted  = 0
  const skippedSkus: string[] = []
  let categoriesFound  = 0
  let brandsFound      = 0
  let pageCount        = 0
  // Maps zoho_category_id → its assigned display_order for this sync run.
  // Using a Map (not Set+counter) lets us look up the correct order when the
  // same category_id appears on multiple pages — avoids wrong-value assignment.
  const categoryOrderMap = new Map<string, number>()

  for await (const { rows: zohoItems, page, hasMore } of streamZohoPages<any>(
    '/items',
    token,
    ORG_ID,
    'items',
    { filter_by: 'Status.Active' }
  )) {
    pageCount++
    console.log(`[items] page ${page}: ${zohoItems.length} records, has_more=${hasMore}`)
    // Diagnostic: log warehouse fields present in first item of first page
    if (page === 1 && zohoItems.length > 0) {
      const sample = zohoItems[0]
      console.log('[items] warehouse diagnostic — first item keys:', Object.keys(sample).join(', '))
      console.log('[items] warehouse diagnostic — item.warehouses:', JSON.stringify(sample.warehouses ?? 'MISSING'))
    }

    if (zohoItems.length === 0) continue

    // ── 1. Upsert categories extracted from this page ─────────────────────────
    const categoryMap = new Map<string, string>()
    for (const item of zohoItems) {
      if (item.category_id && item.category_name) {
        categoryMap.set(item.category_id, item.category_name)
      }
    }
    if (categoryMap.size > 0) {
      const categories = Array.from(categoryMap.entries()).map(([id, name]) => {
        if (!categoryOrderMap.has(id)) {
          // First time seeing this category — assign next sequential order.
          // .size is evaluated before .set(), so first category = 1, second = 2, etc.
          categoryOrderMap.set(id, categoryOrderMap.size + 1)
        }
        return {
          zoho_category_id: id,
          category_name:    name,
          display_order:    categoryOrderMap.get(id)!,
        }
      })
      const { error: catErr } = await supabase
        .from('categories')
        .upsert(categories, { onConflict: 'zoho_category_id', ignoreDuplicates: false })
      if (catErr) {
        // category_name UNIQUE can conflict if Zoho has duplicate names on different IDs
        for (const cat of categories) {
          const { error: rowErr } = await supabase
            .from('categories')
            .upsert(cat, { onConflict: 'zoho_category_id', ignoreDuplicates: false })
          if (rowErr) console.warn(`[items] category "${cat.category_name}" (${cat.zoho_category_id}): ${rowErr.message}`)
        }
      }
      categoriesFound += categoryMap.size
    }

    // ── 2. Upsert brands extracted from this page ─────────────────────────────
    const brandSet = new Set<string>()
    for (const item of zohoItems) {
      if (item.brand?.trim()) brandSet.add(item.brand.trim())
    }
    if (brandSet.size > 0) {
      const brands = Array.from(brandSet).map((name) => ({ brand_name: name }))
      const { error } = await supabase
        .from('brands')
        .upsert(brands, { onConflict: 'brand_name', ignoreDuplicates: true })
      if (error) console.warn(`[items] brand upsert p${page}:`, error.message)
      brandsFound += brandSet.size
    }

    // ── 3. Build item rows for this page ──────────────────────────────────────
    const rows = zohoItems.map((item: any) => ({
      zoho_item_id:            item.item_id,
      item_name:               item.name,
      sku:                     item.sku?.trim() || `ITEM-${item.item_id}`,
      category_id:             item.category_id || null,
      category_name:           item.category_name || null,
      brand:                   item.brand?.trim() || null,
      manufacturer:            item.manufacturer_name || null,
      description:             item.description || null,
      hsn_or_sac:              item.hsn_or_sac || null,
      unit:                    item.unit || 'pcs',
      status:                  item.status ?? 'active',
      item_type:               item.item_type || 'inventory',
      product_type:            item.product_type || 'goods',
      base_rate:               dec(item.rate),
      purchase_rate:           dec(item.purchase_rate),
      is_taxable:              item.is_taxable ?? true,
      tax_id:                  item.tax_id || null,
      tax_name:                item.tax_name || null,
      tax_percentage:          dec(item.tax_percentage) ?? 18.0,
      track_inventory:         item.track_inventory ?? false,
      available_stock:         int(item.available_stock),
      actual_available_stock:  int(item.actual_available_stock),
      reorder_level:           int(item.reorder_level),
      upc:                     item.upc || null,
      ean:                     item.ean || null,
      part_number:             item.part_number || null,
      // image_urls:              (item.image_documents ?? []).map((img: any) => img.image_url).filter(Boolean),
      custom_fields:           item.custom_fields ?? {},
      created_time:            item.created_time || null,
      last_modified_time:      item.last_modified_time || null,
      updated_at:              new Date().toISOString(),
    }))

    // ── 4. Upsert items; fall back row-by-row on SKU conflict ─────────────────
    // Track successfully upserted item IDs for item_locations FK safety
    const upsertedItemIds = new Set<string>()

    const { error: batchErr } = await supabase
      .from('items')
      .upsert(rows, { onConflict: 'zoho_item_id' })

    if (!batchErr) {
      rows.forEach((r: any) => upsertedItemIds.add(r.zoho_item_id))
      itemsUpserted += rows.length
    } else {
      for (const row of rows) {
        const { error: rowErr } = await supabase
          .from('items')
          .upsert(row, { onConflict: 'zoho_item_id' })
        if (rowErr) {
          console.warn(`[items] skip "${row.item_name}" (${row.sku}): ${rowErr.message}`)
          skippedSkus.push(row.sku)
          itemsSkipped++
        } else {
          upsertedItemIds.add(row.zoho_item_id)
          itemsUpserted++
        }
      }
    }

    // ── 5. Upsert item_locations from embedded warehouses array ───────────────
    // Zoho items list response includes warehouse-level stock in item.warehouses[].
    // Zoho API naming is inconsistent: items call them `warehouse_id/warehouse_name`
    // but the /locations endpoint uses `location_id/location_name` — same IDs, different keys.
    // Only insert for items that were actually saved to avoid FK violations.
    const itemLocationRows: any[] = []
    for (const item of zohoItems) {
      if (!upsertedItemIds.has(item.item_id)) continue
      for (const wh of (item.warehouses ?? [])) {
        if (!wh.warehouse_id) continue
        itemLocationRows.push({
          zoho_item_id:             item.item_id,
          zoho_location_id:         wh.warehouse_id,
          location_name:            wh.warehouse_name || '',
          location_status:          wh.status ?? 'active',
          is_primary:               wh.is_primary_warehouse ?? false,
          stock_on_hand:            int(wh.warehouse_stock_on_hand),
          available_stock:          int(wh.warehouse_available_stock),
          actual_available_stock:   int(wh.warehouse_actual_available_stock),
          updated_at:               new Date().toISOString(),
        })
      }
    }

    if (itemLocationRows.length > 0) {
      const { error: locErr } = await supabase
        .from('item_locations')
        .upsert(itemLocationRows, { onConflict: 'zoho_item_id,zoho_location_id', ignoreDuplicates: false })
      if (locErr) {
        // Row-by-row fallback — a missing location FK or bad data row shouldn't drop the rest
        for (const row of itemLocationRows) {
          const { error: rowErr } = await supabase
            .from('item_locations')
            .upsert(row, { onConflict: 'zoho_item_id,zoho_location_id', ignoreDuplicates: false })
          if (rowErr) console.warn(`[items] item_location (${row.zoho_item_id}, ${row.zoho_location_id}): ${rowErr.message}`)
          else locRowsUpserted++
        }
      } else {
        locRowsUpserted += itemLocationRows.length
      }
    }
  }

  return {
    items_upserted:           itemsUpserted,
    items_skipped_dup_sku:    itemsSkipped,
    skipped_skus:             skippedSkus,
    item_locations_upserted:  locRowsUpserted,
    categories_found:         categoriesFound,
    brands_found:             brandsFound,
    pages_fetched:            pageCount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Item-locations sync (item detail pass)
//
// The Zoho /items LIST endpoint does not expose per-warehouse stock.
// That data is only available in the item DETAIL endpoint: GET /items/{item_id}.
// warehouse_id is not a valid filter param on /items — using it returns a 400.
//
// Strategy: read item IDs from our DB, fetch details from Zoho in parallel
// batches of CONCURRENCY=5, extract the warehouses[] array, upsert item_locations.
//
// POST { "entity": "item_locations" }
// Optional params:
//   "item_offset": 0      — resume from this DB row offset (default 0)
//   "item_limit":  500    — items to process per invocation (default 500)
//   "location_id": "..."  — filter to one warehouse only
//
// For 15k items: run 30 invocations with item_offset 0, 500, 1000 … 14500.
// Each takes ~30s (100 inner batches × 5 concurrent × ~300ms/call).
// ─────────────────────────────────────────────────────────────────────────────
const ITEM_LOC_CONCURRENCY = 5   // parallel Zoho detail calls per inner batch

async function syncItemLocations(
  supabase: ReturnType<typeof createClient>,
  token: string,
  itemOffset = 0,
  itemLimit  = 500,
  onlyLocationId?: string
) {
  // ── Load item IDs for this window from our DB ─────────────────────────────
  const { data: dbItems, error: dbErr } = await supabase
    .from('items')
    .select('zoho_item_id')
    .eq('status', 'active')
    .order('zoho_item_id')
    .range(itemOffset, itemOffset + itemLimit - 1)

  if (dbErr) throw new Error(`[item_locations] failed to load items: ${dbErr.message}`)
  if (!dbItems || dbItems.length === 0) {
    return { item_locations_upserted: 0, items_processed: 0, has_more: false }
  }

  console.log(`[item_locations] processing items ${itemOffset}–${itemOffset + dbItems.length - 1} (${dbItems.length} items)`)

  let locRowsUpserted = 0
  let itemsProcessed  = 0
  let stoppedAtOffset = -1                     // set when we exit early on time budget
  const startTime     = Date.now()
  const TIME_BUDGET   = 110_000               // 110s — leaves 40s buffer before the 150s hard limit

  // ── Fetch item details in parallel micro-batches ──────────────────────────
  for (let i = 0; i < dbItems.length; i += ITEM_LOC_CONCURRENCY) {
    const batch = dbItems.slice(i, i + ITEM_LOC_CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(({ zoho_item_id }) =>
        zohoGet(`/items/${zoho_item_id}`, token, ORG_ID)
      )
    )

    const itemLocationRows: any[] = []

    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn(`[item_locations] detail fetch failed:`, String(result.reason))
        continue
      }
      const item = result.value?.item
      if (!item?.item_id) continue
      itemsProcessed++

      for (const wh of (item.warehouses ?? [])) {
        if (!wh.warehouse_id) continue
        if (onlyLocationId && wh.warehouse_id !== onlyLocationId) continue

        itemLocationRows.push({
          zoho_item_id:           item.item_id,
          zoho_location_id:       wh.warehouse_id,
          location_name:          wh.warehouse_name || '',
          location_status:        wh.status ?? 'active',
          is_primary:             wh.is_primary_warehouse ?? false,
          stock_on_hand:          int(wh.warehouse_stock_on_hand),
          available_stock:        int(wh.warehouse_available_stock),
          actual_available_stock: int(wh.warehouse_actual_available_stock),
          updated_at:             new Date().toISOString(),
        })
      }
    }

    if (itemLocationRows.length > 0) {
      const { error: batchErr } = await supabase
        .from('item_locations')
        .upsert(itemLocationRows, { onConflict: 'zoho_item_id,zoho_location_id', ignoreDuplicates: false })

      if (batchErr) {
        for (const row of itemLocationRows) {
          const { error: rowErr } = await supabase
            .from('item_locations')
            .upsert(row, { onConflict: 'zoho_item_id,zoho_location_id', ignoreDuplicates: false })
          if (rowErr) console.warn(`[item_locations] (${row.zoho_item_id}, ${row.zoho_location_id}): ${rowErr.message}`)
          else locRowsUpserted++
        }
      } else {
        locRowsUpserted += itemLocationRows.length
      }
    }

    // ── Time-budget check: stop early and return a resume pointer ─────────────
    // Checked after each micro-batch so the final DB upsert above always completes.
    if (Date.now() - startTime > TIME_BUDGET) {
      stoppedAtOffset = itemOffset + i + ITEM_LOC_CONCURRENCY
      console.log(`[item_locations] time budget reached — stopping at DB offset ${stoppedAtOffset}`)
      break
    }
  }

  const hasMore   = stoppedAtOffset !== -1   // stopped early = more work remains
  const nextOffset = hasMore ? stoppedAtOffset : null

  console.log(`[item_locations] done — ${itemsProcessed} items, ${locRowsUpserted} rows. has_more=${hasMore}${hasMore ? ` next_offset=${nextOffset}` : ''}`)

  return {
    item_locations_upserted: locRowsUpserted,
    items_processed:         itemsProcessed,
    item_offset:             itemOffset,
    has_more:                hasMore,
    ...(nextOffset !== null ? { next_offset: nextOffset } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contacts full sync
// Streams active customers from Zoho, page by page (200/page).
// Supports page_from/page_to to split large datasets across multiple invocations
// and stay under Supabase Edge Function WORKER_LIMIT.
//
// Contact_persons are only upserted for contacts that were successfully saved.
// Both contacts and contact_persons fall back to row-by-row on batch failure.
// ─────────────────────────────────────────────────────────────────────────────
async function syncAllContacts(
  supabase: ReturnType<typeof createClient>,
  token: string,
  pageFrom = 1,
  pageTo = 999
) {
  let contactsUpserted = 0
  let contactsSkipped  = 0
  let personsUpserted  = 0
  let pageCount        = 0
  let lastPageSeen     = pageFrom - 1
  let stoppedEarly     = false

  const startTime   = Date.now()
  const TIME_BUDGET = 110_000   // 110s — 40s buffer before 150s hard limit

  // maxPages = how many pages to fetch in this call (pageTo - pageFrom + 1)
  const maxPages = pageTo - pageFrom + 1

  for await (const { rows: zohoContacts, page, hasMore } of streamZohoPages<any>(
    '/contacts',
    token,
    ORG_ID,
    'contacts',
    { filter_by: 'Status.Active', contact_type: 'customer' },
    maxPages,
    pageFrom
  )) {
    pageCount++
    console.log(`[contacts] page ${page}: ${zohoContacts.length} records, has_more=${hasMore}`)

    if (zohoContacts.length === 0) continue

    // ── Build contact rows and person rows for this page ──────────────────────
    const contactRows: any[] = []
    const personRows:  any[] = []

    for (const contact of zohoContacts) {
      const phoneResult = extractPhoneFromContact(contact)

      if (!phoneResult) {
        console.warn(`[contacts] skip "${contact.contact_name}" (${contact.contact_id}): no valid phone — ${describeContactPhones(contact)}`)
        contactsSkipped++
        continue
      }

      const { phone, source: phoneSource } = phoneResult
      if (phoneSource !== 'contact.mobile' && phoneSource !== 'contact.phone') {
        // Phone came from a non-primary field — log for visibility
        console.log(`[contacts] "${contact.contact_name}" phone from ${phoneSource}: ${phone}`)
      }

      // Extract custom boolean flags from Zoho custom_fields array
      const cfFields: Array<{ api_name?: string; value?: unknown }> =
        Array.isArray(contact.custom_fields) ? contact.custom_fields : []
      const cfCatalogEntry = cfFields.find(f => f.api_name === 'cf_online_catalogue_access')
      const online_catalogue_access =
        cfCatalogEntry?.value === true || cfCatalogEntry?.value === 'YES' || false
      const catalog_access = online_catalogue_access || false

      contactRows.push({
        zoho_contact_id:            contact.contact_id,
        contact_name:               contact.contact_name,
        company_name:               contact.company_name || null,
        contact_type:               contact.contact_type || 'customer',
        status:                     contact.status ?? 'active',
        primary_contact_person_id:  contact.primary_contact_person_id || null,
        pricebook_id:               contact.pricebook_id || contact.price_list_id || null,
        phone,
        email:                      contact.email || null,
        billing_address:            contact.billing_address ?? null,
        shipping_address:           contact.shipping_address ?? null,
        payment_terms:              contact.payment_terms ?? null,
        payment_terms_label:        contact.payment_terms_label || null,
        currency_id:                contact.currency_id || null,
        currency_code:              contact.currency_code || 'INR',
        custom_fields:              Array.isArray(contact.custom_fields) ? contact.custom_fields : [],
        online_catalogue_access,
        catalog_access,
        created_time:               contact.created_time || null,
        last_modified_time:         contact.last_modified_time || null,
        updated_at:                 new Date().toISOString(),
      })

      for (const person of (contact.contact_persons ?? [])) {
        if (!person.contact_person_id) continue
        const personCfFields: Array<{ api_name?: string; value?: unknown }> =
          Array.isArray(person.custom_fields) ? person.custom_fields : []
        const personOnlineCatalogEntry = personCfFields.find(f => f.api_name === 'cf_online_catalogue_access')
        const online_catalogue_access =
          personOnlineCatalogEntry?.value === true || personOnlineCatalogEntry?.value === 'YES' || false
        const person_catalog_access = online_catalogue_access || false

        personRows.push({
          zoho_contact_person_id:   person.contact_person_id,
          zoho_contact_id:          contact.contact_id,
          first_name:               person.first_name || null,
          last_name:                person.last_name || null,
          email:                    person.email || null,
          phone:                    normalizeIndianPhone(person.phone),
          mobile:                   normalizeIndianPhone(person.mobile),
          is_primary:               person.is_primary_contact ?? false,
          communication_preference: person.communication_preference ?? null,
          online_catalogue_access,
          catalog_access
        })
      }
    }

    // ── Upsert contacts; track which IDs were actually saved ──────────────────
    const upsertedContactIds = new Set<string>()

    if (contactRows.length > 0) {
      const { error } = await supabase
        .from('contacts')
        .upsert(contactRows, { onConflict: 'zoho_contact_id' })

      if (error) {
        // Fallback: row-by-row to isolate duplicate phone conflicts
        for (const row of contactRows) {
          const { error: rowErr } = await supabase
            .from('contacts')
            .upsert(row, { onConflict: 'zoho_contact_id' })
          if (rowErr) {
            console.warn(`[contacts] skip "${row.contact_name}": ${rowErr.message}`)
            contactsSkipped++
          } else {
            upsertedContactIds.add(row.zoho_contact_id)
            contactsUpserted++
          }
        }
      } else {
        contactRows.forEach(r => upsertedContactIds.add(r.zoho_contact_id))
        contactsUpserted += contactRows.length
      }
    }

    // ── Upsert contact persons — only for contacts that were saved ────────────
    // Filtering here prevents FK violations when a parent contact was skipped.
    const safePersonRows = personRows.filter(p => upsertedContactIds.has(p.zoho_contact_id))

    if (safePersonRows.length > 0) {
      const { error: personErr } = await supabase
        .from('contact_persons')
        .upsert(safePersonRows, { onConflict: 'zoho_contact_person_id' })

      if (personErr) {
        // Fallback: row-by-row to isolate the bad person without losing the rest
        for (const row of safePersonRows) {
          const { error: rowErr } = await supabase
            .from('contact_persons')
            .upsert(row, { onConflict: 'zoho_contact_person_id' })
          if (rowErr) {
            console.warn(`[contacts] person ${row.zoho_contact_person_id} (${row.zoho_contact_id}): ${rowErr.message}`)
          } else {
            personsUpserted++
          }
        }
      } else {
        personsUpserted += safePersonRows.length
      }
    }

    lastPageSeen = page
    console.log(`[contacts] page ${page}: +${contactRows.length} contacts, +${safePersonRows.length} persons (total: ${contactsUpserted})`)

    // ── Time-budget check: stop after the current page's DB writes are done ──
    if (hasMore && Date.now() - startTime > TIME_BUDGET) {
      stoppedEarly = true
      console.log(`[contacts] time budget reached after page ${page} — stopping early`)
      break
    }
  }

  const hasMorePages = stoppedEarly
  const nextPage     = hasMorePages ? lastPageSeen + 1 : null

  return {
    contacts_upserted:        contactsUpserted,
    contacts_skipped:         contactsSkipped,
    contact_persons_upserted: personsUpserted,
    pages_fetched:            pageCount,
    page_from:                pageFrom,
    page_to:                  lastPageSeen,
    has_more:                 hasMorePages,
    next_page:                nextPage,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricebooks sync
// Fetches all pricebooks from Zoho, upserts metadata into pricebook_catalog,
// then fetches each pricebook's item prices and upserts into pricebook_items.
// Typically <20 pricebooks so a sequential per-book detail fetch is fine.
// Run AFTER syncAllItems — pricebook_items.zoho_item_id references items.
// ─────────────────────────────────────────────────────────────────────────────
async function syncPricebooks(supabase: ReturnType<typeof createClient>, token: string) {
  // GET /pricebooks — returns metadata list (no items array on list endpoint)
  const zohoBooks = await fetchAllZohoPages<any>('/pricebooks', token, ORG_ID, 'pricebooks')

  if (zohoBooks.length === 0) {
    console.log('[pricebooks] no pricebooks returned from Zoho')
    return { pricebooks_upserted: 0, pricebook_items_upserted: 0 }
  }

  console.log(`[pricebooks] found ${zohoBooks.length} pricebooks`)

  // ── 1. Upsert pricebook metadata ────────────────────────────────────────────
  const catalogRows = zohoBooks.map((pb: any) => ({
    zoho_pricebook_id: pb.pricebook_id,
    pricebook_name:    pb.pricebook_name || pb.name || `Pricebook ${pb.pricebook_id}`,
    currency_id:       pb.currency_id || 'INR',
    is_active:         (pb.status ?? 'active') === 'active',
    synced_at:         new Date().toISOString(),
    updated_at:        new Date().toISOString(),
  }))

  const { error: catErr } = await supabase
    .from('pricebook_catalog')
    .upsert(catalogRows, { onConflict: 'zoho_pricebook_id', ignoreDuplicates: false })

  if (catErr) throw new Error(`[pricebooks] catalog upsert failed: ${catErr.message}`)
  console.log(`[pricebooks] upserted ${catalogRows.length} pricebook metadata rows`)

  // ── 2. Fetch per-book item prices and upsert pricebook_items ────────────────
  let itemsUpserted = 0

  for (const pb of zohoBooks) {
    const pbName = pb.pricebook_name ?? pb.name ?? pb.pricebook_id

    const detail = await zohoGet(`/pricebooks/${pb.pricebook_id}`, token, ORG_ID)
    if (detail.code !== 0) {
      console.warn(`[pricebooks] detail fetch failed for ${pbName}: ${detail.message}`)
      continue
    }

    // Zoho returns all items in a single response under 'pricebook_items'
    const priceItems: any[] = detail.pricebook?.pricebook_items ?? []
    if (priceItems.length === 0) {
      console.log(`[pricebooks] ${pbName}: no items — skipping`)
      continue
    }

    const itemRows = priceItems
      .map((pi: any) => ({
        zoho_pricebook_id: pb.pricebook_id,
        zoho_item_id:      pi.item_id,
        custom_rate:       dec(pi.pricebook_rate ?? pi.rate) ?? 0,
        updated_at:        new Date().toISOString(),
      }))
      .filter((r: any) => r.zoho_item_id)

    if (itemRows.length === 0) continue

    // ── Failsafe: fetch any items referenced by this pricebook that are missing ─
    // pricebook_items.zoho_item_id has an FK to items — if the item doesn't exist
    // the batch upsert will fail. Fetch the real item from Zoho rather than inserting
    // a stub so the catalog immediately has correct data.
    const pbItemIds = itemRows.map((r: any) => r.zoho_item_id)
    const { data: existingItems } = await supabase
      .from('items')
      .select('zoho_item_id')
      .in('zoho_item_id', pbItemIds)
    const existingSet = new Set((existingItems ?? []).map((r: any) => r.zoho_item_id))
    const missingIds = pbItemIds.filter((id: string) => !existingSet.has(id))

    if (missingIds.length > 0) {
      console.log(`[pricebooks] ${pbName}: fetching ${missingIds.length} missing item(s) from Zoho`)
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
              console.log(`[pricebooks] fetched and upserted missing item ${itemId} for ${pbName}`)
            } else {
              console.warn(`[pricebooks] failed to upsert fetched item ${itemId}: ${itemErr.message}`)
            }
          } else {
            console.warn(`[pricebooks] item ${itemId} not found in Zoho (${pbName}): ${itemDetail.message}`)
          }
        } catch (e) {
          console.warn(`[pricebooks] error fetching item ${itemId}: ${String(e)}`)
        }
      }
    }

    // Only upsert price rows for items that now exist — avoids FK violations from
    // items that were missing in Zoho too (deleted/inactive)
    const safeItemRows = itemRows.filter((r: any) => existingSet.has(r.zoho_item_id))
    if (safeItemRows.length === 0) continue

    // Try batch upsert first; fall back to row-by-row to isolate any remaining failures
    const { error: batchErr } = await supabase
      .from('pricebook_items')
      .upsert(safeItemRows, { onConflict: 'zoho_pricebook_id,zoho_item_id', ignoreDuplicates: false })

    if (batchErr) {
      console.warn(`[pricebooks] batch upsert failed for ${pbName}: ${batchErr.message} — retrying row-by-row`)
      for (const row of safeItemRows) {
        const { error: rowErr } = await supabase
          .from('pricebook_items')
          .upsert(row, { onConflict: 'zoho_pricebook_id,zoho_item_id', ignoreDuplicates: false })
        if (rowErr) {
          console.warn(`[pricebooks] row failed ${pbName}/${row.zoho_item_id}: ${rowErr.message}`)
        } else {
          itemsUpserted++
        }
      }
    } else {
      itemsUpserted += safeItemRows.length
      console.log(`[pricebooks] ${pbName}: ${safeItemRows.length} item prices upserted`)
    }
  }

  console.log(`[pricebooks] done — ${catalogRows.length} pricebooks, ${itemsUpserted} item prices`)
  return { pricebooks_upserted: catalogRows.length, pricebook_items_upserted: itemsUpserted }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estimates initial sync (last N days)
//
// Fetches estimates created/updated within the last `days` calendar days using
// the Zoho date_start filter. Pages through all results with streamZohoPages
// until has_more_page is false (or empty page). Per-page contact phone lookup
// is batched (one IN query per page) to avoid N+1 DB round-trips.
//
// Upserts with source='zoho'. The DB preserve_source trigger ensures any row
// that was originally created by the catalog-app retains source='catalog-app'.
//
// POST { "entity": "estimates", "days": 90 }   (days defaults to 90)
// ─────────────────────────────────────────────────────────────────────────────
async function syncAllEstimates(
  supabase: ReturnType<typeof createClient>,
  token: string,
  days = 90,
  pageFrom = 1,
  pageTo = 999
) {
  // Compute date_start: N calendar days ago in YYYY-MM-DD (UTC date is fine for
  // Zoho's date field — IST offset of half a day won't miss records at the boundary)
  const dateStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  console.log(`[estimates] initial sync from ${dateStart} (last ${days} days)`)

  let upserted     = 0
  let skipped      = 0
  let pageCount    = 0
  let stoppedEarly = false
  let lastPageSeen = pageFrom - 1
  const startTime   = Date.now()
  const TIME_BUDGET = 110_000
  const maxPages    = pageTo - pageFrom + 1

  for await (const { rows: zohoEstimates, page, hasMore } of streamZohoPages<any>(
    '/estimates',
    token,
    ORG_ID,
    'estimates',
    { date_start: dateStart },
    maxPages,
    pageFrom
  )) {
    pageCount++
    console.log(`[estimates] page ${page}: ${zohoEstimates.length} records, has_more=${hasMore}`)
    if (zohoEstimates.length === 0) continue

    // ── Batch phone lookup: one IN query for all customer_ids on this page ────
    const customerIds = [...new Set(
      zohoEstimates.map((e: any) => e.customer_id).filter(Boolean)
    )] as string[]

    const phoneMap = new Map<string, string>()
    if (customerIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('zoho_contact_id, phone')
        .in('zoho_contact_id', customerIds)
      for (const c of contacts ?? []) {
        if (c.phone) phoneMap.set(c.zoho_contact_id, c.phone)
      }
    }

    // ── Build estimate rows for this page ─────────────────────────────────────
    const rows: any[] = []
    for (const e of zohoEstimates) {
      if (!e.estimate_id) { skipped++; continue }
      rows.push({
        zoho_estimate_id: e.estimate_id,
        estimate_number:  e.estimate_number || `ZOHO-EST-${e.estimate_id}`,
        zoho_contact_id:  e.customer_id || null,
        contact_phone:    phoneMap.get(e.customer_id) ?? '',
        status:           e.status ?? 'draft',
        date:             e.date || null,
        expiry_date:      e.expiry_date || null,
        line_items:       e.line_items ?? [],
        subtotal:         dec(e.sub_total) ?? 0,
        tax_total:        dec(e.tax_total) ?? 0,
        total:            dec(e.total) ?? 0,
        notes:            e.notes || null,
        zoho_sync_status: 'synced',
        source:           'zoho',
        updated_at:       new Date().toISOString(),
      })
    }

    if (rows.length === 0) continue

    // ── Upsert this page — fall back to row-by-row on batch error ─────────────
    const { error } = await supabase
      .from('estimates')
      .upsert(rows, { onConflict: 'zoho_estimate_id' })

    if (error) {
      console.warn(`[estimates] batch upsert failed p${page}: ${error.message} — retrying row-by-row`)
      for (const row of rows) {
        const { error: rowErr } = await supabase
          .from('estimates')
          .upsert(row, { onConflict: 'zoho_estimate_id' })
        if (rowErr) {
          console.warn(`[estimates] row failed ${row.zoho_estimate_id}: ${rowErr.message}`)
          skipped++
        } else {
          upserted++
        }
      }
    } else {
      upserted += rows.length
    }

    console.log(`[estimates] page ${page}: +${rows.length} (total: ${upserted})`)

    lastPageSeen = page
    if (hasMore && Date.now() - startTime > TIME_BUDGET) {
      stoppedEarly = true
      console.log(`[estimates] time budget reached after page ${page}`)
      break
    }
  }

  const hasMorePages = stoppedEarly
  const nextPage     = hasMorePages ? lastPageSeen + 1 : null

  return {
    estimates_upserted: upserted,
    estimates_skipped:  skipped,
    pages_fetched:      pageCount,
    date_start:         dateStart,
    page_from:          pageFrom,
    page_to:            lastPageSeen,
    has_more:           hasMorePages,
    next_page:          nextPage,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices initial sync (last N days)
//
// Same strategy as syncAllEstimates — date_start filter, streamZohoPages,
// batched phone lookup, source='zoho' with DB-level preserve_source trigger.
//
// POST { "entity": "invoices", "days": 90 }   (days defaults to 90)
// ─────────────────────────────────────────────────────────────────────────────
async function syncAllInvoices(
  supabase: ReturnType<typeof createClient>,
  token: string,
  days = 90,
  pageFrom = 1,
  pageTo = 999
) {
  const dateStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  console.log(`[invoices] initial sync from ${dateStart} (last ${days} days)`)

  let upserted     = 0
  let skipped      = 0
  let pageCount    = 0
  let stoppedEarly = false
  let lastPageSeen = pageFrom - 1
  const startTime   = Date.now()
  const TIME_BUDGET = 110_000
  const maxPages    = pageTo - pageFrom + 1

  for await (const { rows: zohoInvoices, page, hasMore } of streamZohoPages<any>(
    '/invoices',
    token,
    ORG_ID,
    'invoices',
    { date_start: dateStart },
    maxPages,
    pageFrom
  )) {
    pageCount++
    console.log(`[invoices] page ${page}: ${zohoInvoices.length} records, has_more=${hasMore}`)
    if (zohoInvoices.length === 0) continue

    // ── Batch phone lookup ────────────────────────────────────────────────────
    const customerIds = [...new Set(
      zohoInvoices.map((inv: any) => inv.customer_id).filter(Boolean)
    )] as string[]

    const phoneMap = new Map<string, string>()
    if (customerIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('zoho_contact_id, phone')
        .in('zoho_contact_id', customerIds)
      for (const c of contacts ?? []) {
        if (c.phone) phoneMap.set(c.zoho_contact_id, c.phone)
      }
    }

    // ── Build invoice rows ────────────────────────────────────────────────────
    const rows: any[] = []
    for (const inv of zohoInvoices) {
      if (!inv.invoice_id) { skipped++; continue }
      rows.push({
        zoho_invoice_id:            inv.invoice_id,
        invoice_number:             inv.invoice_number || null,
        zoho_contact_id:            inv.customer_id || null,
        customer_name:              inv.customer_name || null,
        contact_phone:              phoneMap.get(inv.customer_id) ?? '',
        status:                     inv.status ?? 'draft',
        date:                       inv.date || null,
        due_date:                   inv.due_date || null,
        issued_date:                inv.issued_date || null,
        payment_terms:              int(inv.payment_terms),
        payment_terms_label:        inv.payment_terms_label || null,
        currency_code:              inv.currency_code || 'INR',
        exchange_rate:              dec(inv.exchange_rate) ?? 1.0,
        discount_type:              inv.discount_type || null,
        is_discount_before_tax:     inv.is_discount_before_tax ?? true,
        entity_discount_percent:    dec(inv.entity_discount_percent) ?? 0,
        is_inclusive_tax:           inv.is_inclusive_tax ?? true,
        line_items:                 inv.line_items ?? [],
        subtotal:                   dec(inv.sub_total) ?? 0,
        tax_total:                  dec(inv.tax_total) ?? 0,
        total:                      dec(inv.total) ?? 0,
        balance:                    dec(inv.balance) ?? 0,
        adjustment:                 dec(inv.adjustment) ?? 0,
        adjustment_description:     inv.adjustment_description || null,
        adjustment_account:         inv.adjustment_account || null,
        notes:                      inv.notes || null,
        terms_and_conditions:       inv.terms_and_conditions || null,
        purchase_order:             inv.purchase_order || null,
        place_of_supply:            inv.place_of_supply || null,
        gst_treatment:              inv.gst_treatment || null,
        gstin:                      inv.gstin || null,
        invoice_type:               inv.invoice_type || 'Invoice',
        einvoice_status:            inv.einvoice_status || null,
        branch_id:                  inv.branch_id || null,
        branch_name:                inv.branch_name || null,
        accounts_receivable:        inv.accounts_receivable || null,
        tcs_amount:                 dec(inv.tcs_amount) ?? 0,
        tds_amount:                 dec(inv.tds_amount) ?? 0,
        shipping_charge:            dec(inv.shipping_charge) ?? 0,
        estimate_number:            inv.estimate_number || null,
        zoho_sync_status:           'synced',
        source:                     'zoho',
        updated_at:                 new Date().toISOString(),
      })
    }

    if (rows.length === 0) continue

    const { error } = await supabase
      .from('invoices')
      .upsert(rows, { onConflict: 'zoho_invoice_id' })

    if (error) {
      console.warn(`[invoices] batch upsert failed p${page}: ${error.message} — retrying row-by-row`)
      for (const row of rows) {
        const { error: rowErr } = await supabase
          .from('invoices')
          .upsert(row, { onConflict: 'zoho_invoice_id' })
        if (rowErr) {
          console.warn(`[invoices] row failed ${row.zoho_invoice_id}: ${rowErr.message}`)
          skipped++
        } else {
          upserted++
        }
      }
    } else {
      upserted += rows.length
    }

    console.log(`[invoices] page ${page}: +${rows.length} (total: ${upserted})`)

    lastPageSeen = page
    if (hasMore && Date.now() - startTime > TIME_BUDGET) {
      stoppedEarly = true
      console.log(`[invoices] time budget reached after page ${page}`)
      break
    }
  }

  const hasMorePages = stoppedEarly
  const nextPage     = hasMorePages ? lastPageSeen + 1 : null

  return {
    invoices_upserted: upserted,
    invoices_skipped:  skipped,
    pages_fetched:     pageCount,
    date_start:        dateStart,
    page_from:         pageFrom,
    page_to:           lastPageSeen,
    has_more:          hasMorePages,
    next_page:         nextPage,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let entity: 'locations' | 'items' | 'item_locations' | 'pricebooks' | 'contacts' | 'geocode_locations' | 'invoices' | 'estimates' | 'all' = 'all'
  let pageFrom   = 1
  let pageTo     = 999
  let itemOffset = 0
  let itemLimit  = 500
  let locationId: string | undefined
  let days       = 90

  try {
    const body = await req.json()
    if (body?.entity && ['locations', 'items', 'item_locations', 'pricebooks', 'contacts', 'geocode_locations', 'invoices', 'estimates', 'all'].includes(body.entity)) {
      entity = body.entity
    }
    if (typeof body?.page_from   === 'number') pageFrom   = body.page_from
    if (typeof body?.page_to     === 'number') pageTo     = body.page_to
    if (typeof body?.item_offset === 'number') itemOffset = body.item_offset
    if (typeof body?.item_limit  === 'number') itemLimit  = body.item_limit
    if (typeof body?.location_id === 'string') locationId = body.location_id
    if (typeof body?.days        === 'number') days       = body.days
  } catch { /* no body or not JSON — use defaults */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const token = await getZohoToken(supabase)
    console.log(`initial_sync started — entity=${entity}, page_from=${pageFrom}, page_to=${pageTo}`)

    const startedAt            = new Date().toISOString()
    let locationsResult        = null
    let itemsResult            = null
    let itemLocationsResult    = null
    let pricebooksResult       = null
    let contactsResult         = null
    let geocodeResult          = null
    let estimatesResult        = null
    let invoicesResult         = null

    if (entity === 'geocode_locations') {
      console.log('Starting standalone geocode pass…')
      geocodeResult = await geocodeLocations(supabase)
      console.log('Geocode complete:', geocodeResult)
    }

    if (entity === 'locations' || entity === 'all') {
      console.log('Starting locations sync…')
      locationsResult = await syncLocations(supabase, token)
      console.log('Locations sync complete:', locationsResult)
    }

    if (entity === 'items' || entity === 'all') {
      console.log('Starting full items sync…')
      itemsResult = await syncAllItems(supabase, token)
      console.log('Items sync complete:', itemsResult)
    }

    if (entity === 'pricebooks' || entity === 'all') {
      console.log('Starting pricebooks sync…')
      pricebooksResult = await syncPricebooks(supabase, token)
      console.log('Pricebooks sync complete:', pricebooksResult)
    }

    if (entity === 'item_locations') {
      console.log(`Starting item_locations sync (offset=${itemOffset}, limit=${itemLimit}, warehouse=${locationId ?? 'all'})…`)
      itemLocationsResult = await syncItemLocations(supabase, token, itemOffset, itemLimit, locationId)
      console.log('Item-locations sync complete:', itemLocationsResult)
    }

    if (entity === 'contacts' || entity === 'all') {
      console.log(`Starting contacts sync (pages ${pageFrom}–${pageTo === 999 ? 'end' : pageTo})…`)
      contactsResult = await syncAllContacts(supabase, token, pageFrom, pageTo)
      console.log('Contacts sync complete:', contactsResult)
    }

    if (entity === 'estimates') {
      console.log(`Starting estimates initial sync (last ${days} days, pages ${pageFrom}–${pageTo === 999 ? 'end' : pageTo})…`)
      estimatesResult = await syncAllEstimates(supabase, token, days, pageFrom, pageTo)
      console.log('Estimates sync complete:', estimatesResult)
    }

    if (entity === 'invoices') {
      console.log(`Starting invoices initial sync (last ${days} days, pages ${pageFrom}–${pageTo === 999 ? 'end' : pageTo})…`)
      invoicesResult = await syncAllInvoices(supabase, token, days, pageFrom, pageTo)
      console.log('Invoices sync complete:', invoicesResult)
    }

    const summary = {
      entity,
      started_at:   startedAt,
      completed_at: new Date().toISOString(),
      ...(geocodeResult       ? { geocode:        geocodeResult }        : {}),
      ...(locationsResult     ? { locations:      locationsResult }     : {}),
      ...(itemsResult         ? { items:          itemsResult }         : {}),
      ...(itemLocationsResult ? { item_locations: itemLocationsResult } : {}),
      ...(pricebooksResult    ? { pricebooks:     pricebooksResult }    : {}),
      ...(contactsResult      ? { contacts:       contactsResult }      : {}),
      ...(estimatesResult     ? { estimates:      estimatesResult }     : {}),
      ...(invoicesResult      ? { invoices:       invoicesResult }      : {}),
    }

    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('initial_sync error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
