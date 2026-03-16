# WineYard — Agent-Driven Development Guide

**Version:** 2.0
**Date:** March 16, 2026
**Audience:** Phani (solo dev, new to Claude Code agent workflows)
**Changes from v1:** Correct architecture file path, Linear issue map with per-task status updates, TraderOps references removed, all gap-analysis items resolved.

---

## Part 1: The 3-Agent Model

### Agent ownership at a glance

| Agent | Owns | Directory | Linear Issues |
|---|---|---|---|
| **Sync Agent** | Supabase Edge Functions + pg_cron | `/supabase/functions/` | UNB-72, UNB-73, UNB-88 |
| **App Backend Agent** | Next.js API routes + server lib + middleware | `/app/src/app/api/` + `/app/src/lib/` + `/app/src/middleware.ts` | UNB-74, UNB-82, UNB-83, UNB-89, UNB-90, UNB-91, UNB-92 |
| **Frontend Agent** | Next.js pages + components | `/app/src/app/` (pages only) + `/app/src/components/` + `/app/public/` | UNB-75, UNB-76, UNB-77, UNB-78, UNB-79, UNB-84, UNB-85, UNB-86, UNB-93, UNB-94, UNB-95, UNB-96 |

Zero directory overlap between Sync and Backend. Frontend reads shared types but never modifies them.

---

### Do you need an Orchestration Agent?

**No. You are the orchestrator.**

Claude Code doesn't have a native orchestrator-spawns-subagents pattern. The orchestration is the sequence of sessions you run and the context you give each one. Your job between sessions: run gate checks, update Linear issue statuses, open the next session.

---

### Sequential vs Parallel

**Sequential is the right call for a Claude Code beginner.** Sync and Backend own different directories so there's no file conflict — but:

1. Backend Agent needs to know what schema Sync writes to (type shapes, nullable fields)
2. Both might need to read/update `/types/` — needs coordination
3. Debugging two concurrent sessions doubles the cognitive load
4. Merging two Claude Code branches requires git confidence you don't need yet

Speed gain from parallelism: ~1-2 hours. Risk cost if a type mismatch happens: 3-4 hours of debugging. Sequential wins.

---

### Recommended Execution Order

```
PHASE 0: Setup (already done)
  └── Repo initialized, migrations run, connections validated ✅

PHASE 1: Sync Agent (2-3 hrs)
  ├── Linear: mark UNB-72, UNB-73, UNB-88 → In Progress
  ├── Build + deploy Edge Functions
  ├── Verify data flows into Supabase tables
  └── Gate: DB has real items + pricebooks from Zoho
      → Mark UNB-72, UNB-73, UNB-88 → Done ✅

PHASE 2: App Backend Agent (3-4 hrs)
  ├── Linear: mark UNB-82, UNB-83, UNB-89, UNB-90, UNB-91, UNB-92 → In Progress
  │   (UNB-74 is also touched here — mark In Progress)
  ├── Build all API routes + lib utilities
  ├── Verify with curl/Postman before frontend touches anything
  └── Gate: all API routes return correct shapes
      → Mark above issues → Done ✅

PHASE 3: Frontend Agent (4-6 hrs)
  ├── Linear: mark UNB-75, UNB-76, UNB-77, UNB-78, UNB-79,
  │          UNB-84, UNB-85, UNB-86, UNB-93, UNB-94, UNB-95, UNB-96 → In Progress
  ├── Build all pages + components against verified APIs
  └── Gate: mobile browser demo works end-to-end
      → Mark above issues → Done ✅

PHASE 4: Integration (1-2 hrs)
  ├── You run the full flow manually, fix edge cases
  └── Internal demo sign-off → mark UNB-80, UNB-87 → Done ✅
```

Frontend MUST wait for Phase 2. There is no shortcut — building UI against unverified APIs wastes time.

---

## Part 2: Linear Issue Map

### Complete issue registry — Digital Catalog project

All issues are current as of March 16, 2026. No outdated issues remain.

#### Sync Agent (Phase 1)

| Issue | Title | Priority | Phase |
|---|---|---|---|
| **UNB-72** | sync-items Edge Function — full Zoho item sync to Supabase | Urgent | Phase 1 |
| **UNB-73** | sync-contacts Edge Function — lazy contact refresh + pricebook sync | Urgent | Phase 1 |
| **UNB-88** | Sync Agent shared utilities (`_shared/`) + pg_cron deployment | Urgent | Phase 1 |

