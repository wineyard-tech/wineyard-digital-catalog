# WineYard — Agent-Driven Development Guide

**Version:** 1.0
**Date:** March 16, 2026
**Audience:** Phani (solo dev, new to Claude Code agent workflows)

---

## Part 1: The 3-Agent Model — Recommendation

### Should you split Backend/Sync into two agents? Yes.

Your instinct is right and here's why it's clean for this project:

| Agent | Owns | Directory | External deps |
|---|---|---|---|
| **Sync Agent** | Supabase Edge Functions (sync-items, sync-contacts, session-cleanup) | `/supabase/functions/` | Zoho API, Supabase DB |
| **App Backend Agent** | Next.js API routes + server lib | `/app/src/app/api/` + `/app/src/lib/` | Supabase DB, WhatsApp API |
| **Frontend Agent** | Next.js pages + components | `/app/src/app/(pages)/` + `/app/src/components/` | Backend API contracts |

Zero directory overlap between Sync and Backend. Clean separation.

---

### Do you need an Orchestration Agent?

**No. You are the orchestrator.**

Claude Code doesn't have a native "orchestrator spawns sub-agents" pattern the way multi-agent frameworks do. The orchestration is the sequence of sessions you run and the context you give each one. A separate orchestration agent adds complexity without value for this project size.

---

### Can Sync Agent and Backend Agent run in parallel?

**Technically yes. Practically no — for a Claude Code beginner.**

They own different directories so there's no file conflict. But:

1. Both might want to update `/types/` — needs coordination
2. The Backend Agent needs to know what data shape the sync puts in the DB
3. Merging two Claude Code branches back to main requires git confidence
4. If either hits an issue, you're debugging two things at once

**My recommendation: Sequential, not parallel.** The speed gain from parallelism is ~1-2 hours on a 3-week project. The debugging cost of a conflict or type mismatch is higher.

---

### Recommended Execution Order

```
PHASE 0: Setup (already done)
  └── Repo initialized, migrations run, connections validated ✅

PHASE 1: Sync Agent (2-3 hrs)
  └── Build + deploy Edge Functions
  └── Verify data flows into Supabase tables
  └── Gate: DB has real items, contacts, pricebooks from Zoho ✅

PHASE 2: App Backend Agent (3-4 hrs)
  └── Build all API routes + lib utilities
  └── Verify with curl/Postman before frontend touches anything
  └── Gate: all API routes return correct shapes ✅

PHASE 3: Frontend Agent (4-6 hrs)
  └── Build all pages + components against verified APIs
  └── Gate: mobile browser demo works end-to-end ✅

PHASE 4: Integration (1-2 hrs)
  └── You run the full flow manually, fix edge cases
  └── Internal demo sign-off (UNB-80, UNB-87)
```

Frontend MUST wait for Phase 2. There is no shortcut here — building UI against unverified APIs wastes time.

---

## Part 2: Linear Issues — Gap Analysis

### What you have vs. what you need

You have **16 issues** across 2 projects. Here's the honest assessment:

#### Issues that are outdated (architecture has changed)

| Issue | Problem | Fix |
|---|---|---|
| **UNB-83** | References "magic link approach" and "time-limited personalized link" | Update: now OTP + ref_id flow (architecture v2 §9) |
| **UNB-82** | Describes real-time Zoho lookup on every message | Update: now checks Supabase `contacts` first, Zoho only for first-time unknowns |
| **UNB-72** | Described as "fetch catalog layer" (sounds real-time) | Clarify: this is now the `sync-items` Edge Function job, not a live API call |
| **UNB-73** | Described as "fetch all active Contacts" (bulk sync) | Clarify: now lazy creation — only create contacts when they first message |
| **UNB-74** | Described as "override MRP with negotiated rate" at query time | OK as is — this is the pricing resolution query in `/api/catalog` |

#### Issues that are missing entirely

These features are in the architecture but have no Linear issue:

| Missing Feature | Which Agent | Priority |
|---|---|---|
| OTP auth: generate ref_id + 6-digit OTP, send via WhatsApp | App Backend | Urgent |
| OTP auth: `/auth/[ref_id]` page + `/api/auth/verify` route | Frontend + Backend | Urgent |
| Guest session: create 24h token, send catalog link to unknown caller | App Backend | High |
| Guest catalog page: `/guest/[token]` with base prices + register CTA | Frontend | High |
| Admin panel: Supabase Auth login + enquiry management dashboard | Frontend + Backend | High |
| Session middleware: validate cookie on protected routes | App Backend | Urgent |
| pg_cron setup: deploy cron schedules to Supabase after EF deploy | Sync | Urgent |
| sync-items Edge Function: write + test + deploy | Sync | Urgent |
| sync-contacts Edge Function: write + test + deploy | Sync | Urgent |

