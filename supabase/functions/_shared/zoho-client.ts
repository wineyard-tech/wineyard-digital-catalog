// Shared Zoho Books API client for Edge Functions (Deno runtime)
// Handles token refresh with DB caching and paginated fetches

/**
 * Returns the last_modified_time filter string for incremental Zoho syncs.
 * Computes yesterday at 03:55 AM IST — a 5-minute safety buffer before the
 * 04:00 AM IST daily cron — so any records updated on the boundary minute
 * of the previous run are never silently dropped.
 *
 * Format: "YYYY-MM-DDTHH:mm:ss+0530" as required by Zoho Books India region.
 */
export function getLastModifiedFilter(): string {
  // Compute current date in IST (UTC+5:30) using manual offset arithmetic
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(Date.now() + istOffsetMs)

  // Roll back to yesterday in IST calendar
  nowIST.setUTCDate(nowIST.getUTCDate() - 1)

  const year  = nowIST.getUTCFullYear()
  const month = String(nowIST.getUTCMonth() + 1).padStart(2, '0')
  const day   = String(nowIST.getUTCDate()).padStart(2, '0')

  // Fixed time: 03:55 AM IST with explicit IST offset required by Zoho India API
  return `${year}-${month}-${day}T03:55:00+0530`
}

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token'
const ZOHO_API_BASE = 'https://www.zohoapis.in/books/v3'

/**
 * Returns a valid Zoho access token, refreshing if expired.
 * Caches in zoho_tokens (id=1) to avoid unnecessary refreshes across invocations.
 */
export async function getZohoToken(supabase: SupabaseClient): Promise<string> {
  const { data: cached } = await supabase
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .eq('id', 1)
    .single()

  // Use cached token if valid with 60s buffer before expiry
  if (cached && new Date(cached.expires_at) > new Date(Date.now() + 60_000)) {
    return cached.access_token
  }

  const body = new URLSearchParams({
    refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN')!,
    client_id: Deno.env.get('ZOHO_CLIENT_ID')!,
    client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
    grant_type: 'refresh_token',
  })

  const res = await fetch(ZOHO_TOKEN_URL, { method: 'POST', body })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`)

  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString()
  await supabase.from('zoho_tokens').upsert({
    id: 1,
    access_token: json.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  return json.access_token
}

/** GET a Zoho Books endpoint with org_id and optional params. */
export async function zohoGet(
  path: string,
  token: string,
  orgId: string,
  params: Record<string, string | number> = {}
): Promise<any> {
  const q = new URLSearchParams({
    organization_id: orgId,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })
  const res = await fetch(`${ZOHO_API_BASE}${path}?${q}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!res.ok) throw new Error(`Zoho GET ${path} failed: ${res.status}`)
  return res.json()
}

/**
 * Iterates all pages of a Zoho list endpoint and returns combined results.
 * Use fetchAllZohoPages for small datasets (items, pricebooks).
 * For large datasets (contacts, 7500+) prefer streamZohoPages to avoid timeouts.
 */
export async function fetchAllZohoPages<T>(
  path: string,
  token: string,
  orgId: string,
  responseKey: string,
  extraParams: Record<string, string | number> = {},
  maxPages = 100
): Promise<T[]> {
  const all: T[] = []

  for (let page = 1; page <= maxPages; page++) {
    const json = await zohoGet(path, token, orgId, { per_page: 200, page, ...extraParams })
    if (json.code !== 0) throw new Error(`Zoho error on ${path} p${page}: ${json.message}`)

    const rows: T[] = json[responseKey] ?? []
    all.push(...rows)

    if (!json.page_context?.has_more_page) break
  }

  return all
}

/**
 * Async generator that yields one page (up to 200 rows) at a time.
 * Use for large datasets to pipeline fetch+upsert instead of collect-then-process.
 * Memory stays flat: only one page is held in memory at a time.
 *
 * startPage lets callers resume mid-dataset across multiple invocations
 * (e.g. contacts initial sync split across 3 calls to stay under WORKER_LIMIT).
 * maxPages is the maximum number of pages to fetch in this call, not an absolute cap.
 *
 * Usage:
 *   for await (const { rows, page, hasMore } of streamZohoPages(...)) {
 *     await upsertBatch(rows)
 *   }
 */
export async function* streamZohoPages<T>(
  path: string,
  token: string,
  orgId: string,
  responseKey: string,
  extraParams: Record<string, string | number> = {},
  maxPages = 200,
  startPage = 1
): AsyncGenerator<{ rows: T[]; page: number; hasMore: boolean }> {
  const endPage = startPage + maxPages - 1
  for (let page = startPage; page <= endPage; page++) {
    const json = await zohoGet(path, token, orgId, { per_page: 200, page, ...extraParams })
    if (json.code !== 0) throw new Error(`Zoho error on ${path} p${page}: ${json.message}`)

    const rows: T[] = json[responseKey] ?? []
    const hasMore = json.page_context?.has_more_page ?? false

    yield { rows, page, hasMore }

    if (!hasMore) break
  }
}
