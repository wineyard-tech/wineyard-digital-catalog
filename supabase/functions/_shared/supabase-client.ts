// Shared Supabase admin client for Edge Functions (Deno runtime)
// Uses service role key — has full DB access, bypasses RLS.
// Import this singleton instead of calling createClient() in each function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      // Disable auto-refresh — Edge Functions are stateless, tokens don't persist
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
