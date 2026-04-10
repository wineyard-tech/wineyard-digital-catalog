// sync-estimates Edge Function
// Incremental sync: fetches only estimates modified since yesterday 03:55 AM IST.
// Runs daily at 04:15 AM IST via pg_cron (15 min after sync-items, staggered from other syncs).
// The 5-minute overlap on the cutoff time prevents records modified on the exact boundary
// from being missed.
//
// Upserts with source='zoho'. The DB preserve_source trigger ensures that any estimate
// originally created by the catalog-app retains its source='catalog-app' — this function
// never overwrites that field.
//
// Status transitions (draft → sent → accepted → invoiced) are the most important signal
// synced here. The estimates-webhook handles real-time updates; this function is the
// daily safety net for any events the webhook may have missed.
//
// Contact phone lookup is batched per page (one IN query per 200-row page) rather
// than per-row to keep DB round-trips constant regardless of page size.
//
// Uses streamZohoPages (async generator) to pipeline fetch + upsert per page.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, streamZohoPages, getLastModifiedFilter } from '../_shared/zoho-client.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

/** Coerce Zoho's "" / null / undefined numeric fields to a decimal or null. */
function dec(val: unknown): number | null {
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

    // Fetch only estimates modified since yesterday 03:55 AM IST (incremental sync)
    const lastModified = getLastModifiedFilter()
    console.log(`[sync-estimates] fetching estimates modified since ${lastModified}`)

    let totalUpserted = 0
    let totalSkipped  = 0
    let pageCount     = 0
    let lastPageSeen  = 0

    for await (const { rows: zohoEstimates, page, hasMore } of streamZohoPages<any>(
      '/estimates',
      token,
      ORG_ID,
      'estimates',
      { last_modified_time: lastModified }
    )) {
      pageCount++
      console.log(`[sync-estimates] page ${page}: ${zohoEstimates.length} records, has_more=${hasMore}`)
      if (zohoEstimates.length === 0) continue

      // ── Batch phone lookup: one IN query for all customer_ids on this page ───
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

      // ── Build estimate rows for this page ────────────────────────────────────
      const rows: any[] = []
      for (const e of zohoEstimates) {
        if (!e.estimate_id) {
          console.warn(`[sync-estimates] skipping row with missing estimate_id on page ${page}`)
          totalSkipped++
          continue
        }
        rows.push({
          zoho_estimate_id: e.estimate_id,
          estimate_number:  e.estimate_number || `ZOHO-EST-${e.estimate_id}`,
          zoho_contact_id:  e.customer_id || null,
          contact_phone:    phoneMap.get(e.customer_id) ?? '',
          status:           e.status ?? 'draft',
          date:             e.date || null,
          expiry_date:      e.expiry_date || null,
          // line_items intentionally omitted: Zoho's list endpoint does not return line items.
          // Omitting preserves any line_items previously written by the webhook handler or
          // by the detail fetch-and-writeback in the catalog API. New rows get the DB
          // default ('[]'::jsonb); existing rows keep their current value.
          subtotal:         dec(e.sub_total) ?? 0,
          tax_total:        dec(e.tax_total) ?? 0,
          total:            dec(e.total) ?? 0,
          notes:            e.notes || null,
          zoho_sync_status: 'SYNCED',
          // source is intentionally included so new rows get 'zoho'.
          // The DB preserve_source trigger silently ignores this on UPDATE,
          // keeping the original 'catalog-app' value for app-created estimates.
          source:           'zoho',
          updated_at:       new Date().toISOString(),
        })
      }

      if (rows.length === 0) continue

      // ── Upsert — fall back to row-by-row to isolate any constraint failures ──
      const { error } = await supabase
        .from('estimates')
        .upsert(rows, { onConflict: 'zoho_estimate_id' })

      if (error) {
        console.warn(`[sync-estimates] batch upsert failed p${page}: ${error.message} — retrying row-by-row`)
        for (const row of rows) {
          const { error: rowErr } = await supabase
            .from('estimates')
            .upsert(row, { onConflict: 'zoho_estimate_id' })
          if (rowErr) {
            console.warn(`[sync-estimates] row failed ${row.zoho_estimate_id}: ${rowErr.message}`)
            totalSkipped++
          } else {
            totalUpserted++
          }
        }
      } else {
        totalUpserted += rows.length
      }

      console.log(`[sync-estimates] page ${page}: +${rows.length} (running total: ${totalUpserted})`)

      lastPageSeen = page
      if (!hasMore) break
    }

    const summary = {
      estimates_upserted:  totalUpserted,
      estimates_skipped:   totalSkipped,
      pages_fetched:       pageCount,
      page_from:           1,
      page_to:             lastPageSeen,
      has_more:            false,
      next_page:           null,
      last_modified_since: lastModified,
      synced_at:           new Date().toISOString(),
    }

    console.log('[sync-estimates] complete:', summary)
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[sync-estimates] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
