# Design: Remove Sales Order Functionality (Phase 1 Cleanup)

**Date:** 2026-03-26
**Approach:** Option A — Comment-out archival with `PHASE2_SO_ARCHIVE_START` / `PHASE2_SO_ARCHIVE_END` delimiters
**Scope:** Frontend-only. No changes to Supabase schema, Zoho API functions, or WhatsApp message templates.

---

## Summary

Phase 1 removes all Sales Order (SO) creation from the buyer-facing flow. The app becomes enquiry/invoice-only. All archived code is preserved in block comments marked `/* PHASE2_SO_ARCHIVE_START */` ... `/* PHASE2_SO_ARCHIVE_END */` for straightforward Phase 2 reactivation.

Searchable via: `grep -r "PHASE2_SO_ARCHIVE" app/src/`

---

## Change Map

### 1. Orders page — rename sub-tab to "Invoices", filter to invoices-only

**File:** `app/src/app/catalog/orders/page.tsx`
- Change only the visible tab **label** from `"Orders"` → `"Invoices"`
- The URL param key (`?tab=orders`), tab id, and all router logic stay unchanged — preserves any existing bookmarks/deep-links

**File:** `app/src/components/orders/OrdersTab.tsx`
- After paginated fetch from `GET /api/orders`, filter: `items.filter(i => i.kind === 'invoice')`
- Archive the `kind: 'order'` display branch in comments
- Update empty-state copy: "No invoices yet"

**File:** `app/src/components/orders/TransactionCard.tsx`
- Archive the `kind === 'order'` routing branch in `handleClick` (the `type = 'order'` path to `/catalog/orders/order/${id}`) in block comments
- Archive the `Ordered` key in `chipStyle` record in block comments
- Keep "Invoiced" (blue) chip intact
- Routing stays `/catalog/orders/invoice/${item.id}` for all rendered items

---

### 2. Invoice detail page — archive Order fetch path, keep Invoice path + Reorder

**File:** `app/src/app/catalog/orders/[type]/[id]/page.tsx`
- Archive the `kind === 'order'` Supabase fetch branch in block comments
- Keep `kind === 'invoice'` fetch path intact
- **No changes to the CTA/Reorder button** — the existing `handleReorder` / `doReorder` already works for invoices; there is no Place Order branch in this file

**File:** `app/src/app/api/orders/[id]/route.ts`
- Archive the `kind === 'order'` Supabase query branch (`sales_orders` fetch) in block comments
- Keep the `kind === 'invoice'` branch intact
- The `/catalog/orders/order/[id]` URL becomes unreachable from UI; archived code stays for Phase 2

---

### 3. Cart page — archive Place Order and related SO state

**File:** `app/src/components/cart/CartPage.tsx`

Archive in block comments:
- `handlePlaceOrder()` function (POST to `/api/orders`, duplicate detection, error handling)
- `OrderSuccessScreen` component (rendered after SO creation)
- State variables: `orderLoading`, `orderResult` and the `setOrderLoading` / `setOrderResult` calls
- `anyLoading` compound expression `loading || orderLoading` → simplify to `const anyLoading = loading`
- `OrderResponse` import from `@/types/catalog` (becomes unused)
- The "Place Order →" button in the fixed footer

**Keep intact** (these belong to the enquiry/Get Quote flow, not SO):
- `EstimateBanner` interface and `estimateBanner` state
- The `useEffect` that reads `?estimate_id` and loads estimate items into cart
- The `EstimateBanner` JSX block that shows the banner UI in the cart
- "Get Quote" button and `handleGetQuote()` flow
- `EstimateNumberDisplay` shown after Get Quote success

Note: the only SO-adjacent reference in the EstimateBanner flow was `estimate_id: estimateBanner?.public_id` being passed to `handlePlaceOrder` — that disappears as part of archiving `handlePlaceOrder`.

---

### 4. Estimate Details — unified "Reorder" CTA for all statuses, archive "Place Order"

**File:** `app/src/app/catalog/orders/enquiry/[id]/page.tsx`

Archive in block comments:
- `isConverted` / `ctaLabel` status-branching logic
- The Pending/Expired `else` branch in `handleCTA` that deeplinks to `/cart?estimate_id=${data.estimate_id}` (the old Place Order pre-fill path)