#### Issues that are fine as-is

UNB-75 (browse UI), UNB-76 (stock badges), UNB-77 (pricing display), UNB-78 (cart), UNB-79 (submit enquiry), UNB-80 (internal demo), UNB-84 (quotation formatter), UNB-85 (deliver quotation), UNB-86 (CONFIRM reply), UNB-87 (E2E test) — all accurately describe work that still needs to happen.

### Should you update Linear before starting?

**Yes, but minimally.** Don't spend a day reorganizing Linear. Do this:

1. **Update UNB-83** description to reflect OTP flow (5 min)
2. **Create 3 new issues** for the auth flow (OTP generation, OTP verification page, guest session) — these are blocking and missing
3. **Leave the rest** as-is — agents will get their context from the architecture doc, not just the Linear issue title

The agents don't need perfect Linear issues. They need the architecture document. Linear is for your own tracking.

---

## Part 3: How to Prompt Claude Code — Step by Step

### The golden rule for agent prompting

> Every Claude Code session must start with: (1) the architecture doc, (2) its specific directory boundary, (3) its specific task list, and (4) acceptance criteria. Without all four, it will go off-script.

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

---

### Session 1: Sync Agent

**Open Claude Code in `wineyard-catalog/` and paste:**

```
You are the Sync Agent for the WineYard Digital Catalog project.

## Your context
Read this file completely before writing any code:
  docs/architecture.md  (sections 2, 5, 8, and the Zoho API appendix)

## Your directory boundary
You work ONLY in:
  /supabase/functions/

You do NOT touch:
  /app/  or  /types/  or  /supabase/migrations/

## Your tasks (complete in this order)

### Task 1: Zoho client (supabase/functions/_shared/zoho-client.ts)
Write a Deno-compatible Zoho API client with:
- getZohoToken(): reads from zoho_tokens table, refreshes if expiring in <5 min, upserts new token
- getItems(page: number): GET /items, paginated, returns ZohoItem[]
- getContactByPhone(phone: string): GET /contacts?phone=X, returns ZohoContact | null
- createEstimate(data): POST /estimates, returns zoho_estimate_id
All Zoho API calls use https://www.zohoapis.in/books/v3/ and Authorization: Zoho-oauthtoken {token}

### Task 2: Supabase client (supabase/functions/_shared/supabase-client.ts)
Write a Deno-compatible Supabase admin client using SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from Deno.env. Export a single `supabase` instance.

### Task 3: sync-items Edge Function (supabase/functions/sync-items/index.ts)
- Serves POST requests (called by pg_cron)
- Verifies Authorization header matches service role key
- Fetches all active items from Zoho (all pages, 200/page)
- Upserts each item into `items` table (onConflict: zoho_item_id)
- If item has locations array: upserts into item_locations table
- Upserts brands from item.brand values into brands table
- Upserts categories from item.category_name values into categories table
- Returns { synced: N, errors: [] }

### Task 4: sync-contacts Edge Function (supabase/functions/sync-contacts/index.ts)
- Serves POST requests (called by pg_cron)
- Fetches only contacts that ALREADY EXIST in Supabase contacts table (lazy creation strategy)
- For each, calls Zoho GET /contacts/{id} to refresh status, pricebook_id, phone
- Upserts into contacts table
- Also syncs pricebook items: GET /pricebooks → upsert into pricebooks table
- Returns { synced: N, errors: [] }

### Task 5: session-cleanup Edge Function (supabase/functions/session-cleanup/index.ts)
- Serves POST requests (called by pg_cron)
- Calls the cleanup_expired_sessions() SQL function
- Returns { deleted: N }

### Task 6: Manual trigger test script (scripts/trigger-sync.sh)
Write a bash script that manually triggers sync-items via HTTP POST to local Supabase Edge Function URL, for development testing.

## Acceptance criteria
Before finishing, verify:
1. `npx supabase functions serve sync-items` starts without TypeScript errors
2. `npx supabase functions serve sync-contacts` starts without TypeScript errors
3. Trigger sync-items manually → items table has rows → confirm with: SELECT COUNT(*) FROM items;
4. Trigger sync-contacts manually → pricebooks table has rows for "General" pricebook

Do not deploy to production yet. Development/local verification only.
```

