// rebuild-customer-profiles Edge Function
// Weekly Sunday ~6:10 AM IST via pg_cron, after refresh-product-popularity (scripts/deploy-cron.sql).
//
// For each customer with ≥1 order in the last 180 days, computes:
//   system_affinity  — dominant system_type from 90-day line items (excludes universal/service)
//   brand_affinity   — brand covering >60% of 90-day line items (excludes Generic/null brands)
//   buyer_tier       — high(10+) / medium(3-9) / low(1-2) distinct orders in 90 days
//   is_repeat_buyer  — 2+ orders in 180 days
//   order_count_90d  — distinct basket count in 90-day window
//   last_order_date  — most recent basket date across all active baskets
//
// Deduplication: same 3-source logic as compute-product-associations.
//   Explicit links (estimate_number, converted_from_estimate_id) supersede upstream docs.
//   Fuzzy match: same customer + 30-day window + Jaccard ≥ 0.70 → keep most downstream.
//
// Upserts into customer_profiles (PK: zoho_contact_id). Logs created vs updated counts.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Constants ───────────────────────────────────────────────────────────────

const PROFILE_WINDOW_DAYS = 180       // window for qualifying customers + is_repeat_buyer
const AFFINITY_WINDOW_DAYS = 90       // window for affinity, tier, order_count_90d
const BRAND_DOMINANCE_THRESHOLD = 0.6 // brand must cover >60% of qualifying line items
const FUZZY_JACCARD_THRESHOLD = 0.70
const FUZZY_WINDOW_DAYS = 30
const UPSERT_BATCH_SIZE = 200

// Excluded from system_affinity tally (universal accessories, non-system items)
const EXCLUDED_SYSTEM_TYPES = new Set(['universal', 'service'])
// Excluded from brand_affinity tally (brandless or generic items)
const EXCLUDED_BRANDS = new Set(['Generic', 'generic', 'GENERIC', ''])

// ─── Types ───────────────────────────────────────────────────────────────────

type Source = 'invoice' | 'sales_order' | 'estimate'

interface BasketLineItem {
  zoho_item_id: string
  brand: string | null
  quantity: number
}

interface Basket {
  id: string
  source: Source
  contactId: string | null
  date: Date
  lineItems: BasketLineItem[]
  superseded: boolean
  estimateNumber: string | null
  convertedFromEstimateId: string | null
  ownEstimateNumber: string | null
}

interface CustomerProfileRow {
  zoho_contact_id: string
  system_affinity: string | null
  brand_affinity: string | null
  buyer_tier: 'high' | 'medium' | 'low'
  last_order_date: string
  order_count_90d: number
  is_repeat_buyer: boolean
  refreshed_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractLineItems(raw: unknown[]): BasketLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((li): li is Record<string, unknown> => !!li && typeof li === 'object')
    .map((li) => ({
      zoho_item_id: String(li['zoho_item_id'] ?? ''),
      brand: li['brand'] ? String(li['brand']).trim() : null,
      quantity: Number(li['quantity'] ?? 1),
    }))
    .filter((li) => li.zoho_item_id)
}

