// sync-contacts Edge Function
// Incremental sync: last_modified_time = T−24h5m (getLastModifiedFilter).
// Daily ~5:10 AM IST via pg_cron (staggered after sync-items; scripts/deploy-cron.sql).
// The overlap on the cutoff prevents records modified on the exact boundary
// from being missed.
//
// Phone extraction priority per contact:
//   contact.mobile → contact.phone → billing_address.phone
//   → primary contact_person.mobile → primary contact_person.phone
//   → any other contact_person mobile/phone
//
// All phones normalized to E.164 (+91XXXXXXXXXX).
// Contacts with no resolvable phone are skipped (cannot receive OTP).
//
// Uses streamZohoPages (async generator) to pipeline fetch + upsert per page.
// This avoids collecting all contacts into memory before writing,
// keeping memory flat and fitting within the 150s Edge Function timeout.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, streamZohoPages, getLastModifiedFilter } from '../_shared/zoho-client.ts'
import { normalizeIndianPhone, extractPhoneFromContact, describeContactPhones } from '../_shared/phone-normalizer.ts'

const ORG_ID = Deno.env.get('ZOHO_ORG_ID')!

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Optional: pass {"test_limit": N} in body to cap contacts for local testing
    let testLimit: number | null = null
    try {
      const body = await req.json()
      if (body?.test_limit) testLimit = Number(body.test_limit)
    } catch { /* no body or not JSON */ }

    const token = await getZohoToken(supabase)

    // Fetch only contacts modified since yesterday 03:55 AM IST (incremental sync)
    const lastModified = getLastModifiedFilter()
    console.log(`Fetching contacts modified since ${lastModified}`)

    let totalSynced = 0
    let totalSkipped = 0
    let totalPersonsSynced = 0
    let pageCount = 0
    let lastPageSeen = 0

    // ── Stream one page at a time: fetch → build → upsert → next page ────────
    // This pipelines network I/O with DB writes instead of collect-then-process,
    // keeping memory flat and total runtime well under the 150s timeout.
    for await (const { rows: zohoContacts, page, hasMore } of streamZohoPages<any>(
      '/contacts',
      token,
      ORG_ID,
      'contacts',
      { filter_by: 'Status.Active', contact_type: 'customer', last_modified_time: lastModified }
    )) {
      pageCount++

      // Apply test_limit: stop after we have enough
      const slice = testLimit
        ? zohoContacts.slice(0, Math.max(0, testLimit - totalSynced - totalSkipped))
        : zohoContacts
      if (slice.length === 0) break

      // ── Build rows for this page ────────────────────────────────────────────
      const contactRows: any[] = []
      const personRows: any[] = []

      for (const contact of slice) {
        const phoneResult = extractPhoneFromContact(contact)

        if (!phoneResult) {
          console.warn(`Skipping "${contact.contact_name}" (${contact.contact_id}): no valid phone — ${describeContactPhones(contact)}`)
          totalSkipped++
          continue
        }

        const { phone, source: phoneSource } = phoneResult
        if (phoneSource !== 'contact.mobile' && phoneSource !== 'contact.phone') {
          console.log(`"${contact.contact_name}" phone from ${phoneSource}: ${phone}`)
        }

        // Extract custom boolean flags from Zoho custom_fields array
        const cfFields: Array<{ api_name?: string; value?: unknown }> =
          Array.isArray(contact.custom_fields) ? contact.custom_fields : []
        const cfCatalogEntry = cfFields.find(f => f.api_name === 'cf_online_catalogue_access')
        const contact_online_catalogue_access =
          cfCatalogEntry?.value === true || cfCatalogEntry?.value === 'YES' || false
        const contact_catalog_access = contact_online_catalogue_access || false

        contactRows.push({
          zoho_contact_id: contact.contact_id,
          contact_name: contact.contact_name,
          company_name: contact.company_name || null,
          contact_type: contact.contact_type || 'customer',
          status: contact.status ?? 'active',
          primary_contact_person_id: contact.primary_contact_person_id || null,
          pricebook_id: contact.pricebook_id || contact.price_list_id || null,
          phone,
          email: contact.email || null,
          billing_address: contact.billing_address ?? null,
          shipping_address: contact.shipping_address ?? null,
          payment_terms: contact.payment_terms ?? null,
          payment_terms_label: contact.payment_terms_label || null,
          currency_id: contact.currency_id || null,
          currency_code: contact.currency_code || 'INR',
          custom_fields: Array.isArray(contact.custom_fields) ? contact.custom_fields : [],
          online_catalogue_access: contact_online_catalogue_access,
          catalog_access: contact_catalog_access,
          created_time: contact.created_time || null,
          last_modified_time: contact.last_modified_time || null,
          updated_at: new Date().toISOString(),
        })

        for (const person of (contact.contact_persons ?? [])) {
          if (!person.contact_person_id) continue
          personRows.push({
            zoho_contact_person_id: person.contact_person_id,
            zoho_contact_id: contact.contact_id,
            first_name: person.first_name || null,
            last_name: person.last_name || null,
            email: person.email || null,
            phone: normalizeIndianPhone(person.phone),
            mobile: normalizeIndianPhone(person.mobile),
            is_primary: person.is_primary_contact ?? false,
            communication_preference: person.communication_preference ?? null,
            online_catalogue_access: contact_online_catalogue_access,
            catalog_access: contact_catalog_access,
          })
        }
      }

      // ── Upsert contacts for this page ───────────────────────────────────────
      // Track which contact_ids were actually saved so we only insert their
      // contact_persons (avoids FK violations for skipped contacts).
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
              console.warn(`Skipping "${row.contact_name}": ${rowErr.message}`)
              totalSkipped++
            } else {
              upsertedContactIds.add(row.zoho_contact_id)
              totalSynced++
            }
          }
        } else {
          contactRows.forEach(r => upsertedContactIds.add(r.zoho_contact_id))
          totalSynced += contactRows.length
        }
      }

      // ── Upsert contact persons for this page ────────────────────────────────
      // Only insert persons whose parent contact was actually saved to avoid FK failures.
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
              console.warn(`Person ${row.zoho_contact_person_id} (${row.zoho_contact_id}): ${rowErr.message}`)
            } else {
              totalPersonsSynced++
            }
          }
        } else {
          totalPersonsSynced += safePersonRows.length
        }
      }

      lastPageSeen = page
      console.log(`Page ${page}: +${contactRows.length} contacts, +${safePersonRows.length} persons (running total: ${totalSynced})`)

      // Stop early if test_limit reached
      if (testLimit && (totalSynced + totalSkipped) >= testLimit) break

      // No more pages
      if (!hasMore) break
    }

    const summary = {
      contacts_synced:        totalSynced,
      contacts_skipped:       totalSkipped,
      contact_persons_synced: totalPersonsSynced,
      pages_fetched:          pageCount,
      page_from:              1,
      page_to:                lastPageSeen,
      has_more:               false,
      next_page:              null,
      last_modified_since:    lastModified,
      synced_at:              new Date().toISOString(),
    }

    console.log('sync-contacts complete:', summary)
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('sync-contacts error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
