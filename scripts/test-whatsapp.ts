// scripts/test-whatsapp.ts
// Tests WhatsApp connectivity in two steps:
//   1. Template message (hello_world) — works for cold recipients, verifies sandbox setup
//   2. Free-form text — only works within 24h after recipient messages your business first
//
// Usage:
//   npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX
//   npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX freeform "Custom message"

import * as https from 'https'

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env
const toPhone = process.argv[2]
const mode = process.argv[3] || 'template'   // 'template' | 'freeform'
const customMessage = process.argv[4] || 'WineYard catalog test ✅'

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.error('❌ Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in .env.local')
  process.exit(1)
}
if (!toPhone) {
  console.error('Usage: npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX [template|freeform] ["message"]')
  process.exit(1)
}

const phone = toPhone.replace(/^\+/, '')

// Template message: uses Meta's approved hello_world template.
// Works for any sandbox-verified recipient with no 24h window required.
const templateBody = JSON.stringify({
  messaging_product: 'whatsapp',
  to: phone,
  type: 'template',
  template: {
    name: 'hello_world',
    language: { code: 'en_US' },
  },
})

// Free-form text: only delivers if recipient messaged your business in last 24h.
// Use this to test after the user has initiated a conversation.
const freeformBody = JSON.stringify({
  messaging_product: 'whatsapp',
  to: phone,
  type: 'text',
  text: { body: customMessage },
})

const body = mode === 'freeform' ? freeformBody : templateBody

console.log(`\n📱 Sending ${mode} message to ${toPhone} via phone ID ${WHATSAPP_PHONE_NUMBER_ID}`)
if (mode === 'freeform') {
  console.log('⚠️  Free-form mode: will only deliver if recipient messaged your business in last 24h')
}

const req = https.request(
  {
    hostname: 'graph.facebook.com',
    path: `/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = ''
    res.on('data', (chunk) => (data += chunk))
    res.on('end', () => {
      const parsed = JSON.parse(data)
      if (parsed.messages?.[0]?.id) {
        const status = parsed.messages[0].message_status ?? 'queued'
        console.log(`✅ Message accepted. ID: ${parsed.messages[0].id}`)
        console.log(`   Status: ${status}`)
        if (mode === 'template') {
          console.log('\nNext steps:')
          console.log('  • If you received "Hello World" on WhatsApp → sandbox is working ✅')
          console.log('  • Reply to it, then run with "freeform" mode to test custom messages')
          console.log('  • If no message received → add your number as a test recipient in Meta Dashboard')
          console.log('    https://developers.facebook.com/apps → WhatsApp → API Setup → "To" field')
        }
      } else {
        console.error('❌ Send failed:')
        console.error(JSON.stringify(parsed, null, 2))
        if (parsed.error?.code === 131030) {
          console.error('\n💡 Error 131030: Recipient not in sandbox test list.')
          console.error('   Go to Meta Developer Dashboard → WhatsApp → API Setup')
          console.error('   Add and OTP-verify +' + phone + ' as a test recipient.')
        }
      }
    })
  }
)

req.on('error', (err) => console.error('❌ Request error:', err))
req.write(body)
req.end()
