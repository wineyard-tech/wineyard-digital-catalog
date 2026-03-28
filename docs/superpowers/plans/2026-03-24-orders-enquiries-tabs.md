# Orders & Enquiries Tabbed Screen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing flat Orders screen with a two-tab layout — "Orders" (unified invoice/sales-order list) and "Enquiries" (estimates list) — each with detail views, reorder CTAs, and infinite scroll pagination.

**Architecture:** Two new customer-facing API routes handle paginated data fetching; three new page routes handle the tabbed list and detail views; a set of small focused components handles rendering. The cart's existing `loadItems`/`addItem` actions power all reorder flows without new state management.

**Tech Stack:** Next.js 15 App Router, TypeScript, inline styles (no component library), Supabase service client, CartContext (`loadItems`, `addItem`)

---

## Chunk 1: Types and API layer

### Task 1: Extend type definitions

**Files:**
- Modify: `types/catalog.ts`

- [ ] **Step 1: Add new interfaces to `types/catalog.ts`**

Append below the existing `EnquiryResponse` interface:

```typescript
// ── Unified transaction list (Orders tab) ─────────────────────────────────────

export type TransactionKind = 'invoice' | 'order'

export interface TransactionListItem {
  kind: TransactionKind
  /** zoho_invoice_id for invoices, public_id UUID for orders */
  id: string
  doc_number: string             // e.g. "INV-2045" or "SO-1892"
  date: string                   // ISO date string
  total: number
  item_count: number
  /** 'Invoiced' for invoices, 'Ordered' for sales orders */
  status_label: 'Invoiced' | 'Ordered'
}

export interface TransactionListResponse {
  items: TransactionListItem[]
  has_more: boolean
  next_offset: number
}

export interface LineItemDetail {
  zoho_item_id: string
  item_name: string
  sku: string
  quantity: number
  rate: number
  tax_percentage: number
  line_total: number
  image_url: string | null
}

export interface TransactionDetail {
  kind: TransactionKind
  id: string
  doc_number: string
  date: string
  total: number
  subtotal: number
  tax_total: number
  line_items: LineItemDetail[]
}

// ── Enquiries list (Enquiries tab) ────────────────────────────────────────────

export type EnquiryStatus = 'Pending' | 'Converted' | 'Expired'

export interface EnquiryListItem {
  id: string                // public_id UUID
  doc_number: string        // e.g. "ENQ-301"
  date: string              // ISO date string
  total: number
  item_count: number
  status: EnquiryStatus
}

export interface EnquiryListResponse {
  items: EnquiryListItem[]
  has_more: boolean
  next_offset: number
}

export interface EnquiryLineItemDetail extends LineItemDetail {
  /** null means item not found in catalog (unavailable) */
  available_stock: number | null
  stock_status: 'available' | 'limited' | 'out_of_stock' | 'unknown'
}

export interface EnquiryDetail {
  id: string
  doc_number: string
  date: string
  total: number
  subtotal: number
  tax_total: number
  status: EnquiryStatus
  estimate_id: string       // public_id UUID (same as id)
  line_items: EnquiryLineItemDetail[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to catalog.ts

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add types/catalog.ts && git commit -m "feat(orders): add TransactionListItem, EnquiryListItem, and detail types"
```

---

### Task 2: Update `GET /api/orders` — unified paginated list

**Files:**
- Modify: `app/src/app/api/orders/route.ts`

The GET handler is replaced. The POST handler is untouched.

**Algorithm:**
1. Fetch invoices for the user (lightweight fields, no full line_items blob).
2. Fetch sales_orders for the user (lightweight fields).
3. For each invoice that has an `estimate_number`, find the linked sales_order via `estimates.estimate_number → sales_orders.converted_from_estimate_id`. Mark that sales_order as "covered".
4. Unified list = all invoices + uncovered sales_orders, sorted by date descending.
5. Apply `offset` + `limit=20` pagination after sorting.

- [ ] **Step 1: Replace the GET handler in `app/src/app/api/orders/route.ts`**

Find the comment `// ── GET /api/orders — Fetch authenticated user's order list` to the end of the file and replace the entire GET function:

