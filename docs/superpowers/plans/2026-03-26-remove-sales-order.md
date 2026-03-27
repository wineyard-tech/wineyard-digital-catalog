# Remove Sales Order Functionality — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive all Sales Order creation paths from the buyer-facing UI; show only Invoices in the Orders tab; unify Estimate Detail to a single "Reorder" CTA for all statuses.

**Architecture:** Comment-out archival with `/* PHASE2_SO_ARCHIVE_START */` ... `/* PHASE2_SO_ARCHIVE_END */` delimiters. No schema, Zoho, or WhatsApp template changes. Frontend filter hides historical `kind: 'order'` rows returned by the unchanged GET API.

**Tech Stack:** Next.js 16 App Router, TypeScript, React, Supabase (service client)

---

## Chunk 1: List + Detail pages (Tasks 1–5)

### Task 1: Rename "Orders" tab label to "Invoices"

**Files:**
- Modify: `app/src/app/catalog/orders/page.tsx:38`

Note: The page `<h1>` on line 31 reads `My Orders` — this is the page heading and is **intentionally left unchanged**. Only the tab button label changes.

- [ ] **Edit line 38** — change only the label string, keep `tab === 'orders'` key and all router logic intact:

```tsx
// Before (line 38):
const label = tab === 'orders' ? 'Orders' : 'Enquiries'

// After:
const label = tab === 'orders' ? 'Invoices' : 'Enquiries'
```

- [ ] **Verify** `?tab=orders` URL param, `type Tab = 'orders' | 'enquiries'`, and `setTab` are all unchanged.

- [ ] **Commit:**
```bash
git add app/src/app/catalog/orders/page.tsx
git commit -m "feat: rename Orders tab label to Invoices"
```

---

### Task 2: Filter OrdersTab to invoices-only + update copy

**Files:**
- Modify: `app/src/components/orders/OrdersTab.tsx:56,111-113,134`

- [ ] **Edit line 56** — add `.filter` immediately after building the items array inside `setItems`:

```tsx
// Before (line 56):
setItems((prev) => pageOffset === 0 ? data.items : [...prev, ...data.items])

// After:
setItems((prev) => {
  const incoming: TransactionListItem[] = pageOffset === 0 ? data.items : [...prev, ...data.items]
  return incoming.filter((i) => i.kind === 'invoice')
})
```

- [ ] **Edit line 108** — guard the empty state: only show "No invoices yet" when there are truly no more pages to load. This prevents a false empty-state when the first API page returns only `kind: 'order'` items (all filtered out) but `has_more` is still `true`:

```tsx
// Before (line 108):
if (initialDone && items.length === 0) {

// After:
if (initialDone && items.length === 0 && !hasMore) {
```

The `IntersectionObserver` sentinel is at the top of an empty list and will be visible, auto-triggering the next page load. This handles the edge case correctly.

- [ ] **Edit lines 111–113** — update empty-state copy:

```tsx
// Before:
<p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E', margin: '0 0 6px' }}>No orders yet</p>
<p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Your placed orders and invoices will appear here.</p>

// After:
<p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E', margin: '0 0 6px' }}>No invoices yet</p>
<p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Your invoices will appear here.</p>
```

- [ ] **Edit line 134** — update end-of-list message:

```tsx
// Before:
All transactions loaded

// After:
All invoices loaded
```

- [ ] **Commit:**
```bash
git add app/src/components/orders/OrdersTab.tsx
git commit -m "feat: filter OrdersTab to invoices only, update copy"
```

---

### Task 3: Archive SO routing + chip in TransactionCard

**Files:**
- Modify: `app/src/components/orders/TransactionCard.tsx:16-19,24-27`

- [ ] **Edit lines 16–19 and line 29** — narrow `chipStyle` type to `'Invoiced'` only, archive `Ordered` entry, and hardcode the chip lookup:

`TransactionListItem.status_label` is typed `'Invoiced' | 'Ordered'` in `catalog.ts:94`. Keeping the Record keyed on both values but archiving `Ordered`'s entry would cause a TS compile error at `chipStyle[item.status_label]`. Fix: narrow the Record type to `'Invoiced'` only and hardcode the lookup since only invoice items are rendered after the filter in OrdersTab.

