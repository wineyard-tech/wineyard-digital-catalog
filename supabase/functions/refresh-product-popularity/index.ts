// refresh-product-popularity Edge Function
// Calls refresh_product_popularity() — a Postgres function that:
//   1. Unnests sales_orders.line_items (JSONB) for the last 90 days
//   2. Computes order counts (7d / 30d / 90d), quantity, revenue, repeat-purchase rate
//   3. Ranks each product within its category by 30d order count
//   4. Upserts into product_popularity
//   5. Excludes items with system_type = 'service'
//
// Triggered daily at 04:30 AM IST (23:00 UTC) via pg_cron → net.http_post.
// Can also be triggered manually: POST /functions/v1/refresh-product-popularity

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data, error } = await supabase.rpc('refresh_product_popularity')

    if (error) {
      console.error('refresh_product_popularity error:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('refresh-product-popularity complete:', data)
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('refresh-product-popularity unexpected error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
