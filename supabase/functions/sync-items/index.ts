// TODO: Implement — see architecture docs §8 Sync Architecture (items sync Edge Function)
// Fetches all items from Zoho Books and upserts into items + item_locations tables
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  return new Response(JSON.stringify({ todo: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