```typescript
// ── GET /api/orders — Unified paginated transaction list ─────────────────────

const LIST_LIMIT = 20

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const supabase = createServiceClient()

  // Fetch invoices (id used for routing, no full line_items body needed for list)
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('zoho_invoice_id, invoice_number, date, total, line_items, estimate_number')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('date', { ascending: false })

  if (invErr) {
    console.error('[orders] invoice fetch error:', invErr)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Fetch sales orders with their linked estimate number
  const { data: orders, error: ordErr } = await supabase
    .from('sales_orders')
    .select(`
      public_id,
      salesorder_number,
      date,
      created_at,
      total,
      line_items,
      converted_from_estimate_id,
      estimates!converted_from_estimate_id ( estimate_number )
    `)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('created_at', { ascending: false })

  if (ordErr) {
    console.error('[orders] orders fetch error:', ordErr)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Build set of estimate_numbers that are covered by an invoice
  const coveredByInvoice = new Set<string>()
  for (const inv of invoices ?? []) {
    if (inv.estimate_number) coveredByInvoice.add(inv.estimate_number)
  }

  // Build unified list
  type TxRow = {
    kind: 'invoice' | 'order'
    id: string
    doc_number: string
    date: string
    total: number
    item_count: number
    status_label: 'Invoiced' | 'Ordered'
  }

  const unified: TxRow[] = []

  for (const inv of invoices ?? []) {
    const items = Array.isArray(inv.line_items) ? inv.line_items as CartItem[] : []
    unified.push({
      kind: 'invoice',
      id: inv.zoho_invoice_id,
      doc_number: inv.invoice_number,
      date: inv.date ?? '',
      total: inv.total,
      item_count: items.reduce((s, i) => s + i.quantity, 0),
      status_label: 'Invoiced',
    })
  }

  for (const ord of orders ?? []) {
    const rawEst = ord.estimates as unknown
    const estimateNumber =
      (Array.isArray(rawEst) ? rawEst[0] : rawEst)?.estimate_number ?? null
    // Skip this order if an invoice already covers it via the estimate chain
    if (estimateNumber && coveredByInvoice.has(estimateNumber)) continue

    const items = Array.isArray(ord.line_items) ? ord.line_items as CartItem[] : []
    unified.push({
      kind: 'order',
      id: ord.public_id as string,
      doc_number: ord.salesorder_number,
      date: ord.date ?? (ord.created_at ? ord.created_at.slice(0, 10) : ''),
      total: ord.total,
      item_count: items.reduce((s, i) => s + i.quantity, 0),
      status_label: 'Ordered',
    })
  }

  // Sort unified list by date descending
  unified.sort((a, b) => b.date.localeCompare(a.date))

  const page = unified.slice(offset, offset + LIST_LIMIT)
  const has_more = offset + LIST_LIMIT < unified.length

  // NOTE: The deduplication above relies on an exact string match between
  // invoices.estimate_number and estimates.estimate_number (both from Zoho).
  // Task 14 smoke test MUST verify that a converted estimate does NOT appear
  // as both an Invoice card and an Order card in the list.
  // If duplicates appear, add .trim().toLowerCase() normalisation on both sides.

  return NextResponse.json({
    items: page,
    has_more,
    next_offset: offset + LIST_LIMIT,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/api/orders/route.ts && git commit -m "feat(orders): unified invoice+order list with deduplication and pagination"
```

---

### Task 3: New `GET /api/orders/[id]` — transaction detail

**Files:**
- Create: `app/src/app/api/orders/[id]/route.ts`

Accepts `?kind=invoice|order`. Returns full line items.

- [ ] **Step 1: Create `app/src/app/api/orders/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { CartItem } from '@/types/catalog'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const kind = searchParams.get('kind') ?? 'order'

  const supabase = createServiceClient()

  if (kind === 'invoice') {
    const { data, error } = await supabase
      .from('invoices')
      .select('zoho_invoice_id, invoice_number, date, subtotal, tax_total, total, line_items')
      .eq('zoho_invoice_id', id)
      .eq('zoho_contact_id', session.zoho_contact_id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = Array.isArray(data.line_items) ? data.line_items as CartItem[] : []
    return NextResponse.json({
      kind: 'invoice',
      id: data.zoho_invoice_id,
      doc_number: data.invoice_number,
      date: data.date ?? '',
      total: data.total,
      subtotal: data.subtotal,
      tax_total: data.tax_total,
      line_items: items.map(i => ({
        zoho_item_id: i.zoho_item_id,
        item_name: i.item_name,
        sku: i.sku,
        quantity: i.quantity,
        rate: i.rate,
        tax_percentage: i.tax_percentage,
        line_total: i.line_total,
        image_url: i.image_url ?? null,
      })),
    })
  }

  // kind === 'order'
  const { data, error } = await supabase
    .from('sales_orders')
    .select('public_id, salesorder_number, date, created_at, subtotal, tax_total, total, line_items')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const items = Array.isArray(data.line_items) ? data.line_items as CartItem[] : []
  return NextResponse.json({
    kind: 'order',
    id: data.public_id,
    doc_number: data.salesorder_number,
    date: data.date ?? data.created_at?.slice(0, 10) ?? '',
    total: data.total,
    subtotal: data.subtotal,
    tax_total: data.tax_total,
    line_items: items.map(i => ({
      zoho_item_id: i.zoho_item_id,
      item_name: i.item_name,
      sku: i.sku,
      quantity: i.quantity,
      rate: i.rate,
      tax_percentage: i.tax_percentage,
      line_total: i.line_total,
      image_url: i.image_url ?? null,
    })),
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/api/orders/[id]/route.ts && git commit -m "feat(orders): transaction detail API for invoices and sales orders"
```

---

### Task 4: New `GET /api/enquiries` — customer enquiries list

**Files:**
- Create: `app/src/app/api/enquiries/route.ts`