#### App Backend Agent (Phase 2)

| Issue | Title | Priority | Phase |
|---|---|---|---|
| **UNB-74** | Catalog API `/api/catalog` — pricing resolution with custom vs base rate | Urgent | Phase 2 |
| **UNB-82** | WhatsApp webhook — Supabase-first contact lookup, lazy Zoho fallback | Urgent | Phase 2 |
| **UNB-83** | OTP auth generation — `auth_requests` table, ref_id + 6-digit OTP, WhatsApp delivery | Urgent | Phase 2 |
| **UNB-89** | OTP verification route `/api/auth/verify` — validate OTP, create session, set cookie | Urgent | Phase 2 |
| **UNB-90** | Session middleware — cookie validation, guest token validation, protected routes | Urgent | Phase 2 |
| **UNB-91** | Enquiry API route `/api/enquiry` — Zoho estimate creation + WhatsApp quotation | Urgent | Phase 2 |
| **UNB-92** | Admin API route `/api/admin` — enquiry list + status update (Supabase Auth protected) | High | Phase 2 |

#### Frontend Agent (Phase 3)

| Issue | Title | Priority | Phase |
|---|---|---|---|
| **UNB-75** | Catalog browse UI — ProductGrid, SearchBar, CategoryFilter, BrandFilter | Urgent | Phase 3 |
| **UNB-76** | Stock badges — Available / Limited / Out of Stock display on ProductCard | High | Phase 3 |
| **UNB-77** | Pricing display — "Your Price" vs "MRP" label, GST-inclusive total | High | Phase 3 |
| **UNB-78** | Cart — CartContext, CartBar (sticky bottom), CartSheet (slide-up drawer) | Urgent | Phase 3 |
| **UNB-79** | Submit enquiry — cart → `/api/enquiry` → confirmation screen | Urgent | Phase 3 |
| **UNB-84** | Quotation formatter — WhatsApp message template for line items + totals | High | Phase 3 |
| **UNB-85** | Deliver quotation — WhatsApp send on successful estimate creation | High | Phase 3 |
| **UNB-86** | CONFIRM reply handler — update estimate status on integrator reply | Normal | Phase 3 |
| **UNB-93** | OTP auth page `/auth/[ref_id]` + OtpForm component | Urgent | Phase 3 |
| **UNB-94** | Guest catalog page `/guest/[token]` + GuestBanner | High | Phase 3 |
| **UNB-95** | Admin panel — Supabase Auth login + enquiry management dashboard | High | Phase 3 |
| **UNB-96** | Offline PWA — next-pwa, service worker, offline fallback page | High | Phase 3 |

#### Sign-off (Phase 4)

| Issue | Title | Priority | Phase |
|---|---|---|---|
| **UNB-80** | Internal demo — end-to-end sign-off with WineYard staff | High | Phase 4 |
| **UNB-87** | E2E test run — full integrator flow + admin flow verified | High | Phase 4 |

---

## Part 3: How to Prompt Claude Code — Step by Step

### The golden rule

> Every Claude Code session must start with: (1) the architecture doc path, (2) its specific directory boundary, (3) its specific task list, and (4) acceptance criteria with Linear issue numbers. Without all four, it will go off-script.

---

### Session 0: Pre-flight (You do this, not Claude Code)

Before starting any agent session, confirm:

```bash
# 1. Supabase is running and migrations are applied
npx supabase status          # all services green
npx supabase db push         # no errors

# 2. Env vars are set
cat app/.env.local           # all fields filled in, no placeholders

# 3. Zoho + WhatsApp connections validated
export $(grep -v '^#' app/.env.local | xargs)
npx ts-node scripts/test-zoho-connection.ts
npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "test"

# 4. Types are generated
./scripts/generate-types.sh  # types/database.generated.ts updated
```

Only proceed when all 4 checks pass.

**Linear action:** No status updates yet — issues stay Backlog until active work starts.

---

### Session 1: Sync Agent

**Linear: Mark UNB-72, UNB-73, UNB-88 → In Progress before you paste this prompt.**

