// compute-product-associations Edge Function
// Runs weekly (Sunday 8pm IST) to compute market-basket analysis across 3 document types.
//
// Document hierarchy (most → least authoritative):
//   invoice (3) > sales_order (2) > estimate (1)
//
// Deduplication:
//   1. Explicit links: invoices.estimate_number → supersede that estimate basket
//                      sales_orders.converted_from_estimate_id → supersede that estimate basket
//   2. Fuzzy match: same customer, within 30 days, Jaccard ≥ 0.70 → keep downstream doc
//
// Association types produced:
//   frequently_bought_together — same-basket co-purchases, primary from invoices,
//     supplemented by non-superseded estimates for pairs with < 15 invoice co-occurrences.
//     Estimate-supplemented pairs have confidence capped at 0.5 and estimate_supplemented=true.
//   people_also_buy — same-customer product pairs across all time, using all non-superseded baskets.
//
// Full refresh per type: delete then insert.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 500
const FBT_MIN_INVOICE_COOC = 15     // must have this many co-occurrences from invoices alone…
const FBT_MIN_COMBINED_COOC = 15    // …or this many when estimates supplement invoices
const FBT_MIN_LIFT = 1.5
const PAB_MIN_CUSTOMER_COOC = 10
const ESTIMATE_CONFIDENCE_CAP = 0.5
const FUZZY_JACCARD_THRESHOLD = 0.70
const FUZZY_WINDOW_DAYS = 30
const FBT_WINDOW_DAYS = 90

// ─── Types ───────────────────────────────────────────────────────────────────

interface CartItem {
  zoho_item_id: string
  [key: string]: unknown
}

type Source = 'invoice' | 'sales_order' | 'estimate'

interface Basket {
  id: string          // stable unique key: "inv:<zoho_invoice_id>" | "so:<id>" | "est:<id>"
  source: Source
  contactId: string | null
  date: Date
  items: string[]     // deduplicated zoho_item_ids
  superseded: boolean
  // Explicit linking fields
  estimateNumber: string | null   // invoice.estimate_number → links to an estimate basket
  convertedFromEstimateId: string | null  // SO.converted_from_estimate_id → links to an estimate
  ownEstimateNumber: string | null        // estimate's own estimate_number (for lookup)
}

interface AssociationRow {
  item_a_id: string
  item_b_id: string
  association_type: string
  co_occurrence_count: number
  estimate_supplemented: boolean
  support?: number
  confidence_a_to_b?: number
  confidence_b_to_a?: number
  lift_score?: number
  computed_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x]
}

function uniqueItemIds(lineItems: CartItem[]): string[] {
  if (!Array.isArray(lineItems)) return []
  return [...new Set(lineItems.map((li) => li.zoho_item_id).filter(Boolean))]
}

function increment(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by)
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const item of setA) if (setB.has(item)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

const SOURCE_RANK: Record<Source, number> = { invoice: 3, sales_order: 2, estimate: 1 }

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

async function batchInsert(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  table: string,
  rows: AssociationRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH_SIZE))
    if (error) throw new Error(`Insert batch ${Math.floor(i / BATCH_SIZE)} failed: ${error.message}`)
  }
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadBaskets(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  windowStart: string,
): Promise<Basket[]> {
  const baskets: Basket[] = []

  // Invoices (primary signal, last 90 days)
  // Valid statuses from Zoho: Closed, Overdue, Open, PartiallyPaid — exclude Draft and Void
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('zoho_invoice_id, zoho_contact_id, date, line_items, estimate_number, status')
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
      items: uniqueItemIds(inv.line_items),
      superseded: false,
      estimateNumber: inv.estimate_number ?? null,
      convertedFromEstimateId: null,
      ownEstimateNumber: null,
    })
  }

  // Sales orders (last 90 days — very small set in practice; only 'confirmed' in production)
  const { data: salesOrders, error: soErr } = await supabase
    .from('sales_orders')
    .select('id, zoho_contact_id, date, line_items, converted_from_estimate_id, status')
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
      items: uniqueItemIds(so.line_items),
      superseded: false,
      estimateNumber: null,
      convertedFromEstimateId: so.converted_from_estimate_id ? String(so.converted_from_estimate_id) : null,
      ownEstimateNumber: null,
    })
  }

  // Estimates (all active — used as supplement, no date window applied)
  // Statuses: 'invoiced' (linked to invoice), 'sent', 'accepted' — exclude 'draft'
  const { data: estimates, error: estErr } = await supabase
    .from('estimates')
    .select('id, zoho_contact_id, date, line_items, estimate_number, status')
    .in('status', ['invoiced', 'sent', 'accepted'])
    .not('line_items', 'is', null)
  if (estErr) throw new Error(`Load estimates: ${estErr.message}`)

  for (const est of estimates ?? []) {
    baskets.push({
      id: `est:${est.id}`,
      source: 'estimate',
      contactId: est.zoho_contact_id ?? null,
      date: new Date(est.date),
      items: uniqueItemIds(est.line_items),
      superseded: false,
      estimateNumber: null,
      convertedFromEstimateId: null,
      ownEstimateNumber: est.estimate_number ?? null,
    })
  }

  return baskets
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateBaskets(baskets: Basket[]): void {
  // Build lookup indexes
  const estimateByNumber = new Map<string, Basket>()  // estimate_number → estimate basket
  const estimateById = new Map<string, Basket>()       // "est:<id>" → estimate basket

  for (const b of baskets) {
    if (b.source === 'estimate') {
      if (b.ownEstimateNumber) estimateByNumber.set(b.ownEstimateNumber, b)
      estimateById.set(b.id, b)
    }
  }

  // Step 1: Explicit supersession
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

  // Step 2: Fuzzy dedup — same customer, within 30 days, Jaccard ≥ 0.70
  // Group non-superseded baskets by contactId (skip null contacts)
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
    // Sort by date ascending so we process chronologically
    group.sort((a, b) => a.date.getTime() - b.date.getTime())

    for (let i = 0; i < group.length; i++) {
      if (group[i].superseded) continue
      for (let j = i + 1; j < group.length; j++) {
        if (group[j].superseded) continue
        if (daysBetween(group[i].date, group[j].date) > FUZZY_WINDOW_DAYS) break

        const similarity = jaccardSimilarity(group[i].items, group[j].items)
        if (similarity >= FUZZY_JACCARD_THRESHOLD) {
          // Keep the more downstream document; tie-break by more recent date
          const rankI = SOURCE_RANK[group[i].source]
          const rankJ = SOURCE_RANK[group[j].source]
          if (rankI > rankJ) {
            group[j].superseded = true
          } else if (rankJ > rankI) {
            group[i].superseded = true
          } else {
            // Same source type: supersede the earlier one
            group[i].superseded = true
          }
        }
      }
    }
  }
}

