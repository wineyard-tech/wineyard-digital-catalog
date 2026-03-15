// scripts/test-zoho-connection.ts
// Run: npx ts-node scripts/test-zoho-connection.ts

import * as https from 'https'
import * as querystring from 'querystring'

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ORG_ID,
} = process.env

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN || !ZOHO_ORG_ID) {
  console.error('❌ Missing env vars. Copy app/.env.local.example to app/.env.local and fill in Zoho credentials.')
  console.error('   Then run: source app/.env.local && npx ts-node scripts/test-zoho-connection.ts')
  process.exit(1)
}

async function post(url: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function get(url: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.end()
  })
}

async function main() {
  console.log('\n🔍 Testing Zoho API connection...\n')

  // 1. Refresh token
  console.log('1. Refreshing access token...')
  const tokenBody = querystring.stringify({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  const tokenRes = await post('https://accounts.zoho.in/oauth/v2/token', tokenBody)

  if (!tokenRes.access_token) {
    console.error('❌ Token refresh failed:', tokenRes)
    process.exit(1)
  }
  console.log('   ✅ Token obtained. Expires in:', tokenRes.expires_in, 'seconds')

  const token = tokenRes.access_token

  // 2. Fetch items
  console.log('\n2. Fetching items (first page)...')
  const itemsRes = await get(
    `https://www.zohoapis.in/books/v3/items?organization_id=${ZOHO_ORG_ID}&per_page=5`,
    token
  )
  if (itemsRes.code !== 0) {
    console.error('❌ Items fetch failed:', itemsRes)
    process.exit(1)
  }
  const items = itemsRes.items || []
  console.log(`   ✅ Items returned: ${items.length} (of ${itemsRes.page_context?.total || '?'} total)`)
  if (items[0]) {
    console.log(`   Sample item: "${items[0].name}" | SKU: ${items[0].sku} | Stock: ${items[0].available_stock}`)
    const hasLocations = items[0].locations && items[0].locations.length > 0
    console.log(`   Location-wise stock in response: ${hasLocations ? '✅ YES' : '⚠️  NO (will use available_stock total)'}`)
  }

  // 3. Fetch pricebooks
  console.log('\n3. Fetching pricebooks...')
  const pbRes = await get(
    `https://www.zohoapis.in/books/v3/pricebooks?organization_id=${ZOHO_ORG_ID}`,
    token
  )
  if (pbRes.code !== 0) {
    console.error('   ⚠️  Pricebooks fetch failed (may need ZohoBooks.pricebooks.READ scope):', pbRes.message)
  } else {
    const pbs = pbRes.pricebooks || []
    console.log(`   ✅ Pricebooks: ${pbs.map((p: any) => p.pricebook_name).join(', ') || 'none found'}`)
  }

  // 4. Fetch contacts (first page)
  console.log('\n4. Fetching contacts (first 3)...')
  const contactsRes = await get(
    `https://www.zohoapis.in/books/v3/contacts?organization_id=${ZOHO_ORG_ID}&per_page=3&filter_by=Status.Active`,
    token
  )
  if (contactsRes.code !== 0) {
    console.error('   ❌ Contacts fetch failed:', contactsRes)
  } else {
    const contacts = contactsRes.contacts || []
    console.log(`   ✅ Contacts returned: ${contacts.length}`)
    if (contacts[0]) {
      console.log(`   Sample: "${contacts[0].contact_name}" | Phone: ${contacts[0].billing_address?.phone || 'N/A'} | Pricebook: ${contacts[0].pricebook_id || 'none'}`)
    }
  }

  console.log('\n✅ Zoho API connection validated successfully!\n')
}

main().catch(err => {
  console.error('\n❌ Unexpected error:', err)
  process.exit(1)
})