**Open Claude Code in `wineyard-catalog/` and paste:**

```
You are the Sync Agent for the WineYard Digital Catalog project.

## Your context
Read this file completely before writing any code:
  planning/WineYard_Architecture_v2.md  (sections 2, 5, 8, and the Zoho API appendix)

## Your directory boundary
You work ONLY in:
  /supabase/functions/

You do NOT touch:
  /app/  or  /types/  or  /supabase/migrations/

## Linear issues you are closing
UNB-88 — Sync shared utilities + pg_cron deployment
UNB-72 — sync-items Edge Function
UNB-73 — sync-contacts Edge Function

## Your tasks (complete in this order)

### Task 1 [UNB-88]: Zoho client (supabase/functions/_shared/zoho-client.ts)
Write a Deno-compatible Zoho API client with:
- getZohoToken(): reads from zoho_tokens table, refreshes if expiring in <5 min, upserts new token
- getItems(page: number): GET /items, paginated, returns ZohoItem[]
- getContactByPhone(phone: string): GET /contacts?phone=X, returns ZohoContact | null
- createEstimate(data): POST /estimates, returns zoho_estimate_id
All Zoho API calls use https://www.zohoapis.in/books/v3/ with header:
  Authorization: Zoho-oauthtoken {token}

### Task 2 [UNB-88]: Supabase client (supabase/functions/_shared/supabase-client.ts)
Write a Deno-compatible Supabase admin client using SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from Deno.env. Export a single `supabase` instance.

### Task 3 [UNB-88]: pg_cron schedule (scripts/deploy-cron.sql)
Write the SQL to register three pg_cron jobs (after Edge Functions are deployed):
- sync-items: every 6 hours
- sync-contacts: every 24 hours
- session-cleanup: every 15 minutes
Use pg_net to POST to the Edge Function URLs. Include placeholder comments for PROJECT_REF and SERVICE_ROLE_KEY.

### Task 4 [UNB-72]: sync-items Edge Function (supabase/functions/sync-items/index.ts)
- Serves POST requests (called by pg_cron)
- Verifies Authorization header matches service role key
- Fetches all active items from Zoho (all pages, 200/page)
- Upserts each item into `items` table (onConflict: zoho_item_id)
- If item has locations array: upserts into item_locations table
- Upserts brands from item.brand values into brands table
- Upserts categories from item.category_name values into categories table
- Returns { synced: N, errors: [] }

### Task 5 [UNB-73]: sync-contacts Edge Function (supabase/functions/sync-contacts/index.ts)
- Serves POST requests (called by pg_cron)
- Fetches only contacts that ALREADY EXIST in Supabase contacts table (lazy creation strategy)
- For each, calls Zoho GET /contacts/{id} to refresh status, pricebook_id, phone
- Upserts into contacts table
- Also syncs pricebook items: GET /pricebooks → upsert into pricebooks table
- Returns { synced: N, errors: [] }

### Task 6 [UNB-88]: session-cleanup Edge Function (supabase/functions/session-cleanup/index.ts)
- Serves POST requests (called by pg_cron)
- Calls the cleanup_expired_sessions() SQL function
- Returns { deleted: N }

### Task 7: Manual trigger test script (scripts/trigger-sync.sh)
Write a bash script that manually triggers sync-items via HTTP POST to the local Supabase Edge Function URL, for development testing.

## Acceptance criteria
Before finishing, verify:
1. `npx supabase functions serve sync-items` starts without TypeScript errors
2. `npx supabase functions serve sync-contacts` starts without TypeScript errors
3. Trigger sync-items manually → items table has rows:
   SELECT COUNT(*) FROM items;
4. Trigger sync-contacts manually → pricebooks table has rows for "General" pricebook:
   SELECT COUNT(*) FROM pricebooks;

Do not deploy to production yet. Development/local verification only.
```

**Gate before proceeding to Session 2:**
```sql
-- Run in Supabase Studio (localhost:54323)
SELECT COUNT(*) FROM items;         -- Must be > 0
SELECT COUNT(*) FROM pricebooks;    -- Must be > 0
SELECT COUNT(*) FROM categories;    -- Must be > 0
```

**Linear action after gate passes:** Mark UNB-72, UNB-73, UNB-88 → Done.

---

