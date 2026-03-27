# Estimate Creation Workflow — Design Spec (v2)

**Date:** 2026-03-27
**Branch:** claude/elegant-mendel
**Base:** develop (merged 2026-03-27)

---

## Context

The develop branch already implements:
- `getNearestLocation()` (Haversine) in `app/src/lib/routing.ts`
- `createEstimate()` accepts `locationId`, passes `location_id` to Zoho
- `/api/enquiry` reads `user_lat`/`user_lng`, resolves nearest warehouse, passes to Zoho, sends plain-text admin alert
- `status: 'sent'` on new estimates

This spec covers the **remaining changes** to complete the workflow.

---

## Prerequisites

**Meta template re-approval required** before the 3-param `wineyard_estimate` code change ships.
The existing template has 4 body params (`estimate_number`, `estimate_details`, `total_amount`, `item_count`).
The new template has 3 params (`estimate_number`, `total_amount`, `item_count`) with a new button base URL (Zoho portal).
Until Meta approves the revised template, the template call will fail and all notifications will route to the plain-text fallback — which is safe behaviour, just not ideal UX.

`wineyard_location_notification` is also in review. Code ships with text fallback active.

---

## Changes Required

### 1. DB Migration

File: `supabase/migrations/20260327000001_estimate_location_url.sql`

```sql
ALTER TABLE estimates
  ADD COLUMN location_id TEXT REFERENCES locations(zoho_location_id),
  ADD COLUMN estimate_url TEXT;
```

- `location_id`: nullable — no coords → null
- `estimate_url`: nullable — Zoho GET may fail; estimate remains usable
- FK safe: `locations.zoho_location_id` is PRIMARY KEY

---

### 2. `types/zoho.ts`

Add `estimate_url` to the estimate detail shape:

```ts
export interface ZohoEstimateResponse {
  code: number;
  message: string;
  estimate: {
    estimate_id: string;
    estimate_number: string;
    status: string;
    total: number;
    estimate_url?: string;   // present on GET; absent on POST create response
  };
}
```

---

### 3. `app/src/lib/zoho.ts` — `getEstimatePublicUrl()`

```ts
export async function getEstimatePublicUrl(zohoEstimateId: string): Promise<string | null>
```

- Calls `GET /estimates/{id}?organization_id={orgId}`
- Returns `response.estimate.estimate_url ?? null`
- Never throws — all errors → `null`

---

### 4. `app/src/lib/whatsapp.ts`

#### 4a. `EstimateTemplateData` interface

```ts
export interface EstimateTemplateData {
  customerName: string
  estimateNumber: string
  items: CartItem[]
  totals: QuoteTotals
  estimateUrl: string | null      // Zoho public URL; null → fallback only
  zohoEstimateId: string          // {{1}} for button (suffix of estimate_url)
}
```

Remove `companyName` (unused in new 3-param template).

#### 4b. `sendEstimateNotification()` — revised

**Body params (3):**
| Parameter name | Value |
|---|---|
| `estimate_number` | `EST-XXXXX` |
| `total_amount` | formatted total |
| `item_count` | number of items |

**Button (index 0):**
- `{{1}}` = `zohoEstimateId` (the ID at the end of the Zoho estimate URL)
- Template base URL registered in Meta = Zoho portal prefix; `{{1}}` appends the ID

**Plain-text fallback (`sendQuotation`):**
- Extend signature: `sendQuotation(to, estimateNumber, items, totals, estimateUrl?: string | null)`
- Append `\nView estimate: ${estimateUrl}` before "Reply YES" line when URL is present

#### 4c. `sendAdminLocationNotification()` — new function

**Replaces** the existing `sendAdminAlert()` call at the bottom of `/api/enquiry/route.ts`.

```ts
export async function sendAdminLocationNotification(data: {
  locationName: string | null
  estimateNumber: string
  contactName: string
  contactPhone: string
  contactLocation: string | null   // user's area/city from wl cookie
  total: number
  itemCount: number
  estimateUrl: string | null
}): Promise<void>
```

**Primary:** `wineyard_location_notification` WABA template.

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

Button: `{{1}}` = Zoho `estimate_id` (same as customer notification button).

**Fallback (template in review — active path for now):**
```
sendText(adminNumber, [same data formatted identically to template body])
```

Best-effort — never throws, never blocks response.

---

### 5. `/api/enquiry/route.ts`

#### New estimate creation path (lines 191–291)

After `createEstimate()` succeeds:
1. `getEstimatePublicUrl(zohoEstimateId)` → `estimateUrl` (best-effort, null ok)
2. Supabase insert adds `location_id: nearestLocationId ?? null` and `estimate_url: estimateUrl ?? null`
3. `sendEstimateNotification` call updated: remove `companyName`, add `estimateUrl`, `zohoEstimateId`
4. Replace `sendAdminAlert(...)` with `sendAdminLocationNotification(...)` (same fire-and-forget pattern)

`contactLocation` for the admin template = user's area/city parsed from the `wl` cookie.
The `wl` cookie is available in the request (HttpOnly, sent automatically); parse it server-side:
```ts
const wlCookie = request.cookies.get('wl')?.value
const wlData = wlCookie ? JSON.parse(decodeURIComponent(wlCookie)) : null
const contactLocation = wlData?.area ?? wlData?.city ?? null
```

#### Update path (lines 62–112) and duplicate path (lines 114–159)

Both paths call `sendEstimateNotification`. After the interface change they must be updated:
- Select `estimate_url, zoho_estimate_id` from the estimate record
- Pass `estimateUrl: est.estimate_url ?? null` and `zohoEstimateId: est.zoho_estimate_id`
- Remove `companyName` from the call

No location re-computation for these paths. No admin notification for these paths (unchanged behaviour).

---

## Data Flow (new estimate, end-to-end)

```
POST /api/enquiry
  │
  ├─ auth + parse body (items, user_lat, user_lng, notes, estimate_id)
  ├─ compute totals + cartHash
  │
  ├─ [update path] — select estimate_url, zoho_estimate_id; update; re-send WA (3-param); return
  ├─ [duplicate path] — select estimate_url, zoho_estimate_id; re-send WA if needed; return
  │
  ├─ read wl cookie → contactLocation (area | city | null)
  ├─ nearest location: user_lat/lng → getNearestLocation() → nearestLocationId, nearestLocationName
  │
  ├─ createEstimate(Zoho, locationId) → zohoEstimateId, zohoEstimateNumber
  ├─ getEstimatePublicUrl(zohoEstimateId) → estimateUrl | null     [NEW]
  │
  ├─ Supabase insert: ..., location_id, estimate_url                [NEW]
  │
  ├─ sendEstimateNotification(3-param, Zoho URL button)             [UPDATED]
  │
  └─ sendAdminLocationNotification() [fire-and-forget]              [REPLACES sendAdminAlert]
```

---

## Files Touched

| File | Change |
|------|--------|
| `supabase/migrations/20260327000001_estimate_location_url.sql` | NEW |
| `types/zoho.ts` | Add `estimate_url?` to estimate shape |
| `app/src/lib/zoho.ts` | Add `getEstimatePublicUrl()` |
| `app/src/lib/whatsapp.ts` | Update `EstimateTemplateData`, `sendEstimateNotification`, `sendQuotation`; add `sendAdminLocationNotification` |
| `app/src/app/api/enquiry/route.ts` | All 3 WA call sites; fetch+store URL; admin notification |

---

## Out of Scope

- `wineyard_estimate` template button base URL registration in Meta (product task)
- `wineyard_location_notification` template Meta approval (product task)
- Order/sales-order flow (Phase 2)