function jaccardSimilarity(a: BasketLineItem[], b: BasketLineItem[]): number {
  const setA = new Set(a.map((li) => li.zoho_item_id))
  const setB = new Set(b.map((li) => li.zoho_item_id))
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const id of setA) if (setB.has(id)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

const SOURCE_RANK: Record<Source, number> = { invoice: 3, sales_order: 2, estimate: 1 }

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadBaskets(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  windowStart: string,
): Promise<Basket[]> {
  const baskets: Basket[] = []

  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('zoho_invoice_id, zoho_contact_id, date, line_items, estimate_number')
    .gte('date', windowStart)
    .in('status', ['Closed', 'Overdue', 'Open', 'PartiallyPaid'])
    .not('line_items', 'is', null)
  if (invErr) throw new Error(`Load invoices: ${invErr.message}`)

  for (const inv of invoices ?? []) {
    baskets.push({
      id: `inv:${inv.zoho_invoice_id}`,
      source: 'invoice',
      contactId: inv.zoho_contact_id ?? null,
      date: new Date(inv.date),
      lineItems: extractLineItems(inv.line_items),
      superseded: false,
      estimateNumber: inv.estimate_number ?? null,
      convertedFromEstimateId: null,
      ownEstimateNumber: null,
    })
  }

  const { data: salesOrders, error: soErr } = await supabase
    .from('sales_orders')
    .select('id, zoho_contact_id, date, line_items, converted_from_estimate_id')
    .gte('date', windowStart)
    .in('status', ['confirmed', 'open', 'closed', 'fulfilled'])
    .not('line_items', 'is', null)
  if (soErr) throw new Error(`Load sales_orders: ${soErr.message}`)

  for (const so of salesOrders ?? []) {
    baskets.push({
      id: `so:${so.id}`,
      source: 'sales_order',
      contactId: so.zoho_contact_id ?? null,
      date: new Date(so.date),
      lineItems: extractLineItems(so.line_items),
      superseded: false,
      estimateNumber: null,
      convertedFromEstimateId: so.converted_from_estimate_id ? String(so.converted_from_estimate_id) : null,
      ownEstimateNumber: null,
    })
  }

  const { data: estimates, error: estErr } = await supabase
    .from('estimates')
    .select('id, zoho_contact_id, date, line_items, estimate_number')
    .gte('date', windowStart)
    .in('status', ['invoiced', 'sent', 'accepted'])
    .not('line_items', 'is', null)
  if (estErr) throw new Error(`Load estimates: ${estErr.message}`)

  for (const est of estimates ?? []) {
    baskets.push({
      id: `est:${est.id}`,
      source: 'estimate',
      contactId: est.zoho_contact_id ?? null,
      date: new Date(est.date),
      lineItems: extractLineItems(est.line_items),
      superseded: false,
      estimateNumber: null,
      convertedFromEstimateId: null,
      ownEstimateNumber: est.estimate_number ?? null,
    })
  }

  return baskets
}

// ─── Deduplication (same rules as compute-product-associations) ───────────────

function deduplicateBaskets(baskets: Basket[]): void {
  const estimateByNumber = new Map<string, Basket>()
  const estimateById = new Map<string, Basket>()

  for (const b of baskets) {
    if (b.source === 'estimate') {
      if (b.ownEstimateNumber) estimateByNumber.set(b.ownEstimateNumber, b)
      estimateById.set(b.id, b)
    }
  }

  // Step 1: explicit links
  for (const b of baskets) {
    if (b.source === 'invoice' && b.estimateNumber) {
      const est = estimateByNumber.get(b.estimateNumber)
      if (est) est.superseded = true
    }
    if (b.source === 'sales_order' && b.convertedFromEstimateId) {
      const est = estimateById.get(`est:${b.convertedFromEstimateId}`)
      if (est) est.superseded = true
    }
  }

  // Step 2: fuzzy match — same customer, ≤30 days apart, Jaccard ≥ 0.70
  const byContact = new Map<string, Basket[]>()
  for (const b of baskets) {
    if (!b.superseded && b.contactId) {
      const list = byContact.get(b.contactId) ?? []
      list.push(b)
      byContact.set(b.contactId, list)
    }
  }

  for (const group of byContact.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => a.date.getTime() - b.date.getTime())

    for (let i = 0; i < group.length; i++) {
      if (group[i].superseded) continue
      for (let j = i + 1; j < group.length; j++) {
        if (group[j].superseded) continue
        if (daysBetween(group[i].date, group[j].date) > FUZZY_WINDOW_DAYS) break
        if (jaccardSimilarity(group[i].lineItems, group[j].lineItems) >= FUZZY_JACCARD_THRESHOLD) {
          const rankI = SOURCE_RANK[group[i].source]
          const rankJ = SOURCE_RANK[group[j].source]
          if (rankI >= rankJ) group[j].superseded = true
          else group[i].superseded = true
        }
      }
    }
  }
}

// ─── Profile computation ──────────────────────────────────────────────────────

function computeSystemAffinity(
  baskets: Basket[],
  systemTypeMap: Map<string, string | null>,
): string | null {
  const counts = new Map<string, number>()
  for (const basket of baskets) {
    for (const li of basket.lineItems) {
      const st = systemTypeMap.get(li.zoho_item_id)
      if (!st || EXCLUDED_SYSTEM_TYPES.has(st)) continue
      counts.set(st, (counts.get(st) ?? 0) + li.quantity)
    }
  }
  if (counts.size === 0) return null

  let maxCount = 0
  let winner: string | null = null
  let tie = false
  for (const [type, count] of counts) {
    if (count > maxCount) { maxCount = count; winner = type; tie = false }
    else if (count === maxCount) { tie = true }
  }
  return tie ? null : winner
}

function computeBrandAffinity(baskets: Basket[]): string | null {
  const counts = new Map<string, number>()
  let total = 0
  for (const basket of baskets) {
    for (const li of basket.lineItems) {
      const brand = li.brand?.trim() ?? ''
      if (!brand || EXCLUDED_BRANDS.has(brand)) continue
      total += li.quantity
      counts.set(brand, (counts.get(brand) ?? 0) + li.quantity)
    }
  }
  if (total === 0) return null
  for (const [brand, count] of counts) {
    if (count / total > BRAND_DOMINANCE_THRESHOLD) return brand
  }
  return null
}