### Session 2: App Backend Agent

**Linear: Mark UNB-74, UNB-82, UNB-83, UNB-89, UNB-90, UNB-91, UNB-92 → In Progress before you paste this prompt.**

**Only start after Session 1 gate passes. Open Claude Code and paste:**

```
You are the App Backend Agent for the WineYard Digital Catalog project.

## Your context
Read this file completely before writing any code:
  planning/WineYard_Architecture_v2.md  (sections 6, 7, 9, and both appendices)

The database schema is already live. Types are in types/database.generated.ts.
Sync functions are already built in /supabase/functions/.

## Your directory boundary
You work ONLY in:
  /app/src/lib/
  /app/src/app/api/
  /app/src/middleware.ts

You do NOT touch:
  /app/src/app/(pages)/  or  /app/src/components/  or  /supabase/

## Linear issues you are closing
UNB-90 — session middleware + cookie validation
UNB-83 — OTP auth generation
UNB-89 — OTP verification route /api/auth/verify
UNB-82 — WhatsApp webhook
UNB-74 — Catalog API with pricing resolution
UNB-91 — Enquiry route
UNB-92 — Admin route

## Your tasks (complete in this order)

### Task 1 [UNB-90]: Supabase server client (app/src/lib/supabase/server.ts)
Create a server-side Supabase client using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
Also create app/src/lib/supabase/client.ts for browser-side use (anon key).

### Task 2 [UNB-90]: Auth lib (app/src/lib/auth.ts)
Implement:
- getSession(token: string): validates token in sessions table, returns SessionPayload | null
- requireSession(request: NextRequest): reads session_token cookie, calls getSession, throws 401 if invalid
- getGuestSession(token: string): validates guest_token in guest_sessions table, returns GuestPayload | null
- setSessionCookie(response: NextResponse, token: string): sets HttpOnly Secure SameSite=Lax cookie

### Task 3 [UNB-82]: Zoho lib (app/src/lib/zoho.ts)
Implement (these are ad-hoc Zoho calls from Next.js API routes, NOT the sync jobs):
- getContactByPhone(phone: string): single contact lookup for webhook handler
- createEstimate(contactId, lineItems, notes): creates estimate in Zoho Books
Both use the same token refresh logic reading from zoho_tokens table.

### Task 4 [UNB-82]: WhatsApp lib (app/src/lib/whatsapp.ts)
Implement:
- sendText(to: string, body: string): sends plain text WhatsApp message
- sendOtpMessage(to: string, name: string, refId: string, otp: string, appUrl: string): sends OTP + catalog link as two separate messages
- sendGuestLink(to: string, guestToken: string, appUrl: string): sends 24h guest link
- sendQuotation(to: string, estimateNumber: string, items: CartItem[], totals): sends formatted quotation

### Task 5 [UNB-74]: Pricing lib (app/src/lib/pricing.ts)
Implement:
- resolvePrice(zohoContactId: string, items: CatalogItem[]): returns items with final_price populated
  Uses the SQL join query from architecture §5:
  SELECT i.*, COALESCE(pb.custom_rate, i.base_rate) AS final_price,
    CASE WHEN pb.custom_rate IS NOT NULL THEN 'custom' ELSE 'base' END AS price_type
  FROM items i
  LEFT JOIN contacts c ON c.zoho_contact_id = :contact_id
  LEFT JOIN pricebooks pb ON pb.zoho_item_id = i.zoho_item_id
    AND pb.zoho_pricebook_id = c.pricebook_id
  WHERE i.status = 'active'

### Task 6 [UNB-82 + UNB-83]: Webhook route (app/src/app/api/webhook/route.ts)
Implement GET (hub verification) and POST (inbound message handler):
- Validate X-Hub-Signature-256 HMAC-SHA256 on every POST — reject mismatches with 403
- Extract phone + message text from Meta webhook payload
- Rate limit: if auth_request created for this phone in last 5 min → skip (return 200 silently)
- Look up contacts table by phone:
  - Found → create auth_request (ref_id: 8-char hex, 1hr; otp_code: 6-digit, 10min expiry) → sendOtpMessage
  - Not found → check Zoho getContactByPhone
    - Found in Zoho → INSERT into contacts → create auth_request → sendOtpMessage
    - Not in Zoho → INSERT guest_session (24h token) → sendGuestLink
- Always return 200 (Meta requires this — never return non-200 for valid webhook POSTs)

### Task 7 [UNB-89]: Auth verify route (app/src/app/api/auth/verify/route.ts)
POST handler — body: { ref_id, otp_code }
- Validate auth_request exists, is not used, is not expired (both ref_id expiry and otp expiry)
- OTP match → INSERT into sessions (token: UUID, contact_id, expires_at: +30 days) → mark auth_request used → setSessionCookie → return 200
- Wrong OTP → increment attempts → if attempts >= 3 mark auth_request used → return 401 with { error, attempts_remaining }
- Expired OTP (10min window) → return 410
- Expired ref_id (1hr window) → return 410

### Task 8 [UNB-74]: Catalog API route (app/src/app/api/catalog/route.ts)
GET handler:
- Read session_token cookie → requireSession → get zoho_contact_id + pricebook_id
- OR: read guest_token query param → getGuestSession → guest flag, no contact_id
- Query items with pricing resolution SQL (see Task 5)
  - Guest: always returns base_rate as final_price, price_type = 'base'
- Support query params: category, brand, q (search via FTS), page, sort
- Return: { items: CatalogItem[], total: number, page: number, hasMore: boolean }

### Task 9 [UNB-91]: Enquiry route (app/src/app/api/enquiry/route.ts)
POST handler — body: EnquiryRequest
- requireSession (guests blocked — return 403)
- Calculate: subtotal = sum(final_price * qty), tax = subtotal * 0.18, total = subtotal + tax
- INSERT into estimates table (status='draft', contact_id, items JSON, subtotal, tax, total)
- Call zoho.createEstimate → UPDATE estimates with zoho_estimate_id + status='sent'
- Call whatsapp.sendQuotation
- Return: { success: true, estimate_number, whatsapp_sent: true }

### Task 10 [UNB-92]: Admin route (app/src/app/api/admin/route.ts)
GET handler:
- Validate Supabase Auth session via supabase.auth.getUser() — reject non-admins with 401
- Return estimates with joined contact data, sorted newest first
- Support query params: status (pending/sent/closed), from_date, to_date, contact_name
PATCH handler — /api/admin/[id]:
- Validate Supabase Auth session
- Update estimate status in DB
- Return updated estimate

### Task 11 [UNB-90]: Middleware (app/src/middleware.ts)
- Protect /admin/* routes: validate Supabase Auth session via @supabase/ssr
  - No session → redirect to /admin/login
- All other routes: pass through (session validation happens in each API route)

## Acceptance criteria
Test each route with curl before finishing. Document all commands in scripts/test-api-routes.sh.

1. Webhook GET: verify_token check returns challenge
2. Webhook POST: valid HMAC + known phone → auth_request row created in DB
3. Webhook POST: valid HMAC + unknown phone → guest_session row created in DB
4. Auth verify POST: correct OTP → 200 + session cookie set
5. Auth verify POST: wrong OTP 3x → 401 + auth_request marked used
6. Catalog GET: valid session → items with correct final_price
7. Catalog GET: guest_token → items with base_rate only
8. Enquiry POST: valid session + cart → estimate in DB + zoho_estimate_id populated
9. Enquiry POST: guest token → 403
10. Admin GET: valid Supabase Auth → estimates list
11. Admin GET: no auth → 401
```

