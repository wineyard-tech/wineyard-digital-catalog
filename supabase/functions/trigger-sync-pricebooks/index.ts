// trigger-sync-pricebooks — thin Zoho-facing endpoint.
// Validates x-zoho-webhook-token, returns 202 immediately, then invokes sync-pricebooks
// via HTTP (service role) so Zoho automations do not hit 502 on long sync runs.
//
// Zoho URL: POST https://<PROJECT_REF>.supabase.co/functions/v1/trigger-sync-pricebooks
// Headers: x-zoho-webhook-token: <ZOHO_WEBHOOK_TOKEN>
//
// Local: supabase functions serve — then
//   curl -s -X POST http://127.0.0.1:54321/functions/v1/trigger-sync-pricebooks \
//     -H "x-zoho-webhook-token: $ZOHO_WEBHOOK_TOKEN" -H "Content-Type: application/json" -d '{}'

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { EdgeRuntime } from 'jsr:@supabase/functions-js@2/edge-runtime'
import { timingSafeEqualString } from '../_shared/webhook-auth.ts'

const ENV_TOKEN = 'ZOHO_WEBHOOK_TOKEN'

function runSyncPricebooks(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[trigger-sync-pricebooks] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return Promise.resolve()
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sync-pricebooks`

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
    .then(async (res) => {
      const body = await res.text()
      if (!res.ok) {
        console.error('[trigger-sync-pricebooks] sync-pricebooks failed', res.status, body.slice(0, 500))
      } else {
        console.log('[trigger-sync-pricebooks] sync-pricebooks completed', res.status)
      }
    })
    .catch((err) => {
      console.error('[trigger-sync-pricebooks] sync-pricebooks request error', err)
    })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const expectedToken = Deno.env.get(ENV_TOKEN)
  if (!expectedToken) {
    console.error(`[trigger-sync-pricebooks] ${ENV_TOKEN} not set`)
    return new Response('Unauthorized', { status: 401 })
  }

  const receivedToken = req.headers.get('x-zoho-webhook-token')
  if (!receivedToken) {
    console.warn('[trigger-sync-pricebooks] missing x-zoho-webhook-token')
    return new Response('Unauthorized', { status: 401 })
  }

  if (!timingSafeEqualString(receivedToken, expectedToken)) {
    console.warn('[trigger-sync-pricebooks] token mismatch')
    return new Response('Unauthorized', { status: 401 })
  }

  EdgeRuntime.waitUntil(runSyncPricebooks())

  return new Response(
    JSON.stringify({
      accepted: true,
      triggered: 'sync-pricebooks',
      at: new Date().toISOString(),
    }),
    {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
