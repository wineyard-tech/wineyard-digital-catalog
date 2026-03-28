# Estimate Creation Workflow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire nearest-warehouse `location_id` and Zoho `estimate_url` into the estimate creation flow, update the customer WhatsApp notification to 3 params with a Zoho portal button, and replace the plain-text admin alert with a structured `sendAdminLocationNotification` function.

**Architecture:** Five files touched in dependency order — types first, then pure utility functions, then the API route that orchestrates everything. Each task is independently deployable (additive column, additive function, then updated call sites).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase JS, Zoho Books API v3, WhatsApp Cloud API (Meta)

**Spec:** `docs/superpowers/specs/2026-03-27-estimate-creation-workflow-design.md`

---

## Chunk 1: DB + Types

### Task 1: DB Migration — add `location_id` and `estimate_url` to `estimates`

**Files:**
- Create: `supabase/migrations/20260327000001_estimate_location_url.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260327000001_estimate_location_url.sql

-- Associate each estimate with the nearest warehouse at creation time.
-- Nullable: estimates created before this migration, or where user had no coords, remain null.
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES locations(zoho_location_id),
  ADD COLUMN IF NOT EXISTS estimate_url TEXT;

COMMENT ON COLUMN estimates.location_id IS 'Nearest warehouse zoho_location_id resolved at creation via Haversine';
COMMENT ON COLUMN estimates.estimate_url IS 'Zoho Books public shareable estimate URL (fetched via GET /estimates/{id} after creation)';
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
cd /path/to/repo
npx supabase db push --local
```

Expected output: `Applying migration 20260327000001_estimate_location_url.sql... done`

- [ ] **Step 3: Verify columns exist**

```bash
npx supabase db execute --local "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'estimates' AND column_name IN ('location_id', 'estimate_url');"
```

Expected: 2 rows returned, both `is_nullable = YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260327000001_estimate_location_url.sql
git commit -m "feat: add location_id and estimate_url columns to estimates"
```

---

### Task 2: Update `ZohoEstimateResponse` type

**Files:**
- Modify: `types/zoho.ts` (lines 126–135)

Background: `ZohoEstimateResponse` is used by `createEstimate()` (POST — no URL) and the new `getEstimatePublicUrl()` (GET — has URL). Adding `estimate_url?` to the shared interface covers both without a separate type.

- [ ] **Step 1: Add `estimate_url?` to the estimate detail object**

In `types/zoho.ts`, find `ZohoEstimateResponse` and update it:

```ts
export interface ZohoEstimateResponse {
  code: number;
  message: string;
  estimate: {
    estimate_id: string;
    estimate_number: string;
    status: string;
    total: number;
    estimate_url?: string;  // present on GET /estimates/{id}; absent on POST create
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add types/zoho.ts
git commit -m "feat: add estimate_url to ZohoEstimateResponse type"
```

---

## Chunk 2: Zoho + WhatsApp Functions

### Task 3: Add `getEstimatePublicUrl()` to `zoho.ts`

**Files:**
- Modify: `app/src/lib/zoho.ts` (append after `createEstimate`, before `createSalesOrder`)

Background: Zoho Books POST /estimates does not return a public share URL. A separate GET /estimates/{id} is required. This function wraps that call and always returns `string | null` — callers never need to handle throws.

- [ ] **Step 1: Add the function**

In `app/src/lib/zoho.ts`, add after the `createEstimate` function (around line 167):

```ts
/**
 * Fetches the public shareable URL for an existing Zoho estimate.
 *
 * The POST /estimates response does not include estimate_url — it is only
 * available on the GET /estimates/{id} response. This function is a best-effort
 * wrapper: it returns null on any failure so the caller can proceed without
 * a URL rather than blocking the estimate flow.
 */
export async function getEstimatePublicUrl(zohoEstimateId: string): Promise<string | null> {
  try {
    const token = await getAccessToken()
    const orgId = process.env.ZOHO_ORG_ID!

    const res = await fetch(
      `${ZOHO_API_BASE}/estimates/${zohoEstimateId}?organization_id=${orgId}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )

    if (!res.ok) return null

    const data: ZohoEstimateResponse = await res.json()
    return data.estimate.estimate_url ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/zoho.ts