**Gate before proceeding to Session 3:**
```bash
# Run scripts/test-api-routes.sh — all 11 checks must pass
# Spot-check in Supabase Studio:
SELECT * FROM auth_requests ORDER BY created_at DESC LIMIT 3;
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 3;
SELECT * FROM estimates ORDER BY created_at DESC LIMIT 3;
```

**Linear action after gate passes:** Mark UNB-74, UNB-82, UNB-83, UNB-89, UNB-90, UNB-91, UNB-92 → Done.

---

### Session 3: Frontend Agent

**Linear: Mark UNB-75, UNB-76, UNB-77, UNB-78, UNB-79, UNB-84, UNB-85, UNB-86, UNB-93, UNB-94, UNB-95, UNB-96 → In Progress before you paste this prompt.**

**Only start after Session 2 gate passes. Open Claude Code and paste:**

```
You are the Frontend Agent for the WineYard Digital Catalog project.

## Your context
Read this file completely before writing any code:
  planning/WineYard_Architecture_v2.md  (sections 3, 6, 9, 12)

The API routes are live and tested. Types are in types/catalog.ts and types/database.generated.ts.

## Your directory boundary
You work ONLY in:
  /app/src/app/      (pages only — do NOT touch /app/src/app/api/)
  /app/src/components/
  /app/public/
  /next.config.ts    (PWA config only)

You do NOT touch:
  /app/src/app/api/  or  /app/src/lib/  or  /supabase/

## Design rules (strictly follow)
- Primary blue: #0066CC
- CTA green: #059669
- Background: #F8FAFB (pages), #FFFFFF (cards)
- Font: system stack (-apple-system, Segoe UI, Roboto)
- Body text: 14px, headings 16-20px
- 8px grid spacing
- Cards: rounded-xl, soft shadow (0 2px 8px rgba(0,0,0,0.08))
- Mobile-first: design for 390px width, scale up
- Bottom cart bar: always visible on catalog page (food-delivery pattern)
- Max 3 taps from catalog open to enquiry submitted

## Linear issues you are closing
UNB-93 — OTP auth page /auth/[ref_id]
UNB-75, UNB-76, UNB-77, UNB-78, UNB-79 — Main catalog page + components
UNB-84, UNB-85, UNB-86 — Quotation flow
UNB-94 — Guest catalog page
UNB-95 — Admin panel
UNB-96 — Offline PWA

## Your tasks (complete in this order)

### Task 1 [UNB-78]: Cart context (app/src/components/cart/CartContext.tsx)
React context + hook for cart state:
- Add item, remove item, update quantity, clear cart
- Persist to localStorage (survives page refresh)
- Expose: items, total, itemCount, addItem, removeItem, updateQty, clearCart

### Task 2: Shared components
- OfflineBanner.tsx: shown when navigator.onLine === false
- LoadingSkeleton.tsx: gray shimmer cards for loading state (3-4 card grid)
- StockBadge.tsx [UNB-76]: Available (green), Limited (amber), Out of Stock (red/gray)

### Task 3 [UNB-75 + UNB-77]: Catalog components
- ProductCard.tsx: product image (120px height), item_name, sku, final_price with price_type label ("Your Price" or "MRP"), StockBadge, +/- quantity control, Add to Cart button
- ProductGrid.tsx: responsive grid (2 cols mobile, 3 cols tablet), renders ProductCards, loading skeletons
- SearchBar.tsx: text input, debounced 300ms, calls onSearch callback
- CategoryFilter.tsx: horizontal scroll pills, highlights active category
- BrandFilter.tsx: horizontal scroll pills, highlights active brand

### Task 4 [UNB-78]: Cart components
- CartBar.tsx: sticky bottom bar, shows item count + subtotal, tap to open CartSheet
- CartSheet.tsx: slide-up drawer, lists cart items with qty +/-, shows subtotal + GST 18% + total, "Get Quote" CTA button (green, #059669)

### Task 5 [UNB-93]: OTP auth components + page
- app/src/components/auth/OtpForm.tsx: 6 individual digit inputs (auto-advance on input, auto-submit on 6th digit), submit button, error state with attempts_remaining count, locked state after 3 failures
- app/src/app/auth/[ref_id]/page.tsx: server component — validate ref_id via DB query, show /auth/expired if invalid/expired, render OtpForm, handle POST to /api/auth/verify, redirect to /catalog on success
- app/src/app/auth/expired/page.tsx: static page — "This link has expired. Send us a WhatsApp to get a new one." + WABA link

### Task 6 [UNB-75, UNB-77, UNB-78, UNB-79]: Main catalog page (app/src/app/catalog/page.tsx)
- Read session_token cookie (server-side) → redirect to /auth-expired if no valid session
- Fetch initial products from /api/catalog (SSR, first 50 items)
- Render: SearchBar + CategoryFilter + BrandFilter + ProductGrid + CartBar
- Client-side filter/search: updates URL params, re-fetches from /api/catalog
- OfflineBanner shown when offline (service worker serves cached data)
- "Your Price" label for custom-rate items, "MRP" for base-rate items

### Task 7 [UNB-79 + UNB-84 + UNB-85]: Cart submit flow
When "Get Quote" tapped in CartSheet:
- POST to /api/enquiry with cart items
- Loading state: button disabled + spinner
- Success: show confirmation screen — "Quotation #EST-XXXXX sent to your WhatsApp ✓" — clear cart
- Failure: show error toast with retry

### Task 8 [UNB-86]: CONFIRM reply handling (passive — no UI needed)
This is backend-only (webhook handles "CONFIRM" text message). No frontend component required. Mark UNB-86 as done without building UI.

### Task 9 [UNB-94]: Guest catalog page
- app/src/app/guest/[token]/page.tsx: server component — validate guest_session token, redirect to /session-expired if invalid
- app/src/components/catalog/GuestBanner.tsx: sticky non-dismissible banner — "Browsing as guest · Get your pricing on WhatsApp →" + wa.me link to NEXT_PUBLIC_WABA_NUMBER
- Render ProductGrid with base prices (price_type = 'base' for all items)
- Price label: "MRP" only (never "Your Price")
- CartBar hidden, "Add to Cart" button disabled with tooltip: "WhatsApp us to register and get your custom pricing"
- GST not shown to guests — show "Prices + 18% GST" note instead

### Task 10 [UNB-95]: Admin panel
- app/src/app/admin/login/page.tsx: Supabase Auth email/password form (use @supabase/ssr)
- app/src/app/admin/enquiries/page.tsx: fetch from /api/admin, render EnquiryTable
- app/src/components/admin/EnquiryTable.tsx: columns: estimate_number, contact_name, phone, item_count, total (incl. GST), status badge, created_at — click row to expand
- app/src/components/admin/EnquiryDetail.tsx: modal/drawer — full item breakdown, StatusSelect dropdown (pending → sent → closed), calls PATCH /api/admin/[id]
- Auto-refresh every 30 seconds
- Middleware already handles auth redirect (built in Session 2)

### Task 11 [UNB-96]: PWA setup
- next.config.ts: wrap with withPWA({ dest: 'public', skipWaiting: true, runtimeCaching for images + pages })
- app/public/manifest.json: name "WineYard Catalog", short_name "WineYard", display: standalone, theme_color: #0066CC, background_color: #F8FAFB, icons (192, 512)
- app/public/icons/: placeholder PNG icons for 192x192 and 512x512
- app/src/app/offline/page.tsx: "You're offline. Your catalog is cached. Connect to submit enquiries."
- app/src/app/layout.tsx: add viewport meta, theme-color meta, <link rel="manifest">
- Cache strategy: catalog pages and images cache-first; /api/* network-only; /admin/* network-only

## Acceptance criteria
Open on Chrome DevTools → iPhone SE viewport and verify:
1. Catalog loads in < 3s on throttled mobile network
2. Products show correct pricing — custom price + "Your Price" for registered, base + "MRP" for guest
3. Add items → CartBar updates → CartSheet opens → "Get Quote" → WhatsApp quotation received within 5s
4. OTP flow: open /auth/[valid_ref_id] → enter OTP → redirect to /catalog ✓
5. Guest flow: open /guest/[valid_token] → base prices + GuestBanner → cart disabled ✓
6. Admin: /admin/login → login → EnquiryTable → update status ✓
7. PWA: Lighthouse score ≥ 90 in production build
8. Offline: disconnect network → catalog shows cached products ✓
```