**Status computation:**
- `Converted` — `converted_to_salesorder_id IS NOT NULL` OR `status = 'accepted'`
- `Expired` — date older than 30 days AND not converted
- `Pending` — everything else

- [ ] **Step 1: Create `app/src/app/api/enquiries/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { CartItem, EnquiryStatus } from '@/types/catalog'

const LIST_LIMIT = 20
const EXPIRY_DAYS = 30

function computeStatus(row: {
  status: string
  converted_to_salesorder_id: number | null
  date: string | null
  created_at: string | null
}): EnquiryStatus {
  if (row.converted_to_salesorder_id !== null || row.status === 'accepted') {
    return 'Converted'
  }
  const docDate = row.date ?? row.created_at
  if (docDate) {
    const ageMs = Date.now() - new Date(docDate).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays > EXPIRY_DAYS) return 'Expired'
  }
  return 'Pending'
}

export async function GET(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('estimates')
    .select('public_id, estimate_number, date, created_at, total, line_items, status, converted_to_salesorder_id')
    .eq('zoho_contact_id', session.zoho_contact_id)
    .order('date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + LIST_LIMIT)

  if (error) {
    console.error('[enquiries] fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch enquiries' }, { status: 500 })
  }

  const rows = data ?? []
  const items = rows.slice(0, LIST_LIMIT).map((row) => {
    const lineItems = Array.isArray(row.line_items) ? row.line_items as CartItem[] : []
    return {
      id: row.public_id as string,
      doc_number: row.estimate_number,
      date: row.date ?? row.created_at?.slice(0, 10) ?? '',
      total: row.total,
      item_count: lineItems.reduce((s, i) => s + i.quantity, 0),
      status: computeStatus(row),
    }
  })

  return NextResponse.json({
    items,
    has_more: rows.length > LIST_LIMIT,
    next_offset: offset + LIST_LIMIT,
  })
}
```

Note: Supabase `.range(from, to)` is **inclusive on both ends**, so `.range(offset, offset + LIST_LIMIT)` returns rows at indices `offset` through `offset + LIST_LIMIT` inclusive — that is **`LIST_LIMIT + 1` rows** (e.g. indices 0–20 = 21 rows when `LIST_LIMIT=20`). This is intentional: the extra row lets us set `has_more = rows.length > LIST_LIMIT` without a separate count query, and `rows.slice(0, LIST_LIMIT)` trims it back to 20 for the response. Do NOT change this to `range(offset, offset + LIST_LIMIT - 1)` — that would break `has_more` detection.

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/api/enquiries/route.ts && git commit -m "feat(enquiries): customer-facing enquiries list API with status computation"
```

---

### Task 5: New `GET /api/enquiries/[id]` — enquiry detail with availability

**Files:**
- Create: `app/src/app/api/enquiries/[id]/route.ts`

Returns the estimate's line items with current stock status cross-referenced from the `items` table.

- [ ] **Step 1: Create `app/src/app/api/enquiries/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { CartItem, EnquiryStatus } from '@/types/catalog'

const EXPIRY_DAYS = 30