// ─── Co-occurrence accumulation ───────────────────────────────────────────────

interface CooccStats {
  coOcc: Map<string, number>    // "itemA|itemB" → count
  itemFreq: Map<string, number> // zoho_item_id → basket count
  total: number                 // basket count
}

function accumulate(baskets: Basket[]): CooccStats {
  const coOcc = new Map<string, number>()
  const itemFreq = new Map<string, number>()
  let total = 0

  for (const basket of baskets) {
    if (basket.items.length === 0) continue
    total++
    for (const id of basket.items) increment(itemFreq, id)
    for (let i = 0; i < basket.items.length; i++) {
      for (let j = i + 1; j < basket.items.length; j++) {
        const [a, b] = canonicalPair(basket.items[i], basket.items[j])
        increment(coOcc, `${a}|${b}`)
      }
    }
  }

  return { coOcc, itemFreq, total }
}

// ─── FBT computation ─────────────────────────────────────────────────────────

function buildFbtRows(
  invoiceStats: CooccStats,
  estimateStats: CooccStats,
  now: string,
): AssociationRow[] {
  const rows: AssociationRow[] = []
  // Collect all candidate pair keys from both sources
  const allKeys = new Set([...invoiceStats.coOcc.keys(), ...estimateStats.coOcc.keys()])

  for (const key of allKeys) {
    const invCooc = invoiceStats.coOcc.get(key) ?? 0
    const estCooc = estimateStats.coOcc.get(key) ?? 0
    const [a, b] = key.split('|')

    let cooc: number
    let total: number
    let freqA: number
    let freqB: number
    let estimateSupplemented: boolean

    if (invCooc >= FBT_MIN_INVOICE_COOC) {
      // Invoice data alone meets the threshold — use invoices only
      cooc = invCooc
      total = invoiceStats.total
      freqA = invoiceStats.itemFreq.get(a) ?? 0
      freqB = invoiceStats.itemFreq.get(b) ?? 0
      estimateSupplemented = false
    } else if (invCooc + estCooc >= FBT_MIN_COMBINED_COOC) {
      // Supplement with estimates to reach threshold
      cooc = invCooc + estCooc
      total = invoiceStats.total + estimateStats.total
      freqA = (invoiceStats.itemFreq.get(a) ?? 0) + (estimateStats.itemFreq.get(a) ?? 0)
      freqB = (invoiceStats.itemFreq.get(b) ?? 0) + (estimateStats.itemFreq.get(b) ?? 0)
      estimateSupplemented = true
    } else {
      continue
    }

    if (freqA === 0 || freqB === 0 || total === 0) continue

    const support = cooc / total
    const pA = freqA / total
    const pB = freqB / total
    const lift = support / (pA * pB)

    if (lift <= FBT_MIN_LIFT) continue

    let confAB = cooc / freqA
    let confBA = cooc / freqB
    if (estimateSupplemented) {
      confAB = Math.min(confAB, ESTIMATE_CONFIDENCE_CAP)
      confBA = Math.min(confBA, ESTIMATE_CONFIDENCE_CAP)
    }

    rows.push({
      item_a_id: a,
      item_b_id: b,
      association_type: 'frequently_bought_together',
      co_occurrence_count: cooc,
      support,
      confidence_a_to_b: confAB,
      confidence_b_to_a: confBA,
      lift_score: lift,
      estimate_supplemented: estimateSupplemented,
      computed_at: now,
    })
  }

  return rows
}