**Gate before proceeding to Session 2:**
```sql
-- Run in Supabase Studio (localhost:54323)
SELECT COUNT(*) FROM items;         -- Should be > 0
SELECT COUNT(*) FROM pricebooks;    -- Should be > 0
SELECT COUNT(*) FROM categories;    -- Should be > 0
```

---

### Session 2: App Backend Agent

**Only start after Session 1 gate passes. Open Claude Code and paste:**

```
You are the App Backend Agent for the WineYard Digital Catalog project.

## Your context
Read this file completely before writing any code:
  docs/architecture.md  (sections 6, 7, 9, and both appendices)

The database schema is already live. Types are in types/database.generated.ts.
Sync functions are already built in /supabase/functions/.

## Your directory boundary
You work ONLY in:
  /app/src/lib/
  /app/src/app/api/
  /app/src/middleware.ts

You do NOT touch:
  /app/src/app/(pages)/  or  /app/src/components/  or  /supabase/

## Your tasks (complete in this order)

### Task 1: Supabase server client (app/src/lib/supabase/server.ts)
Create a server-side Supabase client using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
Also create app/src/lib/supabase/client.ts for browser-side use (anon key).

### Task 2: Auth lib (app/src/lib/auth.ts)
Implement:
- getSession(token: string): validates token in sessions table, returns SessionPayload | null
- requireSession(request: NextRequest): reads session_token cookie, calls getSession, throws 401 if invalid
- setSessionCookie(response: NextResponse, token: string): sets HttpOnly Secure cookie

### Task 3: Zoho lib (app/src/lib/zoho.ts)
Implement (these are the ad-hoc Zoho calls from Next.js API routes, NOT the sync jobs):
- getContactByPhone(phone: string): single contact lookup for webhook handler
- createEstimate(contactId, lineItems, notes): creates estimate in Zoho Books
Both use the same token refresh logic reading from zoho_tokens table.

### Task 4: WhatsApp lib (app/src/lib/whatsapp.ts)
Implement:
- sendText(to: string, body: string): sends plain text WhatsApp message
- sendOtpMessage(to: string, name: string, refId: string, otp: string, appUrl: string): sends OTP + catalog link
- sendGuestLink(to: string, guestToken: string, appUrl: string, wabaLink: string): sends guest 24h link
- sendQuotation(to: string, estimateNumber: string, items: CartItem[], totals): sends formatted quotation

### Task 5: Pricing lib (app/src/lib/pricing.ts)
Implement:
- resolvePrice(zohoContactId: string, items: CatalogItem[]): returns items with final_price populated
  Uses the SQL join query from architecture §5 (Pricing Resolution)

### Task 6: Webhook route (app/src/app/api/webhook/route.ts)
Implement GET (hub verification) and POST (inbound message handler):
- Validate X-Hub-Signature-256 on POST
- Extract phone + message from Meta payload
- Rate limit: check auth_requests table — if created in last 5 min for this phone, skip
- Look up contacts table by phone
  - Found: create auth_request (ref_id + OTP, 10min/1hr expiry), send OTP message
  - Not found: check Zoho API → if found, INSERT into contacts + create auth_request
  - Not in Zoho: INSERT guest_session (24h), send guest link
- Always return 200

### Task 7: Auth verify route (app/src/app/api/auth/verify/route.ts)
POST handler:
- Body: { ref_id, otp_code }
- Validate auth_request (not used, not expired)
- Check OTP: match → create session → set cookie → return 200
- Wrong OTP → increment attempts → if >= 3 mark used → return 401 with attempts_remaining
- Expired → return 410

### Task 8: Catalog API route (app/src/app/api/catalog/route.ts)
GET handler:
- Read session_token cookie → validate → get zoho_contact_id + pricebook_id
- Query items with pricing resolution (architecture §5 SQL)
- Support query params: category, brand, q (search), page, sort
- Return CatalogItem[] with final_price populated
- Also handle guest sessions (token from query param, returns base prices only)

### Task 9: Enquiry route (app/src/app/api/enquiry/route.ts)
POST handler:
- Validate session (guests cannot submit)
- Calculate subtotal, tax (18%), total
- INSERT into estimates table (status='draft')
- Call zoho.createEstimate → UPDATE estimates with zoho_estimate_id + status='sent'
- Call whatsapp.sendQuotation
- Return { success, estimate_number, whatsapp_sent }

### Task 10: Admin route (app/src/app/api/admin/route.ts)
GET: list estimates (Supabase Auth protected — verify supabase.auth.getUser())
PATCH: update estimate status

### Task 11: Middleware (app/src/middleware.ts)
- Protect /admin/* routes with Supabase Auth (redirect to /admin/login if no session)
- Let all other routes pass through

## Acceptance criteria
Test each route with curl before finishing. Document the curl commands in a file scripts/test-api-routes.sh. Every route must:
1. Return correct HTTP status codes
2. Return shapes matching types/catalog.ts interfaces
3. Reject invalid tokens with 401
4. Webhook always returns 200
```