function buyerTier(orderCount: number): 'high' | 'medium' | 'low' {
  if (orderCount >= 10) return 'high'
  if (orderCount >= 3) return 'medium'
  return 'low'
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const now = new Date()
    const nowISO = now.toISOString()

    const profileWindowStart = new Date(now.getTime() - PROFILE_WINDOW_DAYS * 86400_000)
      .toISOString().split('T')[0]
    const affinityWindowStart = new Date(now.getTime() - AFFINITY_WINDOW_DAYS * 86400_000)
      .toISOString().split('T')[0]

    // ── 1. Load and deduplicate baskets (180-day window) ──────────────────────
    const baskets = await loadBaskets(supabase, profileWindowStart)
    deduplicateBaskets(baskets)

    const active = baskets.filter((b) => !b.superseded)
    console.log(`Baskets: ${baskets.length} loaded, ${active.length} active after dedup`)

    // ── 2. Find qualifying customers (≥1 basket in 180 days, with contactId) ──
    const customerBaskets180 = new Map<string, Basket[]>()
    for (const b of active) {
      if (!b.contactId) continue
      const list = customerBaskets180.get(b.contactId) ?? []
      list.push(b)
      customerBaskets180.set(b.contactId, list)
    }
    console.log(`Qualifying customers (180d): ${customerBaskets180.size}`)

    // ── 3. Batch-fetch system_type for all items in 90-day baskets ────────────
    const affinityWindowDate = new Date(affinityWindowStart)
    const allItemIds = new Set<string>()
    for (const [, cBaskets] of customerBaskets180) {
      for (const b of cBaskets) {
        if (b.date < affinityWindowDate) continue
        for (const li of b.lineItems) allItemIds.add(li.zoho_item_id)
      }
    }

    const systemTypeMap = new Map<string, string | null>()
    if (allItemIds.size > 0) {
      const { data: itemRows, error: itemErr } = await supabase
        .from('items')
        .select('zoho_item_id, system_type')
        .in('zoho_item_id', [...allItemIds])
      if (itemErr) throw new Error(`Fetch item system_types: ${itemErr.message}`)
      for (const row of itemRows ?? []) {
        systemTypeMap.set(row.zoho_item_id, row.system_type ?? null)
      }
    }
    console.log(`Fetched system_type for ${systemTypeMap.size} items`)

    // ── 4. Pre-fetch existing profile IDs to distinguish created vs updated ───
    const { data: existingRows, error: existErr } = await supabase
      .from('customer_profiles')
      .select('zoho_contact_id')
    if (existErr) throw new Error(`Fetch existing profiles: ${existErr.message}`)
    const existingIds = new Set((existingRows ?? []).map((r: { zoho_contact_id: string }) => r.zoho_contact_id))

    // ── 5. Build profile rows ─────────────────────────────────────────────────
    const profiles: CustomerProfileRow[] = []

    for (const [contactId, allBaskets] of customerBaskets180) {
      const baskets90 = allBaskets.filter((b) => b.date >= affinityWindowDate)

      const order_count_90d = baskets90.length
      const is_repeat_buyer = allBaskets.length >= 2
      const lastDate = allBaskets.reduce((max, b) => b.date > max ? b.date : max, allBaskets[0].date)

      profiles.push({
        zoho_contact_id: contactId,
        system_affinity: computeSystemAffinity(baskets90, systemTypeMap),
        brand_affinity: computeBrandAffinity(baskets90),
        buyer_tier: buyerTier(order_count_90d),
        last_order_date: lastDate.toISOString().split('T')[0],
        order_count_90d,
        is_repeat_buyer,
        refreshed_at: nowISO,
      })
    }

    // ── 6. Upsert in batches ──────────────────────────────────────────────────
    for (let i = 0; i < profiles.length; i += UPSERT_BATCH_SIZE) {
      const batch = profiles.slice(i, i + UPSERT_BATCH_SIZE)
      const { error } = await supabase
        .from('customer_profiles')
        .upsert(batch, { onConflict: 'zoho_contact_id' })
      if (error) throw new Error(`Upsert batch ${Math.floor(i / UPSERT_BATCH_SIZE)}: ${error.message}`)
    }

    const created = profiles.filter((p) => !existingIds.has(p.zoho_contact_id)).length
    const updated = profiles.length - created

    const summary = {
      profiles_created: created,
      profiles_updated: updated,
      profiles_total: profiles.length,
      qualifying_customers: customerBaskets180.size,
      baskets_active: active.length,
      baskets_superseded: baskets.length - active.length,
      computed_at: nowISO,
    }
    console.log('rebuild-customer-profiles complete:', summary)

    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('rebuild-customer-profiles error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
