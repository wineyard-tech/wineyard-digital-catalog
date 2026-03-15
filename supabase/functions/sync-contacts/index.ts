// TODO: Implement — see architecture docs §8 Sync Architecture (contacts sync Edge Function)
// Fetches all contacts from Zoho Books and upserts into contacts + contact_persons tables
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  return new Response(JSON.stringify({ todo: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