**Gate before proceeding to Session 3:**
```bash
# Run scripts/test-api-routes.sh
# Every route returns expected response
# Webhook correctly creates auth_request row in DB
# Auth verify correctly creates session + sets cookie
# Catalog API returns items with prices
```

---

### Session 3: Frontend Agent

**Only start after Session 2 gate passes. Open Claude Code and paste:**

```
You are the Frontend Agent for the WineYard Digital Catalog project.

## Your context
Read this file completely before writing any code:
  docs/architecture.md  (sections 3, 6, 9, 12)

Also read these design tokens — they are NON-NEGOTIABLE:
  planning/TraderOps_Quick_Reference_v3.md

The API routes are live. Types are in types/catalog.ts and types/database.generated.ts.

## Your directory boundary
You work ONLY in:
  /app/src/app/   (pages only, NOT /api/)
  /app/src/components/
  /app/public/

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
- Bottom cart bar: always visible (food-delivery pattern)
- Max 3 taps from catalog open to enquiry submitted

## Your tasks (complete in this order)

### Task 1: Cart context (app/src/components/cart/CartContext.tsx)
React context + hook for cart state:
- Add item, remove item, update quantity, clear cart
- Persist to localStorage (survives page refresh)
- Expose: items, total, itemCount, addItem, removeItem, updateQty, clearCart

### Task 2: Shared components
- OfflineBanner.tsx: shown when navigator.onLine === false
- LoadingSkeleton.tsx: gray shimmer cards for loading state (3-4 card grid)
- StockBadge.tsx: Available (green), Limited (amber), Out of Stock (red/gray)

### Task 3: Catalog components
- ProductCard.tsx: image (120px height), item_name, sku, final_price, StockBadge, +/- quantity control, Add to Cart button
- ProductGrid.tsx: responsive grid (2 cols mobile, 3 cols tablet), renders ProductCards, handles loading state with skeletons
- SearchBar.tsx: text input, debounced 300ms, calls onSearch callback
- CategoryFilter.tsx: horizontal scroll pills, highlights active category
- BrandFilter.tsx: horizontal scroll pills, highlights active brand

### Task 4: Cart components
- CartBar.tsx: sticky bottom bar, shows item count + total, tap to open CartSheet
- CartSheet.tsx: slide-up drawer, lists cart items with qty +/-, shows subtotal + GST 18% + total, "Get Quote" CTA button (green)

### Task 5: Auth components
- OtpForm.tsx: 6 individual digit inputs (auto-advance on input), submit button, resend hint, error state showing attempts remaining

### Task 6: Auth pages
- app/src/app/auth/[ref_id]/page.tsx:
  Server component — validate ref_id via DB, show error if invalid/expired
  Renders OtpForm, handles POST to /api/auth/verify, redirects to /catalog on success
- app/src/app/admin/login/page.tsx: Supabase Auth email/password form using @supabase/ssr

### Task 7: Guest catalog page (app/src/app/guest/[token]/page.tsx)
- Validate guest_session token server-side
- Render catalog (ProductGrid) with base prices
- GuestBanner at top: "Browsing as guest (expires [time]). Register for your pricing →" linking to NEXT_PUBLIC_WABA_LINK
- Cart disabled (no CartBar)

### Task 8: Main catalog page (app/src/app/catalog/page.tsx)
- Read session_token cookie (server-side)
- Redirect to /auth-expired if no valid session
- Fetch initial products from /api/catalog (SSR)
- Render: SearchBar + CategoryFilter + BrandFilter + ProductGrid + CartBar
- Client-side filtering updates URL params and re-fetches
- OfflineBanner when offline (service worker cache used)

### Task 9: Cart submit flow
When "Get Quote" tapped in CartSheet:
- POST to /api/enquiry with cart items
- Show loading state (button disabled, spinner)
- On success: show confirmation screen — "Quotation #EST-XXXXX sent to your WhatsApp" + clear cart
- On failure: show error toast

### Task 10: Admin panel (app/src/app/admin/page.tsx)
- Protected by middleware (Supabase Auth)
- Fetch estimates from /api/admin
- EnquiryTable: shows estimate_number, contact_name, phone, total, status, created_at
- StatusSelect: dropdown to update status
- Auto-refresh every 30 seconds

### Task 11: PWA manifest + offline page
- app/public/manifest.json already exists — verify it matches the app
- app/src/app/offline/page.tsx: "You're offline. Your catalog is cached. Connect to submit enquiries."
- app/src/app/layout.tsx: add viewport meta, PWA theme-color, link manifest

## Acceptance criteria
Open on a real mobile device (or Chrome DevTools → iPhone SE viewport) and verify:
1. Catalog loads in < 3 seconds on a mobile network (throttle in DevTools)
2. Products show with correct pricing for test session
3. Add item → CartBar updates → CartSheet opens → "Get Quote" works → WhatsApp quotation received
4. OTP flow: open /auth/[valid_ref_id] → enter OTP → redirect to catalog
5. Guest flow: open /guest/[valid_token] → see catalog with base prices + register banner
6. Admin: /admin/login → login → see enquiries table
7. Offline: disconnect network → catalog still shows cached products
```

