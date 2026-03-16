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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getZohoToken, fetchAllZohoPages } from '../_shared/zoho-client.ts'
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
    // Optional: pass {"test_limit": 50} in body to cap contacts for local testing
    let testLimit: number | null = null
    try {
      const body = await req.json()
      if (body?.test_limit) testLimit = Number(body.test_limit)
    } catch { /* no body or not JSON */ }

    const token = await getZohoToken(supabase)

    // Fetch active customers — capped to test_limit pages if set
    const maxPages = testLimit ? Math.ceil(testLimit / 200) : 100
    let zohoContacts = await fetchAllZohoPages<any>(
      '/contacts',
      token,
      ORG_ID,
      'contacts',
      { filter_by: 'Status.Active', contact_type: 'customer' },
      maxPages
    )
    if (testLimit) zohoContacts = zohoContacts.slice(0, testLimit)

    console.log(`Fetched ${zohoContacts.length} contacts from Zoho${testLimit ? ` (test_limit: ${testLimit})` : ''}`)

    // ── Build rows in memory (no DB calls per contact) ────────────────────────
    const contactRows: any[] = []
    const personRows: any[] = []
    let skipped = 0

    for (const contact of zohoContacts) {
      const phone = extractPhoneFromContact(contact)

      if (!phone) {
        console.warn(`Skipping "${contact.contact_name}" (${contact.contact_id}): no valid phone`)
        skipped++
        continue
      }

      contactRows.push({
        zoho_contact_id: contact.contact_id,
        contact_name: contact.contact_name,
        company_name: contact.company_name || null,
        contact_type: contact.contact_type || 'customer',
        status: contact.status ?? 'active',
        primary_contact_person_id: contact.primary_contact_person_id || null,
        pricebook_id: contact.pricebook_id || null, // stored; not used for pricing in Phase 1
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

    // ── Batch upsert contacts (row-by-row fallback on phone conflict) ─────────
    let synced = 0
    for (let i = 0; i < contactRows.length; i += 100) {
      const batch = contactRows.slice(i, i + 100)
      const { error } = await supabase
        .from('contacts')
        .upsert(batch, { onConflict: 'zoho_contact_id' })

      if (!error) { synced += batch.length; continue }

      // Fallback: row-by-row to isolate duplicate phone conflicts
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('contacts')
          .upsert(row, { onConflict: 'zoho_contact_id' })
        if (rowErr) {
          console.warn(`Skipping "${row.contact_name}": ${rowErr.message}`)
          skipped++
        } else {
          synced++
        }
      }
    }

    // ── Batch upsert contact persons ──────────────────────────────────────────
    let personsSynced = 0
    for (let i = 0; i < personRows.length; i += 100) {
      const batch = personRows.slice(i, i + 100)
      const { error } = await supabase
        .from('contact_persons')
        .upsert(batch, { onConflict: 'zoho_contact_person_id' })
      if (error) console.warn(`Contact persons batch warning: ${error.message}`)
      else personsSynced += batch.length
    }

    const summary = {
      contacts_synced: synced,
      contacts_skipped: skipped,
      contact_persons_synced: personsSynced,
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
