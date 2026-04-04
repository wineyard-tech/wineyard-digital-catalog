// sync-invoices Edge Function
// Incremental sync: fetches only invoices modified since yesterday 03:55 AM IST.
// Runs daily at 04:10 AM IST via pg_cron (10 min after sync-items, 5 min after sync-contacts).
// The 5-minute overlap on the cutoff time prevents records modified on the exact boundary
// from being missed.
//
// Upserts with source='zoho'. The DB preserve_source trigger ensures that any invoice
// originally created by the catalog-app retains its source='catalog-app' — this function
// never overwrites that field.
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

/** Coerce to integer or null. */
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

    // Fetch only invoices modified since yesterday 03:55 AM IST (incremental sync)
    const lastModified = getLastModifiedFilter()
    console.log(`[sync-invoices] fetching invoices modified since ${lastModified}`)

    let totalUpserted = 0
    let totalSkipped  = 0
    let pageCount     = 0
    let lastPageSeen  = 0

    for await (const { rows: zohoInvoices, page, hasMore } of streamZohoPages<any>(
      '/invoices',
      token,
      ORG_ID,
      'invoices',
      { last_modified_time: lastModified }
    )) {
      pageCount++
      console.log(`[sync-invoices] page ${page}: ${zohoInvoices.length} records, has_more=${hasMore}`)
      if (zohoInvoices.length === 0) continue

      // ── Batch phone lookup: one IN query for all customer_ids on this page ───
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

      // ── Build invoice rows for this page ──────────────────────────────────────
      const rows: any[] = []
      for (const inv of zohoInvoices) {
        if (!inv.invoice_id) {
          console.warn(`[sync-invoices] skipping row with missing invoice_id on page ${page}`)
          totalSkipped++
          continue
        }
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
          // source is intentionally included so new rows get 'zoho'.
          // The DB preserve_source trigger silently ignores this on UPDATE,
          // keeping the original 'catalog-app' value for app-created invoices.
          source:                     'zoho',
          updated_at:                 new Date().toISOString(),
        })
      }

      if (rows.length === 0) continue

      // ── Upsert — fall back to row-by-row to isolate any constraint failures ──
      const { error } = await supabase
        .from('invoices')
        .upsert(rows, { onConflict: 'zoho_invoice_id' })

      if (error) {
        console.warn(`[sync-invoices] batch upsert failed p${page}: ${error.message} — retrying row-by-row`)
        for (const row of rows) {
          const { error: rowErr } = await supabase
            .from('invoices')
            .upsert(row, { onConflict: 'zoho_invoice_id' })
          if (rowErr) {
            console.warn(`[sync-invoices] row failed ${row.zoho_invoice_id}: ${rowErr.message}`)
            totalSkipped++
          } else {
            totalUpserted++
          }
        }
      } else {
        totalUpserted += rows.length
      }

      console.log(`[sync-invoices] page ${page}: +${rows.length} (running total: ${totalUpserted})`)

      lastPageSeen = page
      if (!hasMore) break
    }

    const summary = {
      invoices_upserted:   totalUpserted,
      invoices_skipped:    totalSkipped,
      pages_fetched:       pageCount,
      page_from:           1,
      page_to:             lastPageSeen,
      has_more:            false,
      next_page:           null,
      last_modified_since: lastModified,
      synced_at:           new Date().toISOString(),
    }

    console.log('[sync-invoices] complete:', summary)
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[sync-invoices] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