```tsx
// Before (lines 16–19):
const chipStyle: Record<'Invoiced' | 'Ordered', CSSProperties> = {
  Invoiced: { background: '#DBEAFE', color: '#1E40AF' },
  Ordered:  { background: '#D1FAE5', color: '#065F46' },
}
// ...
const chip = chipStyle[item.status_label]  // line 29

// After:
const chipStyle: Record<'Invoiced', CSSProperties> = {
  Invoiced: { background: '#DBEAFE', color: '#1E40AF' },
  /* PHASE2_SO_ARCHIVE_START
  Ordered:  { background: '#D1FAE5', color: '#065F46' },
  PHASE2_SO_ARCHIVE_END */
}
// ...
const chip = chipStyle['Invoiced']  // line 29 — hardcode; only invoices are rendered
```

- [ ] **Edit lines 24–27** — archive `order` routing branch, hardcode to `invoice`:

```tsx
// Before:
function handleClick() {
  const type = item.kind === 'invoice' ? 'invoice' : 'order'
  router.push(`/catalog/orders/${type}/${item.id}`)
}

// After:
function handleClick() {
  /* PHASE2_SO_ARCHIVE_START
  const type = item.kind === 'invoice' ? 'invoice' : 'order'
  PHASE2_SO_ARCHIVE_END */
  router.push(`/catalog/orders/invoice/${item.id}`)
}
```

- [ ] **Commit:**
```bash
git add app/src/components/orders/TransactionCard.tsx
git commit -m "feat: archive SO routing branch and Ordered chip in TransactionCard"
```

---

### Task 4: Archive `order`-kind in Transaction Detail page

**Files:**
- Modify: `app/src/app/catalog/orders/[type]/[id]/page.tsx:74`

The page has no branch — `kind` is derived from `type` and passed to the API. After hardcoding `kind`, `type` from `use(params)` becomes unused. Remove it from the destructure.

- [ ] **Edit line 65 and line 74** — remove `type` from params destructure and hardcode `kind`:

```tsx
// Before (line 65):
const { type, id } = use(params)
// Before (line 74):
const kind = type === 'invoice' ? 'invoice' : 'order'

// After (line 65):
// PHASE2_SO_ARCHIVE: const { type, id } = use(params) — 'type' removed; only invoice routes active
const { id } = use(params)
// After (line 74):
// PHASE2_SO_ARCHIVE: const kind = type === 'invoice' ? 'invoice' : 'order'
const kind: 'invoice' | 'order' = 'invoice'
```

Note: hardcoding `'invoice'` means the page always fetches invoice data regardless of the URL `[type]` param. The `order` route is unreachable from the app UI after Task 3.

- [ ] **Commit:**
```bash
git add app/src/app/catalog/orders/[type]/[id]/page.tsx
git commit -m "feat: archive order-type path in transaction detail page"
```

---

### Task 5: Archive `order`-kind Supabase branch in detail API route

**Files:**
- Modify: `app/src/app/api/orders/[id]/route.ts:62-93`

The file currently has an `if (kind === 'invoice') { ... }` branch that returns, followed by the unconditional `kind === 'order'` block on lines 63–93. Use `/* PHASE2_SO_ARCHIVE_START */` ... `/* PHASE2_SO_ARCHIVE_END */` delimiters.

- [ ] **Edit lines 62–93** — add a 404 fallback for non-invoice kinds and archive the `sales_orders` fetch block:

```typescript
// Before (after the invoice block ending with `return NextResponse.json(detail)` on line 60):
  }

  // kind === 'order'
  const { data, error } = await supabase
    .from('sales_orders')
    .select('public_id, salesorder_number, date, created_at, total, subtotal, tax_total, line_items')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) {
    console.error('[orders/id] order fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const lineItems = Array.isArray(data.line_items)
    ? (data.line_items as LineItemDetail[])
    : []

  const detail: TransactionDetail = {
    kind: 'order',
    id: data.public_id as string,
    doc_number: data.salesorder_number,
    date: data.date ?? (data.created_at ? data.created_at.slice(0, 10) : ''),
    total: data.total,
    subtotal: data.subtotal ?? 0,
    tax_total: data.tax_total ?? 0,
    line_items: lineItems,
  }
  return NextResponse.json(detail)
}

// After:
  }

  /* PHASE2_SO_ARCHIVE_START
  // kind === 'order'
  const { data, error } = await supabase
    .from('sales_orders')
    .select('public_id, salesorder_number, date, created_at, total, subtotal, tax_total, line_items')
    .eq('public_id', id)
    .eq('zoho_contact_id', session.zoho_contact_id)
    .maybeSingle()

  if (error) {
    console.error('[orders/id] order fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const lineItems = Array.isArray(data.line_items)
    ? (data.line_items as LineItemDetail[])
    : []

  const detail: TransactionDetail = {
    kind: 'order',
    id: data.public_id as string,
    doc_number: data.salesorder_number,
    date: data.date ?? (data.created_at ? data.created_at.slice(0, 10) : ''),
    total: data.total,
    subtotal: data.subtotal ?? 0,
    tax_total: data.tax_total ?? 0,
    line_items: lineItems,
  }
  return NextResponse.json(detail)
  PHASE2_SO_ARCHIVE_END */

  // SO detail routes are not active in Phase 1
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

- [ ] **Commit:**
```bash
git add app/src/app/api/orders/[id]/route.ts
git commit -m "feat: archive sales-order fetch branch in transaction detail API"
```

---

## Chunk 2: Cart, Estimate Detail, and SO creation API (Tasks 6–8)

### Task 6: Archive Place Order from CartPage

**Files:**
- Modify: `app/src/components/cart/CartPage.tsx`

This is the largest change. Work through it in sub-steps.

**6a — Fix import (line 9):**

- [ ] Remove `OrderResponse` from the import, keep `EnquiryResponse` and `CartItem`:

```typescript
// Before:
import type { EnquiryResponse, OrderResponse, CartItem } from '@/types/catalog'

// After:
import type { EnquiryResponse, CartItem } from '@/types/catalog'
```

⚠️ **Important — perform 6b, 6c, and 6f as a single edit pass.** The Place Order `<button>` (archived in 6f) directly references `orderLoading` inline. Archiving state in 6b before removing the button in 6f would leave live JSX referencing an archived variable, causing a TS compile error mid-edit. Apply all three sub-tasks in one file edit.

**6b — Archive `orderLoading` and `orderResult` state (lines 39, 41):**

- [ ] Replace the two state declarations with archive comments:

```typescript
// Before:
const [orderLoading, setOrderLoading] = useState(false)
const [quoteResult, setQuoteResult] = useState<EnquiryResponse | null>(null)
const [orderResult, setOrderResult] = useState<OrderResponse | null>(null)

// After:
// PHASE2_SO_ARCHIVE: const [orderLoading, setOrderLoading] = useState(false)
const [quoteResult, setQuoteResult] = useState<EnquiryResponse | null>(null)
// PHASE2_SO_ARCHIVE: const [orderResult, setOrderResult] = useState<OrderResponse | null>(null)
```

**6c — Archive `handlePlaceOrder` function (lines 127–161):**

- [ ] Wrap the entire function in archive delimiters:

```typescript
/* PHASE2_SO_ARCHIVE_START
  async function handlePlaceOrder() {
    requireAuth(async () => {
      setOrderLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            estimate_id: estimateBanner?.public_id ?? undefined,
          }),
        })
        const data: OrderResponse = await res.json()

        if (!res.ok || (!data.success && !data.duplicate)) {
          throw new Error(data.error ?? 'Failed to place order')
        }

        if (data.duplicate) {
          setError(`Order ${data.salesorder_number} already placed for this cart. Redirecting to your orders...`)
          setTimeout(() => router.push('/catalog/orders'), 2000)
          return
        }

        setOrderResult(data)
        clearCart()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      } finally {
        setOrderLoading(false)
      }
    })
  }
PHASE2_SO_ARCHIVE_END */
```

**6d — Archive Order success screen (lines 193–225):**

- [ ] Wrap the `if (orderResult)` block in archive delimiters:

```typescript
/* PHASE2_SO_ARCHIVE_START
  // ── Order success screen ──────────────────────────────────────────────────
  if (orderResult) {
    return (
      <div style={{ ... }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>Order Placed!</h2>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>{orderResult.salesorder_number}</p>
        {orderResult.sync_pending && ( ... )}
        <p style={{ ... }}>...</p>
        <p style={{ ... }}>...</p>
        <button onClick={() => router.push('/catalog/orders')} ...>View My Orders</button>
        <button onClick={() => router.push('/catalog')} ...>Back to Catalog</button>
      </div>
    )
  }
PHASE2_SO_ARCHIVE_END */
```

(Archive the entire block verbatim from lines 193–225.)

**6e — Simplify `anyLoading` (line 227):**

- [ ] Remove the `orderLoading` reference:

```typescript
// Before:
const anyLoading = loading || orderLoading