New behaviour — **all statuses** (Pending, Expired, Converted):
- Single **"Reorder"** CTA label in fixed footer, always enabled unless all items unavailable
- Clicking "Reorder" always shows a confirmation dialog (replaces the existing cart-replacement dialog)
- Dialog copy:
  > "Your current cart will be replaced with available items from this enquiry. You can then submit a new quote from the cart."
  > Cancel | Confirm
- On confirm: load available items (`stock_status !== 'out_of_stock'`) into CartContext via `loadItems()`, navigate to `/cart`
  - This is the same action already performed for Converted estimates — extend it to all statuses
  - The `?estimate_id` deeplink navigation for Pending/Expired is archived; both statuses now use the cart-load path
- Existing stock-availability warnings (yellow partial / red all-unavailable banners) remain intact

---

### 5. Archive SO creation API handler

**File:** `app/src/app/api/orders/route.ts`
- Archive the entire `POST` handler in block comments
- Keep the `GET` handler fully intact — it feeds the Invoices list
- Note: The `GET` handler still returns `kind: 'order'` rows for historical data; the frontend filter in `OrdersTab` hides them. No backend change needed.

---

### 6. Read-only `sales_orders` references — intentionally out of scope

**Files:** `app/src/app/api/buy-again/route.ts`, `app/src/app/api/catalog/picks/route.ts` (or similar)
- Both read from `sales_orders` as a data source to build purchase history / recommendations
- These are read-only queries — no SO creation, no Zoho calls
- Intentionally **not** archived in this pass; historical SO data continues to surface in Buy Again and Picks until superseded by invoices

### 7. WhatsApp `sendOrderConfirmation` — no change needed

**File:** `app/src/lib/whatsapp.ts`
- Function stays in file untouched (constraint: no changes to whatsapp/message_templates)
- The call site (`sendOrderConfirmation(...)`) disappears when the `POST /api/orders` handler is archived above — no separate action required

---

## Files Changed

| File | Change |
|------|--------|
| `app/src/app/catalog/orders/page.tsx` | Rename "orders" tab → "Invoices" |
| `app/src/components/orders/OrdersTab.tsx` | Filter to invoices only, update empty state |
| `app/src/components/orders/TransactionCard.tsx` | Archive `order` routing branch and `Ordered` chip key |
| `app/src/app/catalog/orders/[type]/[id]/page.tsx` | Archive `order`-type fetch branch; CTA unchanged |
| `app/src/app/api/orders/[id]/route.ts` | Archive `order`-kind Supabase query branch |
| `app/src/components/cart/CartPage.tsx` | Archive `handlePlaceOrder`, SO states, Place Order button, `OrderResponse` import; keep EstimateBanner |
| `app/src/app/catalog/orders/enquiry/[id]/page.tsx` | Unified Reorder CTA for all statuses; archive Place Order path |
| `app/src/app/api/orders/route.ts` | Archive POST handler |

**Files NOT changed:**
- `app/src/lib/whatsapp.ts`
- `app/src/lib/zoho.ts`
- `app/src/components/orders/EnquiriesTab.tsx`
- `app/src/components/orders/EnquiryCard.tsx`
- All Supabase migrations
- `app/src/app/catalog/buy-again/page.tsx`

---

## Archival Convention

All archived blocks use this pattern:

```typescript
/* PHASE2_SO_ARCHIVE_START
  [original code here, unchanged]
PHASE2_SO_ARCHIVE_END */
```

For single-line values (e.g., a state variable), inline style is acceptable:
```typescript
// PHASE2_SO_ARCHIVE: const [orderLoading, setOrderLoading] = useState(false)
```

---

## Out of Scope

- No changes to Supabase schema or RLS
- No changes to Zoho API integration (`lib/zoho.ts`)
- No changes to WhatsApp message templates or `lib/whatsapp.ts`
- No changes to `buy-again` page or its `/api/buy-again` route
- No changes to `EnquiriesTab` / `EnquiryCard` (Enquiries sub-tab untouched)
- No changes to `EstimateBanner` flow in CartPage (belongs to enquiry/Get Quote, not SO)