**Gate before proceeding to Session 4:**
Run all 8 acceptance criteria manually. Only proceed if all pass.

**Linear action after gate passes:** Mark UNB-75, UNB-76, UNB-77, UNB-78, UNB-79, UNB-84, UNB-85, UNB-86, UNB-93, UNB-94, UNB-95, UNB-96 → Done.

---

### Session 4: Integration & Polish (You drive this one)

After all three agents complete, run the full flow yourself:

```
Manual checklist:
□ Send WhatsApp from registered number → receive OTP + link within 5s
□ Open link → enter OTP → land on catalog
□ Search for a product → correct results
□ Filter by category → correct results
□ Add 2-3 items → correct prices + "Your Price" label
□ Open CartSheet → correct GST calc → "Get Quote" → WhatsApp quotation received
□ Open /admin → see the enquiry → update status to "sent"
□ Send WhatsApp from unregistered number → receive guest link within 5s
□ Open guest catalog → MRP prices + GuestBanner → cart disabled
□ Disconnect WiFi → open catalog → cached products visible
□ Reply "CONFIRM" to WhatsApp quotation → estimate status updates in DB
```

**Linear action:** Mark UNB-80 and UNB-87 → Done on sign-off.

For anything that breaks, open a targeted Claude Code session:
```
There's a bug in [component/route]. Here's what's happening: [describe].
The relevant code is in [file path].
Architecture context is in planning/WineYard_Architecture_v2.md.
Fix only this file. Do not touch anything else.
```

