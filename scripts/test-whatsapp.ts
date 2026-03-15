// scripts/test-whatsapp.ts
// Run: npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "Test message"

import * as https from 'https'

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env
const toPhone = process.argv[2]
const message = process.argv[3] || 'WineYard catalog test message ✅'

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.error('❌ Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID')
  process.exit(1)
}
if (!toPhone) {
  console.error('Usage: npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "message"')
  process.exit(1)
}

const phone = toPhone.replace('+', '')
const body = JSON.stringify({
  messaging_product: 'whatsapp',
  to: phone,
  type: 'text',
  text: { body: message },
})

const req = https.request({
  hostname: 'graph.facebook.com',
  path: `/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
  method: 'POST',
  headers: {
    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => {
    const parsed = JSON.parse(data)
    if (parsed.messages) {
      console.log(`✅ WhatsApp message sent to ${toPhone}. Message ID: ${parsed.messages[0].id}`)
    } else {
      console.error('❌ Send failed:', JSON.stringify(parsed, null, 2))
    }
  })
})
req.on('error', err => console.error('❌ Request error:', err))
req.write(body)
req.end()