// After:
const anyLoading = loading
```

**6f — Archive the Place Order button (lines 382–409) and update auth hint copy:**

- [ ] In the footer, update the auth hint text (line 349–351) to the exact string below:

```tsx
{/* Before: */}
Registration required to request quotes or place orders

{/* After: */}
Registration required to request quotes
```

- [ ] Archive the entire Place Order `<button>` block and the wrapping flex `<div>` if it only contains the two buttons. Since Get Quote should expand to full-width after Place Order is removed, change the wrapping `<div>` from `display: flex` to a single full-width button:

```tsx
// Before (lines 353–409):
<div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
  {/* WhatsApp Quote — outline */}
  <button
    onClick={handleGetQuote}
    disabled={isButtonDisabled}
    ...
    style={{ flex: 1, ... }}
  >
    ...Get Quote
  </button>

  {/* Place Order — filled */}
  <button
    onClick={handlePlaceOrder}
    disabled={isButtonDisabled}
    ...
  >
    ...Place Order →
  </button>
</div>

// After:
<div style={{ marginBottom: 8 }}>
  {/* WhatsApp Quote */}
  <button
    onClick={handleGetQuote}
    disabled={isButtonDisabled}
    title={!authState?.authenticated ? 'Registration Required' : undefined}
    style={{
      width: '100%',
      background: '#FFFFFF',
      color: isButtonDisabled ? '#9CA3AF' : '#059669',
      border: `1.5px solid ${isButtonDisabled ? '#D1D5DB' : '#059669'}`,
      borderRadius: 10,
      padding: '12px 0',
      fontSize: 14,
      fontWeight: 700,
      cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    }}
  >
    {loading
      ? <span style={{ width: 16, height: 16, border: '2px solid #059669', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      : <MessageCircle size={16} />
    }
    {loading ? 'Sending...' : 'Get Quote'}
  </button>
  {/* PHASE2_SO_ARCHIVE_START
  <button
    onClick={handlePlaceOrder}
    disabled={isButtonDisabled}
    title={!authState?.authenticated ? 'Registration Required' : undefined}
    style={{
      flex: 1,
      background: isButtonDisabled ? '#D1D5DB' : '#059669',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 10,
      padding: '12px 0',
      fontSize: 14,
      fontWeight: 700,
      cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    }}
  >
    {orderLoading
      ? <span style={{ width: 16, height: 16, border: '2px solid #FFFFFF', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }} />
      : null
    }
    {orderLoading ? 'Placing...' : 'Place Order →'}
  </button>
  PHASE2_SO_ARCHIVE_END */}
</div>
```

- [ ] **Commit:**
```bash
git add app/src/components/cart/CartPage.tsx
git commit -m "feat: archive Place Order button and SO flow from CartPage"
```

---

### Task 7: Unified "Reorder" CTA on Estimate Detail page

**Files:**
- Modify: `app/src/app/catalog/orders/enquiry/[id]/page.tsx`

**7a — Archive `isConverted` + `ctaLabel` (lines 89, 95) and inline label at JSX site:**

- [ ] Archive `isConverted` and `ctaLabel`. Also replace `{ctaLabel}` at line 251 with the literal `Reorder` — archiving the declaration without updating the JSX reference would cause a TS compile error:

```tsx
// Before (lines 89, 95):
const isConverted = data?.status === 'Converted'
// ...
const ctaLabel = isConverted ? 'Reorder' : 'Place Order'
// ...
{ctaLabel}  {/* line 251 in the button */}

// After:
// PHASE2_SO_ARCHIVE: const isConverted = data?.status === 'Converted'
// PHASE2_SO_ARCHIVE: const ctaLabel = isConverted ? 'Reorder' : 'Place Order'
// ...
{'Reorder'}  {/* line 251 — inlined; ctaLabel declaration archived above */}
```

**7b — Replace `handleCTA` with unified Reorder logic (lines 97–112):**

- [ ] Archive the old `handleCTA` branching and replace with a unified version. **`doReorder` (lines 114–129) is kept completely unchanged** — it remains called by `ConfirmDialog.onConfirm` at line 257:

```tsx
/* PHASE2_SO_ARCHIVE_START
  function handleCTA() {
    if (!data) return

    if (isConverted) {
      // Reorder: load available items into cart, navigate to cart
      if (availableItems.length === 0) return // guard: nothing available
      if (cartItems.length > 0) {
        setShowConfirm(true)
      } else {
        doReorder()
      }
    } else {
      // Pending / Expired: navigate to cart with estimate deep link
      router.push(`/cart?estimate_id=${data.estimate_id}`)
    }
  }
PHASE2_SO_ARCHIVE_END */

function handleCTA() {
  if (!data) return
  if (availableItems.length === 0) return // guard: nothing available
  // Always show confirm dialog before loading items into cart
  setShowConfirm(true)
}

// doReorder (lines 114-129) is unchanged — called by ConfirmDialog.onConfirm
```

**7c — Update "all unavailable" warning (line 196):**

The warning previously only showed for Converted (`allUnavailable && isConverted`). Now it should show for any status when all items are unavailable:

```tsx
// Before:
{allUnavailable && isConverted && (

// After:
{allUnavailable && (
```

**7d — Update CTA button (lines 241–248):**

Remove `isConverted &&` from all three `disabled`/style conditions:

```tsx
// Before:
<button
  onClick={handleCTA}
  disabled={isConverted && allUnavailable}
  style={{
    width: '100%', padding: '14px',
    background: isConverted && allUnavailable ? '#D1D5DB' : '#059669',
    border: 'none', borderRadius: 8,
    fontSize: 15, fontWeight: 700,
    color: isConverted && allUnavailable ? '#6B7280' : '#FFFFFF',
    cursor: isConverted && allUnavailable ? 'not-allowed' : 'pointer',
  }}
>
  {ctaLabel}
</button>

// After:
<button
  onClick={handleCTA}
  disabled={allUnavailable}
  style={{
    width: '100%', padding: '14px',
    background: allUnavailable ? '#D1D5DB' : '#059669',
    border: 'none', borderRadius: 8,
    fontSize: 15, fontWeight: 700,
    color: allUnavailable ? '#6B7280' : '#FFFFFF',
    cursor: allUnavailable ? 'not-allowed' : 'pointer',
  }}
>
  {'Reorder'}
</button>
```

**7e — Update ConfirmDialog copy (lines 38–39):**

```tsx
// Before:
<p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>
  Your current cart will be replaced with available items from this enquiry.
</p>

// After:
<p style={{ margin: '0 0 20px', fontSize: 14, color: '#6B7280' }}>
  Your current cart will be replaced with available items from this enquiry. You can then submit a new quote from the cart.
</p>
```

- [ ] **Commit:**
```bash
git add app/src/app/catalog/orders/enquiry/[id]/page.tsx
git commit -m "feat: unified Reorder CTA on estimate detail, archive Place Order path"
```

---

### Task 8: Archive POST /api/orders — SO creation endpoint

**Files:**
- Modify: `app/src/app/api/orders/route.ts`

**8a — Archive SO-only imports (lines 3, 6, 7, and partial line 8):**

Line 8 is `import type { OrderRequest, CartItem } from '@/types/catalog'`. `CartItem` is used by the GET handler (lines 272, 291) and must be kept. Only `OrderRequest` is archived. Split the line.

- [ ] Archive each SO-only import individually:

```typescript
// Before (lines 1–8):
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHash } from 'crypto'                                         // line 3 — POST only
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { createSalesOrder, markEstimateAccepted } from '@/lib/zoho'         // line 6 — POST only
import { sendOrderConfirmation, sendAdminAlert } from '@/lib/whatsapp'      // line 7 — POST only
import type { OrderRequest, CartItem } from '@/types/catalog'               // line 8 — OrderRequest POST only, CartItem kept

// After:
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// PHASE2_SO_ARCHIVE: import { createHash } from 'crypto'
import { requireSession, AuthError } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
// PHASE2_SO_ARCHIVE: import { createSalesOrder, markEstimateAccepted } from '@/lib/zoho'
// PHASE2_SO_ARCHIVE: import { sendOrderConfirmation, sendAdminAlert } from '@/lib/whatsapp'
// PHASE2_SO_ARCHIVE: import type { OrderRequest } from '@/types/catalog'
import type { CartItem } from '@/types/catalog'
```

**8b — Archive `buildCartHash` and `withOneRetry` helpers (lines 10–22):**

- [ ] Wrap both helper functions in archive delimiters:

```typescript
/* PHASE2_SO_ARCHIVE_START
function buildCartHash(items: CartItem[]): string {
  const sorted = [...items].sort((a, b) => a.zoho_item_id.localeCompare(b.zoho_item_id))
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

async function withOneRetry<T>(fn: () => Promise<T>, delayMs = 2000): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((r) => setTimeout(r, delayMs))
    return fn()
  }
}
PHASE2_SO_ARCHIVE_END */
```

**8c — Archive the entire `POST` handler (lines 24–195):**

- [ ] Wrap the complete `POST` export in archive delimiters. The block starts with the comment `// ── POST /api/orders — Place a new sales order` and ends with `}` closing `export async function POST`. Archive it verbatim and add a 405 stub after:

```typescript
/* PHASE2_SO_ARCHIVE_START
// ── POST /api/orders — Place a new sales order ────────────────────────────────

export async function POST(request: NextRequest) {
  // ... [full original POST handler, 170 lines, unchanged] ...
  return NextResponse.json({
    success: true,
    salesorder_number: zohoSalesorderNumber,
    order_id: order.public_id as string,
    whatsapp_sent: waResult.success,
  })
}
PHASE2_SO_ARCHIVE_END */

// POST /api/orders is disabled in Phase 1 (SO creation archived)
export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: 'Sales order creation is not available' }, { status: 405 })
}
```

- [ ] **Commit:**
```bash
git add app/src/app/api/orders/route.ts
git commit -m "feat: archive POST /api/orders SO creation handler"
```

---

## Verification Steps

After all tasks are committed:

- [ ] **Build check:**
```bash
cd app && npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors, build completes successfully.

- [ ] **Search for archive markers:**
```bash
grep -r "PHASE2_SO_ARCHIVE" app/src/ --include="*.ts" --include="*.tsx"
```
Expected: hits in `orders/route.ts`, `orders/[id]/route.ts`, `[type]/[id]/page.tsx`, `TransactionCard.tsx`, `CartPage.tsx`, `enquiry/[id]/page.tsx`.

- [ ] **Verify no live references to `handlePlaceOrder`:**
```bash
grep -r "handlePlaceOrder" app/src/ --include="*.tsx"
```
Expected: only inside archive comments.

- [ ] **Verify no live references to `OrderResponse`:**
```bash
grep -r "OrderResponse" app/src/ --include="*.ts" --include="*.tsx"
```
Expected: only inside archive comments.

- [ ] **Final commit if verification passes:**
```bash
git add -A
git commit -m "chore: verify Phase 1 SO removal — build clean, no live SO references"
```