git commit -m "feat: add getEstimatePublicUrl to fetch Zoho public share URL"
```

---

### Task 4: Update WhatsApp — `EstimateTemplateData`, `sendEstimateNotification`, `sendQuotation`

**Files:**
- Modify: `app/src/lib/whatsapp.ts`

Background: The `wineyard_estimate` WABA template is being revised from 4 params to 3 (removing `estimate_details`). The button now points to the Zoho estimate portal rather than the app deep link. Until Meta approves the revised template, all calls will fail and route to the plain-text fallback — that's safe. `companyName` is removed from the interface since the new 3-param template doesn't use it.

- [ ] **Step 1: Update `EstimateTemplateData` interface**

Find the interface at line ~184 and replace it:

```ts
export interface EstimateTemplateData {
  customerName: string
  estimateNumber: string
  items: CartItem[]
  totals: QuoteTotals
  estimateUrl: string | null    // Zoho public URL; null → plain-text fallback used
  zohoEstimateId: string        // {{1}} for button — Zoho estimate ID (suffix of estimate_url)
}
```

- [ ] **Step 2: Update `sendEstimateNotification`**

Replace the existing function body. Key changes:
- 3 body params (drop `estimate_details`)
- Button `{{1}}` = `zohoEstimateId` (not `deepLinkPath`)
- Fallback passes `estimateUrl` to updated `sendQuotation`

```ts
/**
 * Sends the `wineyard_estimate` WABA template with a Zoho estimate portal button.
 * Falls back to sendQuotation (plain text + URL) if the template call fails.
 *
 * Template parameters (3 named body params):
 *   {{estimate_number}}  = Estimate number (EST-XXXXX)
 *   {{total_amount}}     = Total amount (formatted, no ₹ symbol — template handles currency)
 *   {{item_count}}       = Number of line items
 *
 * Button (index 0): URL button — dynamic suffix is the Zoho estimate_id.
 *
 * NOTE: Template requires Meta re-approval before the 3-param version is live.
 * Until approved, template calls fail and plain-text fallback is used automatically.
 */