---

## Part 4: Context File for Every Claude Code Session

Create this file once and paste it at the start of any new or bug-fix Claude Code session:

**`docs/claude-context.md`**

```markdown
# WineYard Digital Catalog — Claude Code Context

## Project
B2B digital catalog for WineYard Technologies (CCTV distributor, Hyderabad).
~1,000 integrators. Stack: Next.js 15 + Supabase + Vercel + Meta WhatsApp API.

## Architecture
Full architecture: planning/WineYard_Architecture_v2.md  ← READ THIS FIRST

## Stack
- Frontend: Next.js 15 App Router in /app/
- Database: Supabase PostgreSQL (schema already applied, types in types/)
- Sync: Supabase Edge Functions in /supabase/functions/ (Deno runtime)
- Auth: Custom OTP via WhatsApp (sessions table) + Supabase Auth for /admin
- Search: PostgreSQL full-text + pg_trgm (no Typesense in Phase 1)
- Images: Supabase Storage (items/ and brands/ buckets)
- Hosting: Vercel (Next.js) + Supabase (DB/EF/storage)

## Key constraints
- Zoho Books (India: https://www.zohoapis.in/books/v3/) is source of truth.
  App syncs from Zoho via Edge Functions. Writes estimates + contacts back.
- Single "General" pricebook. Contacts get custom_rate or fall back to base_rate.
- GST is flat 18% hardcoded. No payment collection in Phase 1.
- All WhatsApp messaging via Meta Business Cloud API (WABA is WineYard's personal WABA).
- No Typesense, no Cloudflare R2, no Sentry in Phase 1.
- Lazy contact creation: contacts NOT bulk-synced. Created on-demand on first WhatsApp.

## Repo layout
/app/              → Next.js app (Frontend Agent domain)
/supabase/         → DB migrations + Edge Functions (Sync Agent domain)
/types/            → Shared TypeScript types (read-only for agents)
/scripts/          → Dev utilities (test-zoho-connection.ts, test-whatsapp.ts, trigger-sync.sh)
/planning/         → Architecture docs + setup prompts
/docs/             → claude-context.md (this file)
```

