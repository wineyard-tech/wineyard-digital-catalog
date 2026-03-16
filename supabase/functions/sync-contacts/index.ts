// sync-contacts Edge Function
// Fetches all active contacts from Zoho Books and upserts into contacts + contact_persons tables.
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
// This avoids collecting all 7500+ contacts into memory before writing,
// keeping memory flat and fitting within the 150s Edge Function timeout.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, streamZohoPages } from '../_shared/zoho-client.ts'
import { normalizeIndianPhone, extractPhoneFromContact } from '../_shared/phone-normalizer.ts'

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

    let totalSynced = 0
    let totalSkipped = 0
    let totalPersonsSynced = 0
    let pageCount = 0

    // ── Stream one page at a time: fetch → build → upsert → next page ────────
    // This pipelines network I/O with DB writes instead of collect-then-process,
    // keeping memory flat and total runtime well under the 150s timeout.
    for await (const { rows: zohoContacts, page, hasMore } of streamZohoPages<any>(
      '/contacts',
      token,
      ORG_ID,
      'contacts',
      { filter_by: 'Status.Active', contact_type: 'customer' }
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
        const phone = extractPhoneFromContact(contact)

        if (!phone) {
          console.warn(`Skipping "${contact.contact_name}" (${contact.contact_id}): no valid phone`)
          totalSkipped++
          continue
        }

        contactRows.push({
          zoho_contact_id: contact.contact_id,
          contact_name: contact.contact_name,
          company_name: contact.company_name || null,
          contact_type: contact.contact_type || 'customer',
          status: contact.status ?? 'active',
          primary_contact_person_id: contact.primary_contact_person_id || null,
          pricebook_id: contact.pricebook_id || null,
          phone,
          email: contact.email || null,
          billing_address: contact.billing_address ?? null,
          shipping_address: contact.shipping_address ?? null,
          payment_terms: contact.payment_terms ?? null,
          payment_terms_label: contact.payment_terms_label || null,
          currency_id: contact.currency_id || null,
          currency_code: contact.currency_code || 'INR',
          custom_fields: contact.custom_fields ?? {},
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
          })
        }
      }

      // ── Upsert contacts for this page ───────────────────────────────────────
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
              totalSynced++
            }
          }
        } else {
          totalSynced += contactRows.length
        }
      }

      // ── Upsert contact persons for this page ────────────────────────────────
      if (personRows.length > 0) {
        const { error } = await supabase
          .from('contact_persons')
          .upsert(personRows, { onConflict: 'zoho_contact_person_id' })
        if (error) {
          console.warn(`Contact persons p${page} warning: ${error.message}`)
        } else {
          totalPersonsSynced += personRows.length
        }
      }

      console.log(`Page ${page}: +${contactRows.length} contacts, +${personRows.length} persons (running total: ${totalSynced})`)

      // Stop early if test_limit reached
      if (testLimit && (totalSynced + totalSkipped) >= testLimit) break

      // No more pages
      if (!hasMore) break
    }

    const summary = {
      contacts_synced: totalSynced,
      contacts_skipped: totalSkipped,
      contact_persons_synced: totalPersonsSynced,
      pages_fetched: pageCount,
      synced_at: new Date().toISOString(),
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
