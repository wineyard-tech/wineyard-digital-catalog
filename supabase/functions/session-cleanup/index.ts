// TODO: Implement — see architecture docs §8 Sync Architecture (session cleanup Edge Function)
// Calls cleanup_expired_sessions() PostgreSQL function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  return new Response(JSON.stringify({ todo: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