---

### Session 4: Integration & Polish (You drive this one)

After all three agents complete, run the full flow yourself:

```
Manual checklist:
□ Send WhatsApp message to your WABA → receive OTP + link
□ Open link → enter OTP → land on catalog
□ Search for a product → correct results
□ Filter by category → correct results
□ Add 2-3 items to cart → correct prices + GST calculation
□ Submit enquiry → receive WhatsApp quotation within 5 seconds
□ Open /admin → see the enquiry → update status
□ Send WhatsApp from unregistered number → receive guest link
□ Open guest catalog → see base prices + register banner
□ Open catalog offline (disconnect WiFi) → products still show
```

For anything that breaks, open a new targeted Claude Code session:
```
"There's a bug in [component/route]. Here's what's happening: [describe].
The relevant code is in [file path]. Fix it. Architecture context is in docs/architecture.md."
```

---

## Part 4: Context File for Every Claude Code Session

Create this file so you don't have to re-explain the project each time:

**`docs/claude-context.md`** — paste at the start of any new Claude Code session:

```markdown
# WineYard Digital Catalog — Claude Code Context

## Project
B2B digital catalog for WineYard Technologies (CCTV distributor, Hyderabad).
~1,000 integrators. Stack: Next.js 15 + Supabase + Vercel + Meta WhatsApp API.

## Architecture
Full architecture: docs/architecture.md (READ THIS FIRST)
Design system: planning/TraderOps_Quick_Reference_v3.md

## Stack
- Frontend: Next.js 15 App Router in /app/
- Database: Supabase PostgreSQL (schema already applied, types in types/)
- Sync: Supabase Edge Functions in /supabase/functions/
- Auth: Custom OTP via WhatsApp (sessions table) + Supabase Auth for admin
- Search: PostgreSQL full-text + pg_trgm
- Images: Supabase Storage

## Key constraints
- Zoho Books is the source of truth. App reads from Zoho via sync, writes estimates/contacts back.
- GST is flat 18% hardcoded. No payment collection in Phase 1.
- All WhatsApp messaging via Meta Business Cloud API.
- No Typesense, no Cloudflare R2 in Phase 1.

## Repo layout
/app/          → Next.js app (Frontend Agent domain)
/supabase/     → DB migrations + Edge Functions (Sync Agent domain)
/types/        → Shared TypeScript types (read-only for both agents)
/scripts/      → Dev utilities
/docs/         → Architecture + context
```

---

## Summary: The One-Page Cheat Sheet

```
SEQUENCE:    Setup ✅ → Sync → Backend → Frontend → Integration
PARALLEL:    No (use sequential for Claude Code beginner)
ORCHESTRATE: You are the orchestrator — no separate agent needed
LINEAR:      Update UNB-83 (magic link→OTP), create 3 new auth issues, leave rest
GATE:        SQL count check after Sync, curl tests after Backend, mobile test after Frontend
CONTEXT:     Every session starts with: docs/architecture.md + specific directory + task list + acceptance criteria
BUGS:        Targeted single-session fixes: describe bug + file path + expected behavior
```
