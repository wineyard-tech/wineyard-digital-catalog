// scripts/test-sync-contacts.ts
// Local test for sync-contacts logic — runs in Node.js against local Supabase.
// Usage: export $(grep -v '^#' app/.env.local | xargs) && npx ts-node scripts/test-sync-contacts.ts [limit]
//
// Pass an optional numeric limit as argv[2] (default: 50) to cap contacts for testing.

import * as https from 'https'
import * as querystring from 'querystring'
import { createClient } from '@supabase/supabase-js'

const {
  ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID,
} = process.env

if (!ZOHO_CLIENT_ID || !ZOHO_REFRESH_TOKEN || !ZOHO_ORG_ID) {
  console.error('❌ Missing Zoho env vars. Run: export $(grep -v \'^#\' app/.env.local | xargs)')
  process.exit(1)
}

// Always target local Supabase for this test script
// (app/.env.local has remote keys; local JWT is the standard demo key)
const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321'
const SUPABASE_LOCAL_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const TEST_LIMIT = parseInt(process.argv[2] || '50', 10)
const supabase = createClient(SUPABASE_LOCAL_URL, SUPABASE_LOCAL_SERVICE_KEY)

// ── Phone normalization (mirrors phone-normalizer.ts) ─────────────────────────

function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  let mobile: string
  if (digits.length === 10) mobile = digits
  else if (digits.length === 11 && digits.startsWith('0')) mobile = digits.slice(1)
  else if (digits.length === 12 && digits.startsWith('91')) mobile = digits.slice(2)
  else if (digits.length === 13 && digits.startsWith('091')) mobile = digits.slice(3)
  else return null
  if (mobile.length !== 10 || !/^[6-9]/.test(mobile)) return null
  return `+91${mobile}`
}

function extractPhoneFromContact(contact: any): string | null {
  const candidates = [contact.mobile, contact.phone, contact.billing_address?.phone]
  const persons: any[] = contact.contact_persons ?? []
  const primary = persons.find((p: any) => p.is_primary_contact)
  const others = persons.filter((p: any) => !p.is_primary_contact)
  for (const p of primary ? [primary, ...others] : others) candidates.push(p.mobile, p.phone)
  for (const raw of candidates) { const n = normalizeIndianPhone(raw); if (n) return n }
  return null
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function post(url: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))) })
    req.on('error', reject); req.write(body); req.end()
  })
}

function get(url: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))) })
    req.on('error', reject); req.end()
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Testing sync-contacts (limit: ${TEST_LIMIT})...\n`)

  // 1. Get Zoho token
  const tokenBody = querystring.stringify({
    refresh_token: ZOHO_REFRESH_TOKEN, client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET, grant_type: 'refresh_token',
  })
  const tokenRes = await post('https://accounts.zoho.in/oauth/v2/token', tokenBody)
  if (!tokenRes.access_token) { console.error('❌ Token refresh failed:', tokenRes); process.exit(1) }
  const token = tokenRes.access_token
  console.log('✅ Token obtained')

  // 2. Fetch contacts (first page only for test)
  console.log(`\nFetching up to ${TEST_LIMIT} contacts...`)
  const contactsRes = await get(
    `https://www.zohoapis.in/books/v3/contacts?organization_id=${ZOHO_ORG_ID}&per_page=${Math.min(TEST_LIMIT, 200)}&page=1&filter_by=Status.Active&contact_type=customer`,
    token
  )
  if (contactsRes.code !== 0) { console.error('❌ Contacts fetch failed:', contactsRes); process.exit(1) }

  const zohoContacts: any[] = (contactsRes.contacts ?? []).slice(0, TEST_LIMIT)
  console.log(`✅ Fetched ${zohoContacts.length} contacts from Zoho`)

  // 3. Build rows
  const contactRows: any[] = []
  const personRows: any[] = []
  let skipped = 0

  for (const contact of zohoContacts) {
    const phone = extractPhoneFromContact(contact)
    if (!phone) {
      console.warn(`   ⚠️  Skipping "${contact.contact_name}": no valid phone`)
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
      pricebook_id: contact.pricebook_id || null,
      phone,
      email: contact.email || null,
      billing_address: contact.billing_address ?? null,
      shipping_address: contact.shipping_address ?? null,
      payment_terms: contact.payment_terms ?? null,
      payment_terms_label: contact.payment_terms_label || null,
      currency_code: contact.currency_code || 'INR',
      custom_fields: contact.custom_fields ?? {},
      created_time: contact.created_time || null,
      last_modified_time: contact.last_modified_time || null,
      updated_at: new Date().toISOString(),
    })
    for (const p of (contact.contact_persons ?? [])) {
      if (!p.contact_person_id) continue
      personRows.push({
        zoho_contact_person_id: p.contact_person_id,
        zoho_contact_id: contact.contact_id,
        first_name: p.first_name || null, last_name: p.last_name || null,
        email: p.email || null,
        phone: normalizeIndianPhone(p.phone), mobile: normalizeIndianPhone(p.mobile),
        is_primary: p.is_primary_contact ?? false,
        communication_preference: p.communication_preference ?? null,
      })
    }
  }

  console.log(`\n📊 Built ${contactRows.length} contact rows, ${personRows.length} contact person rows, ${skipped} skipped (no phone)`)

  // 4. Upsert contacts
  console.log('\nUpserting contacts into local Supabase...')
  let synced = 0
  let dbSkipped = 0
  for (let i = 0; i < contactRows.length; i += 100) {
    const batch = contactRows.slice(i, i + 100)
    const { error } = await supabase.from('contacts').upsert(batch, { onConflict: 'zoho_contact_id' })
    if (!error) { synced += batch.length; continue }
    for (const row of batch) {
      const { error: re } = await supabase.from('contacts').upsert(row, { onConflict: 'zoho_contact_id' })
      if (re) { console.warn(`   ⚠️  Skip "${row.contact_name}": ${re.message}`); dbSkipped++ }
      else synced++
    }
  }
  console.log(`✅ Contacts upserted: ${synced} | skipped: ${dbSkipped}`)

  // 5. Upsert contact persons
  let pSynced = 0
  if (personRows.length > 0) {
    console.log(`\nUpserting ${personRows.length} contact persons...`)
    for (let i = 0; i < personRows.length; i += 100) {
      const batch = personRows.slice(i, i + 100)
      const { error } = await supabase.from('contact_persons').upsert(batch, { onConflict: 'zoho_contact_person_id' })
      if (error) console.warn(`   ⚠️  Batch warning: ${error.message}`)
      else pSynced += batch.length
    }
    console.log(`✅ Contact persons upserted: ${pSynced}`)
  }

  // 6. Verify in DB
  const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true })
  console.log(`\n✅ Total contacts now in local DB: ${count}`)
  console.log('\n🎉 sync-contacts test complete!\n')
}

main().catch(err => { console.error('\n❌ Error:', err); process.exit(1) })