function computeStatus(row: {
  status: string
  converted_to_salesorder_id: number | null
  date: string | null
  created_at: string | null
}): EnquiryStatus {
  if (row.converted_to_salesorder_id !== null || row.status === 'accepted') return 'Converted'
  const docDate = row.date ?? row.created_at
  if (docDate) {
    const ageDays = (Date.now() - new Date(docDate).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > EXPIRY_DAYS) return 'Expired'
  }
  return 'Pending'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session
  try {
    session = await requireSession(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 403 })
    }
    throw err
  }

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('estimates')
    .select('public_id, estimate_number, date, created_at, subtotal, tax_total, total, line_items, status, converted_to_salesorder_id')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to fetch enquiry' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lineItems = Array.isArray(data.line_items) ? data.line_items as CartItem[] : []
  const itemIds = lineItems.map(i => i.zoho_item_id).filter(Boolean)

  // Fetch current stock status for all items in this estimate
  const { data: catalog } = await supabase
    .from('items')
    .select('zoho_item_id, available_stock, image_urls')
    .in('zoho_item_id', itemIds)

  const stockMap = new Map<string, { available_stock: number; image_url: string | null }>()
  for (const item of catalog ?? []) {
    const images = Array.isArray(item.image_urls) ? item.image_urls : []
    stockMap.set(item.zoho_item_id, {
      available_stock: item.available_stock ?? 0,
      image_url: (images[0] as string | undefined) ?? null,
    })
  }

  const enrichedItems = lineItems.map(i => {
    const stock = stockMap.get(i.zoho_item_id)
    const availableStock = stock?.available_stock ?? null
    let stock_status: 'available' | 'limited' | 'out_of_stock' | 'unknown' = 'unknown'
    if (availableStock !== null) {
      if (availableStock <= 0) stock_status = 'out_of_stock'
      else if (availableStock < 10) stock_status = 'limited'
      else stock_status = 'available'
    }
    return {
      zoho_item_id: i.zoho_item_id,
      item_name: i.item_name,
      sku: i.sku,
      quantity: i.quantity,
      rate: i.rate,
      tax_percentage: i.tax_percentage,
      line_total: i.line_total,
      image_url: stock?.image_url ?? i.image_url ?? null,
      available_stock: availableStock,
      stock_status,
    }
  })

  return NextResponse.json({
    id: data.public_id,
    doc_number: data.estimate_number,
    date: data.date ?? data.created_at?.slice(0, 10) ?? '',
    total: data.total,
    subtotal: data.subtotal,
    tax_total: data.tax_total,
    status: computeStatus(data),
    estimate_id: data.public_id,
    line_items: enrichedItems,
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/api/enquiries/[id]/route.ts && git commit -m "feat(enquiries): enquiry detail API with stock availability enrichment"
```

---

## Chunk 2: UI Components

### Task 6: Shared `LineItemRow` component

**Files:**
- Create: `app/src/components/orders/LineItemRow.tsx`

Renders a single line item with image, name, quantity × price, line total, and an optional "Add to Cart" button. Used in both TransactionDetail and EnquiryDetail.

- [ ] **Step 1: Create `app/src/components/orders/LineItemRow.tsx`**

```tsx
'use client'

import { useCart } from '@/components/cart/CartContext'

export interface LineItem {
  zoho_item_id: string
  item_name: string
  sku: string
  quantity: number
  rate: number
  tax_percentage: number
  line_total: number
  image_url: string | null
  /** Only present for enquiry items */
  stock_status?: 'available' | 'limited' | 'out_of_stock' | 'unknown'
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function LineItemRow({ item }: { item: LineItem }) {
  const { addItem } = useCart()

  function handleAddToCart() {
    addItem({
      zoho_item_id: item.zoho_item_id,
      item_name: item.item_name,
      sku: item.sku,
      quantity: item.quantity,
      rate: item.rate,
      tax_percentage: 18,
      line_total: item.quantity * item.rate,
      image_url: item.image_url,
    })
  }

  const unavailable = item.stock_status === 'out_of_stock'
  const limited = item.stock_status === 'limited'

  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
      {/* Product image */}
      <div style={{
        width: 56, height: 56, borderRadius: 8, background: '#F9FAFB',
        flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.item_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 20 }}>🍷</span>
        }
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: unavailable ? '#9CA3AF' : '#1A1A2E', marginBottom: 2, lineClamp: 2 }}>
          {item.item_name}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>{item.sku}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {item.quantity} × {fmt(item.rate)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{fmt(item.line_total)}</span>
        </div>
        {limited && (
          <div style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>Low stock</div>
        )}
        {unavailable && (
          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>Unavailable</div>
        )}
      </div>

      {/* Add to Cart */}
      <button
        onClick={handleAddToCart}
        disabled={unavailable}
        style={{
          flexShrink: 0, alignSelf: 'center',
          padding: '6px 10px', borderRadius: 8,
          border: '1px solid #059669', background: 'transparent',
          color: unavailable ? '#9CA3AF' : '#059669',
          borderColor: unavailable ? '#D1D5DB' : '#059669',
          fontSize: 12, fontWeight: 600, cursor: unavailable ? 'not-allowed' : 'pointer',
        }}
        title={unavailable ? 'Item unavailable' : 'Add to cart'}
      >
        + Cart
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/components/orders/LineItemRow.tsx && git commit -m "feat(orders): LineItemRow component with per-item Add to Cart"
```

---

### Task 7: `TransactionCard` component

**Files:**
- Create: `app/src/components/orders/TransactionCard.tsx`

- [ ] **Step 1: Create `app/src/components/orders/TransactionCard.tsx`**

```tsx
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { TransactionListItem } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TransactionCard({ item }: { item: TransactionListItem }) {
  const href =
    item.kind === 'invoice'
      ? `/catalog/orders/invoice/${encodeURIComponent(item.id)}`
      : `/catalog/orders/order/${encodeURIComponent(item.id)}`

  const chipStyle: CSSProperties =
    item.status_label === 'Invoiced'
      ? { background: '#DBEAFE', color: '#1E40AF' }
      : { background: '#D1FAE5', color: '#065F46' }

  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ background: '#FFFFFF', padding: '14px 16px', marginBottom: 8 }}>
        {/* Row 1: doc number + status chip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{item.doc_number}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, ...chipStyle }}>
            {item.status_label}
          </span>
        </div>
        {/* Row 2: item count + date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {item.item_count} item{item.item_count !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(item.date)}</span>
        </div>
        {/* Row 3: total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmt(item.total)}</span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/components/orders/TransactionCard.tsx && git commit -m "feat(orders): TransactionCard component"
```

---

### Task 8: `EnquiryCard` component

**Files:**
- Create: `app/src/components/orders/EnquiryCard.tsx`

- [ ] **Step 1: Create `app/src/components/orders/EnquiryCard.tsx`**

```tsx
import Link from 'next/link'
import type { EnquiryListItem } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Pending:   { bg: '#FEF9C3', color: '#92400E' },
  Converted: { bg: '#D1FAE5', color: '#065F46' },
  Expired:   { bg: '#F3F4F6', color: '#6B7280' },
}

export function EnquiryCard({ item }: { item: EnquiryListItem }) {
  const chip = STATUS_STYLES[item.status] ?? STATUS_STYLES.Pending

  return (
    <Link href={`/catalog/orders/enquiry/${encodeURIComponent(item.id)}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ background: '#FFFFFF', padding: '14px 16px', marginBottom: 8 }}>
        {/* Row 1: doc number + status chip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{item.doc_number}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: chip.bg, color: chip.color }}>
            {item.status}
          </span>
        </div>
        {/* Row 2: item count + date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {item.item_count} item{item.item_count !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(item.date)}</span>
        </div>
        {/* Row 3: total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmt(item.total)}</span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/components/orders/EnquiryCard.tsx && git commit -m "feat(orders): EnquiryCard component with Pending/Converted/Expired status chip"
```

---

### Task 9: `OrdersTab` — infinite-scroll orders list

**Files:**
- Create: `app/src/components/orders/OrdersTab.tsx`

Uses IntersectionObserver to trigger "load more" when the user scrolls near the bottom sentinel element.

- [ ] **Step 1: Create `app/src/components/orders/OrdersTab.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { TransactionCard } from './TransactionCard'
import type { TransactionListItem } from '@/types/catalog'

const LIMIT = 20

export function OrdersTab() {
  const [items, setItems]     = useState<TransactionListItem[]>([])
  const [offset, setOffset]   = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [initialDone, setInitialDone] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPage = useCallback(async (pageOffset: number) => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/orders?offset=${pageOffset}&limit=${LIMIT}`)
      if (res.status === 403) throw new Error('Please log in to view your orders.')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(prev => pageOffset === 0 ? data.items : [...prev, ...data.items])
      setHasMore(data.has_more)
      setOffset(data.next_offset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
      setInitialDone(true)
    }
  }, [loading])

  // Initial load
  useEffect(() => { fetchPage(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loading) fetchPage(offset) },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, offset, fetchPage])

  if (!initialDone) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={<ClipboardList size={48} color="#D1D5DB" strokeWidth={1.5} />} message={error} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList size={48} color="#D1D5DB" strokeWidth={1.5} />}
        title="No transactions yet"
        message="Your invoices and orders will appear here."
      />
    )
  }

  return (
    <div>
      <div style={{ padding: '8px 0' }}>
        {items.map(item => <TransactionCard key={`${item.kind}-${item.id}`} item={item} />)}
      </div>
      {/* Scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Spinner />
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', padding: '12px 0 24px' }}>
          All caught up
        </p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <>
      <span style={{ width: 22, height: 22, border: '3px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function EmptyState({ icon, title, message }: { icon: ReactNode; title?: string; message: string }) {
  return (
    <div style={{ padding: '60px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {icon}
      {title && <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E', margin: '16px 0 6px' }}>{title}</p>}
      <p style={{ fontSize: 13, color: '#9CA3AF', margin: title ? 0 : '16px 0 0' }}>{message}</p>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/components/orders/OrdersTab.tsx && git commit -m "feat(orders): OrdersTab with IntersectionObserver infinite scroll"
```

---

### Task 10: `EnquiriesTab` — infinite-scroll enquiries list

**Files:**
- Create: `app/src/components/orders/EnquiriesTab.tsx`

Same IntersectionObserver pattern as OrdersTab.

- [ ] **Step 1: Create `app/src/components/orders/EnquiriesTab.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { EnquiryCard } from './EnquiryCard'
import type { EnquiryListItem } from '@/types/catalog'

const LIMIT = 20

export function EnquiriesTab() {
  const [items, setItems]     = useState<EnquiryListItem[]>([])
  const [offset, setOffset]   = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [initialDone, setInitialDone] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPage = useCallback(async (pageOffset: number) => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/enquiries?offset=${pageOffset}&limit=${LIMIT}`)
      if (res.status === 403) throw new Error('Please log in to view your enquiries.')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(prev => pageOffset === 0 ? data.items : [...prev, ...data.items])
      setHasMore(data.has_more)
      setOffset(data.next_offset)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load enquiries')
    } finally {
      setLoading(false)
      setInitialDone(true)
    }
  }, [loading])

  useEffect(() => { fetchPage(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasMore) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loading) fetchPage(offset) },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, offset, fetchPage])

  if (!initialDone) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner />
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={<FileText size={48} color="#D1D5DB" strokeWidth={1.5} />} message={error} />
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={48} color="#D1D5DB" strokeWidth={1.5} />}
        title="No enquiries yet"
        message="Your quotes and enquiries will appear here."
      />
    )
  }

  return (
    <div>
      <div style={{ padding: '8px 0' }}>
        {items.map(item => <EnquiryCard key={item.id} item={item} />)}
      </div>
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Spinner />
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', padding: '12px 0 24px' }}>
          All caught up
        </p>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <>
      <span style={{ width: 22, height: 22, border: '3px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function EmptyState({ icon, title, message }: { icon: ReactNode; title?: string; message: string }) {
  return (
    <div style={{ padding: '60px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {icon}
      {title && <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E', margin: '16px 0 6px' }}>{title}</p>}
      <p style={{ fontSize: 13, color: '#9CA3AF', margin: title ? 0 : '16px 0 0' }}>{message}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/components/orders/EnquiriesTab.tsx && git commit -m "feat(orders): EnquiriesTab with infinite scroll"
```

---

## Chunk 3: Pages

### Task 11: Update `orders/page.tsx` — tabbed layout

**Files:**
- Modify: `app/src/app/catalog/orders/page.tsx`

Replace the entire file with the tabbed layout. Tab state is stored in the URL `?tab=orders|enquiries` so the back button preserves the active tab.

- [ ] **Step 1: Replace `app/src/app/catalog/orders/page.tsx`**

```tsx
'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { OrdersTab } from '@/components/orders/OrdersTab'
import { EnquiriesTab } from '@/components/orders/EnquiriesTab'

type Tab = 'orders' | 'enquiries'

function TabContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab: Tab = (searchParams.get('tab') as Tab) ?? 'orders'

  function setTab(tab: Tab) {
    router.push(`/catalog/orders?tab=${tab}`, { scroll: false })
  }

  return (
    <main style={{ paddingBottom: 100 }}>
      {/* Page header */}
      <div style={{
        padding: '20px 16px 0',
        background: '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#1A1A2E' }}>My Orders</h1>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {(['orders', 'enquiries'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #059669' : '2px solid transparent',
                fontSize: 14,
                fontWeight: activeTab === tab ? 700 : 400,
                color: activeTab === tab ? '#059669' : '#6B7280',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'orders' ? 'Orders' : 'Enquiries'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'orders' ? <OrdersTab /> : <EnquiriesTab />}
    </main>
  )
}

export default function OrdersPage() {
  return (
    <Suspense>
      <TabContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/catalog/orders/page.tsx && git commit -m "feat(orders): tabbed Orders/Enquiries layout with URL-based tab state"
```

---

### Task 12: Transaction detail page — Orders and Invoices

**Files:**
- Create: `app/src/app/catalog/orders/[type]/[id]/page.tsx`

Handles `type = 'order' | 'invoice'`. Shows line items with LineItemRow, "Reorder Entire Order" CTA, and a confirmation dialog when the cart is non-empty.

**Routing note:** The folder `catalog/orders/[type]/[id]` uses a dynamic segment `[type]`. A separate folder `catalog/orders/enquiry/[id]` uses the literal segment `enquiry`. In Next.js App Router, **static (literal) segments always take priority over dynamic segments at the same depth**, so a request for `/catalog/orders/enquiry/some-uuid` will always route to `enquiry/[id]/page.tsx` and will NOT be captured by `[type]/[id]/page.tsx`. These two routes do NOT conflict — do not restructure them.

- [ ] **Step 1: Create directory and file `app/src/app/catalog/orders/[type]/[id]/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import { useCart } from '@/components/cart/CartContext'
import { LineItemRow } from '@/components/orders/LineItemRow'
import type { TransactionDetail } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TransactionDetailPage() {
  const router = useRouter()
  const params = useParams() as { type: string; id: string }
  const { items: cartItems, loadItems } = useCart()

  const [data, setData]           = useState<TransactionDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const kind = params.type === 'invoice' ? 'invoice' : 'order'

  useEffect(() => {
    fetch(`/api/orders/${encodeURIComponent(params.id)}?kind=${kind}`)
      .then(r => {
        if (r.status === 403) throw new Error('Please log in.')
        if (r.status === 404) throw new Error('Transaction not found.')
        return r.json()
      })
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [params.id, kind])

  function handleReorder() {
    if (cartItems.length > 0) {
      setShowConfirm(true)
    } else {
      doReorder()
    }
  }

  function doReorder() {
    if (!data) return
    loadItems(data.line_items.map(i => ({
      zoho_item_id: i.zoho_item_id,
      item_name: i.item_name,
      sku: i.sku,
      quantity: i.quantity,
      rate: i.rate,
      tax_percentage: 18,
      line_total: i.quantity * i.rate,
      image_url: i.image_url,
    })))
    router.push('/cart')
  }

  if (loading) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </main>
    )
  }

  if (error || !data) {
    return (
      <main style={{ padding: '20px 16px', textAlign: 'center' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>{error ?? 'Something went wrong.'}</p>
        <button onClick={() => router.back()} style={{ marginTop: 12, color: '#059669', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer' }}>
          ← Go back
        </button>
      </main>
    )
  }

  return (
    <main style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px', background: '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ArrowLeft size={20} color="#1A1A2E" />
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E' }}>{data.doc_number}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(data.date)}</div>
        </div>
      </div>

      {/* Line items */}
      <div style={{ padding: '0 16px', background: '#FFFFFF' }}>
        {data.line_items.map(item => (
          <LineItemRow key={item.zoho_item_id} item={item} />
        ))}
      </div>

      {/* Totals */}
      <div style={{ margin: '8px 0', background: '#FFFFFF', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>Subtotal</span>
          <span style={{ fontSize: 13, color: '#1A1A2E' }}>{fmt(data.subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>GST (18%)</span>
          <span style={{ fontSize: 13, color: '#1A1A2E' }}>{fmt(data.tax_total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmt(data.total)}</span>
        </div>
      </div>

      {/* Reorder CTA — sticky bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#FFFFFF', borderTop: '1px solid #F3F4F6',
        padding: '12px 16px', zIndex: 20,
      }}>
        <button
          onClick={handleReorder}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12,
            background: '#059669', border: 'none', color: '#FFFFFF',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <ShoppingCart size={18} />
          Reorder Entire Order
        </button>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <ConfirmDialog
          message={`Your cart has ${cartItems.length} item${cartItems.length !== 1 ? 's' : ''}. Replace with this order?`}
          onConfirm={() => { setShowConfirm(false); doReorder() }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </main>
  )
}

function Spinner() {
  return (
    <>
      <span style={{ width: 24, height: 24, border: '3px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: 24 }}>
        <p style={{ fontSize: 15, color: '#1A1A2E', fontWeight: 600, margin: '0 0 8px' }}>Replace cart?</p>
        <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px' }}>{message}</p>
        <button onClick={onConfirm} style={{ width: '100%', padding: 14, borderRadius: 12, background: '#059669', border: 'none', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
          Yes, replace cart
        </button>
        <button onClick={onCancel} style={{ width: '100%', padding: 14, borderRadius: 12, background: 'transparent', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 15, cursor: 'pointer' }}>
          Keep current cart
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/catalog/orders/[type]/[id]/page.tsx && git commit -m "feat(orders): transaction detail page with Reorder CTA and cart confirmation"
```

---

### Task 13: Enquiry detail page

**Files:**
- Create: `app/src/app/catalog/orders/enquiry/[id]/page.tsx`

Shows estimate line items with availability flags, "Place Order" CTA (Pending/Expired) or "Reorder" CTA (Converted).

- [ ] **Step 1: Create `app/src/app/catalog/orders/enquiry/[id]/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, ShoppingCart, FileText } from 'lucide-react'
import { useCart } from '@/components/cart/CartContext'
import { LineItemRow } from '@/components/orders/LineItemRow'
import type { EnquiryDetail } from '@/types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Pending:   { bg: '#FEF9C3', color: '#92400E' },
  Converted: { bg: '#D1FAE5', color: '#065F46' },
  Expired:   { bg: '#F3F4F6', color: '#6B7280' },
}

export default function EnquiryDetailPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const { items: cartItems, loadItems } = useCart()

  const [data, setData]           = useState<EnquiryDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    fetch(`/api/enquiries/${encodeURIComponent(id)}`)
      .then(r => {
        if (r.status === 403) throw new Error('Please log in.')
        if (r.status === 404) throw new Error('Enquiry not found.')
        return r.json()
      })
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  function handleCTA() {
    if (!data) return
    if (data.status === 'Converted') {
      // Reorder: load available items into cart
      const availableItems = data.line_items.filter(i => i.stock_status !== 'out_of_stock')
      if (cartItems.length > 0) {
        setShowConfirm(true)
      } else {
        doLoadCart(availableItems)
      }
    } else {
      // Place Order / Pending / Expired: go to cart pre-populated with estimate
      router.push(`/cart?estimate_id=${encodeURIComponent(data.estimate_id)}`)
    }
  }

  function doLoadCart(items: EnquiryDetail['line_items']) {
    loadItems(items.map(i => ({
      zoho_item_id: i.zoho_item_id,
      item_name: i.item_name,
      sku: i.sku,
      quantity: i.quantity,
      rate: i.rate,
      tax_percentage: 18,
      line_total: i.quantity * i.rate,
      image_url: i.image_url,
    })))
    router.push('/cart')
  }

  if (loading) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spinner />
      </main>
    )
  }

  if (error || !data) {
    return (
      <main style={{ padding: '20px 16px', textAlign: 'center' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>{error ?? 'Something went wrong.'}</p>
        <button onClick={() => router.back()} style={{ marginTop: 12, color: '#059669', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer' }}>
          ← Go back
        </button>
      </main>
    )
  }

  const chip = STATUS_STYLES[data.status]
  const unavailableCount = data.line_items.filter(i => i.stock_status === 'out_of_stock').length
  const isConverted = data.status === 'Converted'
  const ctaLabel = isConverted ? 'Reorder' : 'Place Order'

  return (
    <main style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px', background: '#FFFFFF',
        borderBottom: '1px solid #F3F4F6',
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ArrowLeft size={20} color="#1A1A2E" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E' }}>{data.doc_number}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: chip.bg, color: chip.color }}>
              {data.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(data.date)}</div>
        </div>
      </div>

      {/* Availability warning */}
      {unavailableCount > 0 && (
        <div style={{ margin: '8px 16px', padding: '10px 14px', background: '#FEF3C7', borderRadius: 8, fontSize: 13, color: '#92400E' }}>
          {unavailableCount} item{unavailableCount !== 1 ? 's are' : ' is'} currently unavailable and will be skipped.
        </div>
      )}

      {/* Line items */}
      <div style={{ padding: '0 16px', background: '#FFFFFF' }}>
        {data.line_items.map(item => (
          <LineItemRow key={item.zoho_item_id} item={item} />
        ))}
      </div>

      {/* Totals */}
      <div style={{ margin: '8px 0', background: '#FFFFFF', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>Subtotal</span>
          <span style={{ fontSize: 13, color: '#1A1A2E' }}>{fmt(data.subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#6B7280' }}>GST (18%)</span>
          <span style={{ fontSize: 13, color: '#1A1A2E' }}>{fmt(data.tax_total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{fmt(data.total)}</span>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#FFFFFF', borderTop: '1px solid #F3F4F6',
        padding: '12px 16px', zIndex: 20,
      }}>
        <button
          onClick={handleCTA}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12,
            background: '#059669', border: 'none', color: '#FFFFFF',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {isConverted ? <ShoppingCart size={18} /> : <FileText size={18} />}
          {ctaLabel}
        </button>
      </div>

      {/* Confirm dialog for Reorder when cart is non-empty */}
      {showConfirm && data && (
        <ConfirmDialog
          message={`Your cart has ${cartItems.length} item${cartItems.length !== 1 ? 's' : ''}. Replace with available items from this enquiry?`}
          onConfirm={() => {
            setShowConfirm(false)
            doLoadCart(data.line_items.filter(i => i.stock_status !== 'out_of_stock'))
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </main>
  )
}

function Spinner() {
  return (
    <>
      <span style={{ width: 24, height: 24, border: '3px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: 24 }}>
        <p style={{ fontSize: 15, color: '#1A1A2E', fontWeight: 600, margin: '0 0 8px' }}>Replace cart?</p>
        <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px' }}>{message}</p>
        <button onClick={onConfirm} style={{ width: '100%', padding: 14, borderRadius: 12, background: '#059669', border: 'none', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
          Yes, replace cart
        </button>
        <button onClick={onCancel} style={{ width: '100%', padding: 14, borderRadius: 12, background: 'transparent', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 15, cursor: 'pointer' }}>
          Keep current cart
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add app/src/app/catalog/orders/enquiry/[id]/page.tsx && git commit -m "feat(enquiries): enquiry detail page with Place Order / Reorder CTA"
```

---

## Chunk 4: Wiring and validation

### Task 14: Dev server smoke test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/app && npm run dev
```

Expected: server starts on port 3000 (or 3001) with no fatal errors.

- [ ] **Step 2: Navigate to `/catalog/orders` and verify**

Check:
- Two tabs render: "Orders" and "Enquiries"
- Orders tab loads and shows transaction cards (or empty state if no data)
- Clicking Enquiries tab loads enquiry cards
- Tab switching works with URL change (`?tab=orders` / `?tab=enquiries`)

- [ ] **Step 3: Verify detail navigation**

Check:
- Clicking a TransactionCard navigates to `/catalog/orders/order/[id]` or `/catalog/orders/invoice/[id]`
- Back button returns to the list tab
- "Reorder Entire Order" button works; shows confirm dialog if cart non-empty

- [ ] **Step 4: Verify enquiry detail**

Check:
- Clicking an EnquiryCard navigates to `/catalog/orders/enquiry/[id]`
- Line items show with availability indicators
- CTA shows "Place Order" for Pending/Expired, "Reorder" for Converted

- [ ] **Step 5: Final commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog && git add -A && git commit -m "chore: final wiring — orders/enquiries tabbed screens complete"
```

---

## Summary of files created/modified

| Action | Path |
|--------|------|
| Modify | `types/catalog.ts` |
| Modify | `app/src/app/api/orders/route.ts` (GET handler replaced) |
| Create | `app/src/app/api/orders/[id]/route.ts` |
| Create | `app/src/app/api/enquiries/route.ts` |
| Create | `app/src/app/api/enquiries/[id]/route.ts` |
| Modify | `app/src/app/catalog/orders/page.tsx` |
| Create | `app/src/app/catalog/orders/[type]/[id]/page.tsx` |
| Create | `app/src/app/catalog/orders/enquiry/[id]/page.tsx` |
| Create | `app/src/components/orders/LineItemRow.tsx` |
| Create | `app/src/components/orders/TransactionCard.tsx` |
| Create | `app/src/components/orders/EnquiryCard.tsx` |
| Create | `app/src/components/orders/OrdersTab.tsx` |
| Create | `app/src/components/orders/EnquiriesTab.tsx` |
