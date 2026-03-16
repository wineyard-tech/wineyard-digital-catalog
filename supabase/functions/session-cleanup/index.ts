// session-cleanup Edge Function
// Called by pg_cron every 15 minutes. Delegates to the cleanup_expired_sessions()
// PostgreSQL function defined in 004_functions.sql, which deletes:
//   - sessions expired or inactive >15 days
//   - auth_requests that are expired or already used
//   - guest_sessions that are expired

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const { data, error } = await supabase.rpc('cleanup_expired_sessions')
    if (error) throw error

    const result = { deleted: data as number }
    console.log('session-cleanup complete:', result)
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('session-cleanup error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