export async function sendEstimateNotification(
  to: string,
  data: EstimateTemplateData,
): Promise<WaSendResult> {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  try {
    const messageId = await callWhatsAppApi({
      to,
      type: 'template',
      template: {
        name: 'wineyard_estimate',
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'estimate_number', text: data.estimateNumber },
              { type: 'text', parameter_name: 'total_amount',    text: fmt(data.totals.total) },
              { type: 'text', parameter_name: 'item_count',      text: String(data.items.length) },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: data.zohoEstimateId }],
          },
        ],
      },
    })
    return { success: true, messageId }
  } catch (templateErr) {
    console.warn('[whatsapp] estimate template send failed, falling back to plain text:', templateErr)
    return sendQuotation(to, data.estimateNumber, data.items, data.totals, data.estimateUrl)
  }
}
```

- [ ] **Step 3: Update `sendQuotation` to accept and include `estimateUrl`**

Find the `sendQuotation` function and update its signature and message body:

```ts
export async function sendQuotation(
  to: string,
  estimateNumber: string,
  items: CartItem[],
  totals: QuoteTotals,
  estimateUrl?: string | null
): Promise<WaSendResult> {
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const lineRows = items
    .map((item) => `${item.item_name} × ${item.quantity}   ${fmt(item.line_total)}`)
    .join('\n')

  const message =
    `*WineYard Quotation #${estimateNumber}*\n` +
    `──────────────────\n` +
    `${lineRows}\n` +
    `──────────────────\n` +
    `Subtotal:  ${fmt(totals.subtotal)}\n` +
    `GST (18%): ${fmt(totals.tax)}\n` +
    `*Total:    ${fmt(totals.total)}*\n` +
    `──────────────────\n` +
    (estimateUrl ? `View estimate: ${estimateUrl}\n` : '') +
    `Reply *YES* to confirm or call us.`

  try {
    const messageId = await sendText(to, message)
    return { success: true, messageId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: Errors at `sendEstimateNotification` call sites in `route.ts` (still passing old shape — fixed in Task 6). All other errors: none.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/whatsapp.ts
git commit -m "feat: update sendEstimateNotification to 3-param template with Zoho URL button"
```

---

### Task 5: Add `sendAdminLocationNotification()` to `whatsapp.ts`

**Files:**
- Modify: `app/src/lib/whatsapp.ts` (append before `sendAdminAlert`, or after it)

Background: The admin is notified of each new estimate with the nearest warehouse context. `wineyard_location_notification` is the WABA template (currently in Meta review — always falls back to text for now). The text fallback matches the template body exactly so the admin sees consistent info either way.

Template body (from Meta submission):
```
Hello {{location_name}},
A new Estimate {{estimate_number}} was created for your location. Here are the details.
Customer Name - {{contact_name}}
Phone Number - {{contact_phone_number}}
Customer Location - {{contact_location}}
Estimate Details - ₹{{total_amount}} ({{item_count}} items)
Please respond at the earliest.
```

Button: `{{1}}` = Zoho `estimate_id`.

- [ ] **Step 1: Add the function**

Append after `sendAdminAlert` in `app/src/lib/whatsapp.ts`:

Note: The spec listed `estimateUrl` in this interface, but the `wineyard_location_notification` template body has no URL param — only the button uses `{{1}}` = `zohoEstimateId`. `estimateUrl` is intentionally omitted here; `zohoEstimateId` is sufficient for the button.

```ts
export interface AdminLocationNotificationData {
  locationName: string | null
  estimateNumber: string
  contactName: string
  contactPhone: string
  contactLocation: string | null   // user's area/city from wl cookie
  total: number
  itemCount: number
  zohoEstimateId: string           // {{1}} for button
}

/**
 * Sends a new-estimate notification to the admin WhatsApp number.
 * Primary: `wineyard_location_notification` WABA template (in Meta review — will fail).
 * Fallback: plain text matching the template body exactly.
 * Best-effort — never throws, never blocks the main response.
 */
export async function sendAdminLocationNotification(
  data: AdminLocationNotificationData
): Promise<void> {
  const adminNumber = process.env.WHATSAPP_ADMIN_NUMBER
  if (!adminNumber) {
    console.warn('[whatsapp] WHATSAPP_ADMIN_NUMBER not set — skipping admin location notification')
    return
  }

  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const locationLabel = data.locationName ?? 'Unknown'

  try {
    await callWhatsAppApi({
      to: adminNumber,
      type: 'template',
      template: {
        name: 'wineyard_location_notification',
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'location_name',        text: locationLabel },
              { type: 'text', parameter_name: 'estimate_number',      text: data.estimateNumber },
              { type: 'text', parameter_name: 'contact_name',         text: data.contactName },
              { type: 'text', parameter_name: 'contact_phone_number', text: data.contactPhone },
              { type: 'text', parameter_name: 'contact_location',     text: data.contactLocation ?? 'Unknown' },
              { type: 'text', parameter_name: 'total_amount',         text: fmt(data.total) },
              { type: 'text', parameter_name: 'item_count',           text: String(data.itemCount) },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: data.zohoEstimateId }],
          },
        ],
      },
    })
    return
  } catch {
    // Template in review — fall through to plain-text fallback
  }

  // Plain-text fallback — matches template body exactly
  try {
    await sendText(
      adminNumber,
      `Hello ${locationLabel},\n\n` +
      `A new Estimate ${data.estimateNumber} was created for your location. Here are the details.\n\n` +
      `Customer Name - ${data.contactName}\n` +
      `Phone Number - ${data.contactPhone}\n` +
      `Customer Location - ${data.contactLocation ?? 'Unknown'}\n` +
      `Estimate Details - ${fmt(data.total)} (${data.itemCount} items)\n\n` +
      `Please respond at the earliest.`
    )
  } catch (err) {
    console.error('[whatsapp] admin location notification fallback failed:', err)
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: Only the existing call-site errors in `route.ts` (fixed next task). No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/whatsapp.ts
git commit -m "feat: add sendAdminLocationNotification with wineyard_location_notification template"
```

---

## Chunk 3: Route Integration

### Task 6: Update `/api/enquiry/route.ts`

**Files:**
- Modify: `app/src/app/api/enquiry/route.ts`

This task touches all three `sendEstimateNotification` call sites plus the new-estimate creation path. Changes are in dependency order within the file.

- [ ] **Step 1: Update imports**

Replace the whatsapp import line at the top. **Keep `sendAdminAlert`** — it is still used at lines 207 and 239 for Zoho/DB error alerts; only the success-path admin notification is replaced.

```ts
// Before:
import { sendEstimateNotification, sendAdminAlert } from '@/lib/whatsapp'

// After:
import {
  sendEstimateNotification,
  sendAdminAlert,
  sendAdminLocationNotification,
} from '@/lib/whatsapp'
import type { AdminLocationNotificationData } from '@/lib/whatsapp'
```

Also add `getEstimatePublicUrl` to the zoho import:

```ts
// Before:
import { createEstimate } from '@/lib/zoho'

// After:
import { createEstimate, getEstimatePublicUrl } from '@/lib/zoho'
```

- [ ] **Step 2: Update the estimate update path (lines ~62–112)**

The `.select()` needs `estimate_url` and `zoho_estimate_id`. Update:

```ts
// Before:
.select('id, public_id, estimate_number, zoho_sync_status')

// After:
.select('id, public_id, estimate_number, zoho_sync_status, estimate_url, zoho_estimate_id')
```

Update the `sendEstimateNotification` call inside the update path:

```ts
// Before:
const deepLinkPath = `cart?estimate_id=${est.public_id}`
const waResult = await sendEstimateNotification(
  session.phone,
  {
    customerName: session.contact_name,
    companyName: '',
    estimateNumber: est.estimate_number,
    items: body.items,
    totals: { subtotal, tax, total },
  },
  deepLinkPath,
)

// After:
const waResult = await sendEstimateNotification(
  session.phone,
  {
    customerName: session.contact_name,
    estimateNumber: est.estimate_number,
    items: body.items,
    totals: { subtotal, tax, total },
    estimateUrl: est.estimate_url ?? null,
    zohoEstimateId: est.zoho_estimate_id ?? '',
  },
)
```

- [ ] **Step 3: Update the duplicate detection path (lines ~114–159)**

Update the `.select()`:

```ts
// Before:
.select('id, public_id, estimate_number, zoho_sync_status, app_whatsapp_sent, line_items')

// After:
.select('id, public_id, estimate_number, zoho_sync_status, app_whatsapp_sent, line_items, estimate_url, zoho_estimate_id')
```

Update the `sendEstimateNotification` call inside the duplicate path:

```ts
// Before:
const deepLinkPath = `cart?estimate_id=${existing.public_id}`
const waResult = await sendEstimateNotification(
  session.phone,
  {
    customerName: session.contact_name,
    companyName: session.contact_name,
    estimateNumber: existing.estimate_number,
    items: existing.line_items as CartItem[],
    totals: { subtotal, tax, total },
  },
  deepLinkPath
)

// After:
const waResult = await sendEstimateNotification(
  session.phone,
  {
    customerName: session.contact_name,
    estimateNumber: existing.estimate_number,
    items: existing.line_items as CartItem[],
    totals: { subtotal, tax, total },
    estimateUrl: existing.estimate_url ?? null,
    zohoEstimateId: existing.zoho_estimate_id ?? '',
  },
)
```

- [ ] **Step 4: Add `wl` cookie parse before the new estimate block**

Add this block right before the `// ── Nearest-warehouse routing` comment (around line 161):

```ts
// ── Parse wl (user location) cookie ──────────────────────────────────────
// Used for admin notification's contactLocation field.
let contactLocation: string | null = null
try {
  const wlRaw = request.cookies.get('wl')?.value
  if (wlRaw) {
    const wlData = JSON.parse(decodeURIComponent(wlRaw))
    contactLocation = wlData?.area ?? wlData?.city ?? null
  }
} catch {
  // malformed cookie — proceed without location label
}
```

- [ ] **Step 5: Fetch `estimate_url` and store `location_id` + `estimate_url` in the Supabase insert**

After the Zoho `createEstimate` block and before the Supabase insert, add:

```ts
// ── Fetch Zoho public URL (best-effort — null if GET fails) ─────────────
const estimateUrl = await getEstimatePublicUrl(zohoEstimateId)
```

Then update the Supabase insert to include the new columns:

```ts
// In the .insert({...}) block, add after `notes: body.notes ?? null,`:
location_id: nearestLocationId ?? null,
estimate_url: estimateUrl ?? null,
```

- [ ] **Step 6: Update the new-estimate `sendEstimateNotification` call**

```ts
// Before:
const deepLinkPath = `cart?estimate_id=${estimate.public_id}`
const waResult = await sendEstimateNotification(
  session.phone,
  {
    customerName: session.contact_name,
    companyName: '',
    estimateNumber: zohoEstimateNumber,
    items: body.items,
    totals: { subtotal, tax, total },
  },
  deepLinkPath
)

// After:
const waResult = await sendEstimateNotification(
  session.phone,
  {
    customerName: session.contact_name,
    estimateNumber: zohoEstimateNumber,
    items: body.items,
    totals: { subtotal, tax, total },
    estimateUrl: estimateUrl ?? null,
    zohoEstimateId: zohoEstimateId,
  },
)
```

- [ ] **Step 7: Replace `sendAdminAlert` with `sendAdminLocationNotification`**

```ts
// Before (lines ~275–284):
const warehouseLabel = nearestLocationName
  ? `Warehouse: ${nearestLocationName} (${nearestLocationId})`
  : 'Warehouse: unknown (no coords)'
void sendAdminAlert(
  `📋 New estimate: ${zohoEstimateNumber}\n` +
  `Contact: ${session.contact_name} (${session.phone})\n` +
  `${warehouseLabel}\n` +
  `Total: ₹${Math.round(total).toLocaleString('en-IN')}`
)

// After:
void sendAdminLocationNotification({
  locationName: nearestLocationName,
  estimateNumber: zohoEstimateNumber,
  contactName: session.contact_name,
  contactPhone: session.phone,
  contactLocation,
  total,
  itemCount: body.items.length,
  zohoEstimateId,
})
```

- [ ] **Step 8: Type-check — must be clean**

```bash
cd app && npx tsc --noEmit
```

Expected: **0 errors.** If errors remain, fix them before proceeding.

- [ ] **Step 9: Lint**

```bash
cd app && npm run lint
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add app/src/app/api/enquiry/route.ts
git commit -m "feat: wire location_id, estimate_url, and admin location notification into enquiry route"
```

---

## Chunk 4: Smoke Test + PR

### Task 7: Local smoke test

- [ ] **Step 1: Start local Supabase**

```bash
npx supabase start
```

- [ ] **Step 2: Start dev server**

```bash
cd app && npm run dev
```

- [ ] **Step 3: Submit an enquiry with location coords**

Use curl or the UI to POST to `/api/enquiry` with a valid session cookie and body:

```json
{
  "items": [{ "zoho_item_id": "...", "item_name": "Test Cam", "sku": "TC-01", "quantity": 1, "rate": 5000, "tax_percentage": 18, "line_total": 5000 }],
  "user_lat": 17.385,
  "user_lng": 78.4867
}
```

Expected response:
```json
{
  "success": true,
  "estimate_number": "EST-XXXXX",
  "estimate_id": "<uuid>",
  "whatsapp_sent": true
}
```

- [ ] **Step 4: Verify DB row**

```bash
npx supabase db execute --local \
  "SELECT estimate_number, status, location_id, estimate_url FROM estimates ORDER BY created_at DESC LIMIT 1;"
```

Expected: `status = sent`, `location_id` populated (or null if no warehouses geocoded), `estimate_url` populated (or null if Zoho GET failed locally).

- [ ] **Step 5: Commit and push**

```bash
git push origin claude/elegant-mendel
```

### Task 8: Open PR

- [ ] **Step 1: Create PR**

```bash
gh pr create \
  --base develop \
  --title "feat: estimate location_id, Zoho estimate_url, revised WA template, admin location notification" \
  --body "$(cat <<'EOF'
## Summary

- DB: add `location_id` and `estimate_url` columns to `estimates`
- Zoho: `getEstimatePublicUrl()` fetches public share link via GET /estimates/{id}
- WhatsApp: `wineyard_estimate` template updated to 3 params + Zoho portal button (requires Meta re-approval to activate)
- WhatsApp: `sendAdminLocationNotification()` with `wineyard_location_notification` template + text fallback
- Enquiry route: stores `location_id` + `estimate_url`; wires revised WA calls; replaces plain-text admin alert

## Prerequisites before merging

- [ ] `wineyard_estimate` Meta template re-approved with 3-param body + Zoho portal button base URL
- [ ] `wineyard_location_notification` Meta template approved (text fallback active until then)
- [ ] Migration applied to production Supabase

## Test plan

- [ ] Submit enquiry with `user_lat`/`user_lng` → verify `location_id` populated in DB
- [ ] Verify `estimate_url` stored in DB after creation
- [ ] Verify WA message sent (or plain-text fallback until template approved)
- [ ] Verify admin receives notification with correct location + customer fields

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