// ─── PAB computation ─────────────────────────────────────────────────────────

function buildPabRows(baskets: Basket[], now: string): AssociationRow[] {
  // Accumulate all products a customer has ever purchased (across all basket sources)
  const customerItems = new Map<string, Set<string>>()
  for (const basket of baskets) {
    if (!basket.contactId || basket.items.length === 0) continue
    const existing = customerItems.get(basket.contactId) ?? new Set<string>()
    for (const id of basket.items) existing.add(id)
    customerItems.set(basket.contactId, existing)
  }

  // Co-occurrence per customer
  const pabCoOcc = new Map<string, number>()
  for (const items of customerItems.values()) {
    const arr = [...items]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [a, b] = canonicalPair(arr[i], arr[j])
        increment(pabCoOcc, `${a}|${b}`)
      }
    }
  }

  const rows: AssociationRow[] = []
  for (const [key, count] of pabCoOcc) {
    if (count < PAB_MIN_CUSTOMER_COOC) continue
    const [a, b] = key.split('|')
    rows.push({
      item_a_id: a,
      item_b_id: b,
      association_type: 'people_also_buy',
      co_occurrence_count: count,
      estimate_supplemented: false,
      computed_at: now,
    })
  }

  return rows
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
    const now = new Date().toISOString()
    const windowStart = new Date(Date.now() - FBT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]  // date only, matches the 'date' column type

    // ── 1. Load and deduplicate baskets ──────────────────────────────────────
    const baskets = await loadBaskets(supabase, windowStart)
    console.log(`Loaded: ${baskets.filter(b => b.source === 'invoice').length} invoices, ` +
      `${baskets.filter(b => b.source === 'sales_order').length} sales_orders, ` +
      `${baskets.filter(b => b.source === 'estimate').length} estimates`)

    deduplicateBaskets(baskets)

    const active = baskets.filter(b => !b.superseded)
    const supersededCount = baskets.length - active.length
    console.log(`After dedup: ${active.length} active baskets, ${supersededCount} superseded`)

    // ── 2. FBT: separate invoice and estimate stats ───────────────────────────
    const invoiceBaskets = active.filter(b => b.source === 'invoice')
    const estimateBaskets = active.filter(b => b.source === 'estimate')
    // Sales orders are merged into invoice stats (same authority tier for FBT counting)
    const soBaskets = active.filter(b => b.source === 'sales_order')
    const invoicePlusSoBaskets = [...invoiceBaskets, ...soBaskets]

    const invoiceStats = accumulate(invoicePlusSoBaskets)
    const estimateStats = accumulate(estimateBaskets)

    console.log(`FBT stats: ${invoiceStats.total} invoice/SO baskets, ${estimateStats.total} estimate baskets`)

    const fbtRows = buildFbtRows(invoiceStats, estimateStats, now)
    const fbtSupplemented = fbtRows.filter(r => r.estimate_supplemented).length
    console.log(`FBT: ${fbtRows.length} pairs (${fbtSupplemented} estimate-supplemented)`)

    // ── 3. PAB: all active baskets with a known customer ─────────────────────
    const pabRows = buildPabRows(active, now)
    console.log(`PAB: ${pabRows.length} pairs across ${active.filter(b => b.contactId).length} baskets with customer`)

    // ── 4. Full refresh ───────────────────────────────────────────────────────
    const { error: delFbt } = await supabase
      .from('product_associations')
      .delete()
      .eq('association_type', 'frequently_bought_together')
    if (delFbt) throw new Error(`Delete FBT: ${delFbt.message}`)
    await batchInsert(supabase, 'product_associations', fbtRows)

    const { error: delPab } = await supabase
      .from('product_associations')
      .delete()
      .eq('association_type', 'people_also_buy')
    if (delPab) throw new Error(`Delete PAB: ${delPab.message}`)
    await batchInsert(supabase, 'product_associations', pabRows)

    // ── 5. Summary ────────────────────────────────────────────────────────────
    const summary = {
      frequently_bought_together: fbtRows.length,
      frequently_bought_together_estimate_supplemented: fbtSupplemented,
      people_also_buy: pabRows.length,
      baskets_total: baskets.length,
      baskets_active: active.length,
      baskets_superseded: supersededCount,
      computed_at: now,
    }
    console.log('compute-product-associations complete:', summary)

    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('compute-product-associations error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