---

## Summary: The One-Page Cheat Sheet

```
SEQUENCE:     Setup ✅ → Sync (Phase 1) → Backend (Phase 2) → Frontend (Phase 3) → Integration (Phase 4)
PARALLEL:     No — sequential for Claude Code beginner
ORCHESTRATE:  You are the orchestrator — no separate agent needed
ARCH FILE:    planning/WineYard_Architecture_v2.md  (not docs/architecture.md)
CONTEXT FILE: docs/claude-context.md  (paste at start of every session)

LINEAR FLOW:
  Before session → mark issues In Progress
  After gate    → mark issues Done

PHASE 1 ISSUES:  UNB-72, UNB-73, UNB-88
PHASE 2 ISSUES:  UNB-74, UNB-82, UNB-83, UNB-89, UNB-90, UNB-91, UNB-92
PHASE 3 ISSUES:  UNB-75, UNB-76, UNB-77, UNB-78, UNB-79, UNB-84, UNB-85, UNB-86, UNB-93, UNB-94, UNB-95, UNB-96
PHASE 4 ISSUES:  UNB-80, UNB-87

GATES:
  After Phase 1: SQL COUNT checks (items, pricebooks, categories)
  After Phase 2: scripts/test-api-routes.sh (11 checks)
  After Phase 3: manual mobile test (8 checks)
  After Phase 4: manual E2E checklist (11 steps)

BUG FIXES:    Targeted single-session: describe bug + file path + expected behavior + reference arch file
```
