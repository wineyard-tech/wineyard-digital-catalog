# WineYard Digital Catalog — Technical Architecture

**Version:** 2.0
**Date:** March 15, 2026
**Scope:** Single-tenant, Phase 1 (WineYard Technologies)
**Audience:** Developer(s), WineYard stakeholders, Claude agent teams
**Changes from v1:** OTP auth (Option B), guest user flow, admin panel defined, pricebook simplified, all open items resolved

> This document is the authoritative reference for building the WineYard Digital Catalog. Read this before writing any code.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Final Tech Stack](#2-final-tech-stack)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Repository Structure](#4-repository-structure)
5. [Data Architecture](#5-data-architecture)
6. [Key User Flows](#6-key-user-flows)
7. [API Design](#7-api-design)
8. [Sync Architecture](#8-sync-architecture)
9. [Authentication Design](#9-authentication-design)
10. [Image Storage Strategy](#10-image-storage-strategy)
11. [Search Design](#11-search-design)
12. [Admin Panel](#12-admin-panel)
13. [Agent Team Task Boundaries](#13-agent-team-task-boundaries)
14. [Environment & Deployment](#14-environment--deployment)
15. [Phase 2 Extension Points](#15-phase-2-extension-points)
16. [Risks, Flags & Open Items](#16-risks-flags--open-items)

---

## 1. System Overview

### What We're Building

A mobile-first B2B digital catalog for WineYard Technologies, enabling their ~1,000 CCTV integrators to browse products, see customer-specific pricing, and submit cart enquiries. Quotations are delivered via WhatsApp in under 5 seconds.

**Two user types:**
- **Registered integrators** — in Zoho Books as active contacts. Get custom pricing, persistent sessions, full enquiry flow.
- **Guest visitors** — not in Zoho. Browse catalog with base prices for 24 hours, prompted to register with WineYard.

### Core Constraints

- **Zoho Books is the single source of truth.** Products, pricing, stock, and customer data all originate in Zoho.
- **No Zoho Books config changes.** The app adapts to WineYard's existing data model.
- **Payment = Phase 2.** Phase 1 ends at "intent to order" via WhatsApp quotation.

### Resolved Decisions

| Item | Decision |
|---|---|
| Sync jobs | Supabase Edge Functions + pg_cron |
| Images | Supabase Storage → R2 migration in Phase 2 |
| Search | PostgreSQL full-text + pg_trgm (Typesense Phase 2) |
| Auth | Option B: Short-lived ref_id in URL + 6-digit WhatsApp OTP |
| Admin auth | Supabase Auth (email/password) — Phase 1 |
| Pricebook | Single "General" pricebook in Zoho; contacts either get General or base rate |
| GST | Flat 18% on all items (hardcoded; actual invoice handled in Zoho) |
| WhatsApp trigger | Any inbound message (no keyword required) |
| PWA offline | next-pwa package + service worker |
| Error monitoring | Sentry — add once app is live |
| WhatsApp testing | Use personal WABA for dev; replace with WineYard credentials for production |

### Phase 1 Scope

| Feature | Included |
|---|---|
| Product catalog — search, filter by category/brand | ✅ |
| Live stock status (total available; location-wise pending Zoho confirmation) | ✅ |
| Customer-specific pricing (General pricebook or base rate) | ✅ |
| Cart + quantity selection | ✅ |
| WhatsApp OTP authentication for registered integrators | ✅ |
| Guest browsing (24h, base prices, no enquiry) | ✅ |
| WhatsApp quotation on cart submission | ✅ |
| Admin panel (WineYard staff — view/manage enquiries) | ✅ |
| Zoho sync (products, contacts, pricing) | ✅ |
| Offline PWA (next-pwa, cached catalog) | ✅ |
| Supabase Auth for admin login | ✅ |
| Payment collection | ❌ Phase 2 |
| Automatic Sales Order in Zoho | ❌ Phase 2 |
| Native app | ❌ Phase 2 |

---

## 2. Final Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) | SSR, image optimization, API routes |
| **Database** | Supabase (PostgreSQL 15) | Free tier → Pro before pilot |
| **Sync jobs** | Supabase Edge Functions + pg_cron | 150s timeout, co-located with DB |
| **Auth — integrators** | Custom OTP via WhatsApp (sessions table) | See §9 |
| **Auth — admin** | Supabase Auth (email/password) | Phase 1 |
| **Search** | PostgreSQL FTS + pg_trgm | Typesense Phase 2 |
| **Images** | Supabase Storage | R2 Phase 2 |
| **Hosting** | Vercel (Hobby → Pro at pilot) | |
| **WhatsApp** | Meta Business Cloud API | Personal WABA for dev |
| **Payments** | — | Phase 2 (Cashfree) |
| **Skipped** | Cloudflare R2, Typesense, Railway | Phase 2 |

### Zoho API Reference

```
Region:     India
Base URL:   https://www.zohoapis.in/books/v3/
Auth URL:   https://accounts.zoho.in/oauth/v2/token
Grant type: Self Client (server-to-server, refresh token never expires)
Rate limit: 10,000 calls/day
Key scopes:
  ZohoBooks.contacts.READ
  ZohoBooks.items.READ
  ZohoBooks.pricebooks.READ
  ZohoInventory.items.READ  ← verify if locations API available
  ZohoBooks.estimates.CREATE
  ZohoBooks.salesorders.READ
```

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INTEGRATOR / GUEST (Mobile)                       │
│                   Android/iOS browser or PWA                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VERCEL (Frontend)                               │
│                     Next.js 15 App Router                            │
│                                                                      │
│  Pages:                      API Routes:                             │
│  /auth/[ref_id]              POST /api/webhook   ← Meta WhatsApp     │
│  /auth/[ref_id]/verify       POST /api/auth/verify → validate OTP    │
│  /guest/[token]              GET  /api/catalog   → products+prices   │
│  /catalog                    POST /api/enquiry   → create estimate   │
│  /admin                      GET  /api/admin/*   → admin ops         │
└────────────┬─────────────────────────────────────┬──────────────────┘
             │ Supabase JS client                   │ Zoho API (ad-hoc)
             ▼                                      ▼
┌──────────────────────────────┐      ┌────────────────────────────┐
│         SUPABASE             │      │   ZOHO BOOKS API (India)    │
│                              │      │                             │
│  PostgreSQL 15               │      │  Source of truth:           │
│  ├── items                   │◄─────┤  Products, stock, contacts  │
│  ├── item_locations          │      │  Pricebooks, sales orders   │
│  ├── contacts                │      │                             │
│  ├── contact_persons         │──────►  Writes:                    │
│  ├── pricebooks              │      │  Estimates on cart submit   │
│  ├── estimates               │      └────────────────────────────┘
│  ├── sales_orders            │
│  ├── sessions                │      ┌────────────────────────────┐
│  ├── auth_requests   ← NEW   │      │  META WHATSAPP CLOUD API   │
│  ├── guest_sessions  ← NEW   │      │                            │
│  ├── categories              │      │  Inbound → /api/webhook    │
│  ├── brands                  │      │  Outbound → OTP + links    │
│  ├── locations               │      │           → quotations     │
│  └── zoho_tokens             │      └────────────────────────────┘
│                              │
│  Supabase Auth               │
│  └── admin users (email/pw)  │
│                              │
│  Edge Functions:             │
│  ├── sync-items (4×/day)     │
│  ├── sync-contacts (1×/day)  │
│  └── session-cleanup (1×/day)│
│                              │
│  Storage:                    │
│  ├── items/   (product imgs) │
│  └── brands/  (brand logos)  │
└──────────────────────────────┘
```

### Data Flow Summary

```
SYNC (Zoho → Supabase):
  pg_cron → Edge Function → Zoho API → upsert to Supabase DB

FIRST-TIME AUTH (Registered integrator):
  Any WhatsApp msg → /api/webhook → check Supabase/Zoho
  → create auth_request (ref_id + OTP)
  → WhatsApp: "catalog.wineyard.in/auth/[ref_id]" + "OTP: 123456"

RETURNING AUTH:
  Direct visit → read session cookie → if valid, serve catalog

OTP VERIFICATION:
  User opens /auth/[ref_id] → enters OTP → POST /api/auth/verify
  → create session → set cookie → redirect /catalog

GUEST FLOW:
  Unregistered WhatsApp msg → create guest_session (24h)
  → WhatsApp: "catalog.wineyard.in/guest/[token]" + register CTA

ENQUIRY:
  Cart submit → /api/enquiry → write estimate → Zoho Books
  → WhatsApp quotation to integrator
```

---

## 4. Repository Structure

### Decision: Single Monorepo

Agent teams work in isolated folders with no file conflicts. Shared TypeScript types prevent interface drift.

```
wineyard-catalog/                       ← GitHub repo root
│
├── app/                                ← AGENT 1: FRONTEND
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── webhook/
│   │   │   │   │   └── route.ts        ← WhatsApp inbound (GET verify + POST handler)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── verify/
│   │   │   │   │   │   └── route.ts    ← POST: validate OTP, create session, set cookie
│   │   │   │   │   └── logout/
│   │   │   │   │       └── route.ts    ← POST: clear session cookie
│   │   │   │   ├── catalog/
│   │   │   │   │   └── route.ts        ← GET: products + customer pricing
│   │   │   │   ├── enquiry/
│   │   │   │   │   └── route.ts        ← POST: create estimate + WhatsApp quotation
│   │   │   │   └── admin/
│   │   │   │       └── route.ts        ← GET/PATCH: enquiry list + status updates
│   │   │   ├── auth/
│   │   │   │   └── [ref_id]/
│   │   │   │       ├── page.tsx        ← OTP entry form (registered users)
│   │   │   │       └── verify/
│   │   │   │           └── page.tsx    ← Post-verify redirect handler
│   │   │   ├── guest/
│   │   │   │   └── [token]/
│   │   │   │       └── page.tsx        ← Guest catalog (base prices, 24h banner)
│   │   │   ├── catalog/
│   │   │   │   └── page.tsx            ← Main catalog (authenticated integrators)
│   │   │   ├── admin/
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx        ← Supabase Auth email/password login
│   │   │   │   └── page.tsx            ← Enquiry management dashboard
│   │   │   ├── offline/
│   │   │   │   └── page.tsx            ← PWA offline fallback
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── catalog/
│   │   │   │   ├── ProductGrid.tsx
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── CategoryFilter.tsx
│   │   │   │   ├── BrandFilter.tsx
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   └── StockBadge.tsx
│   │   │   ├── cart/
│   │   │   │   ├── CartBar.tsx         ← Persistent bottom bar (food-delivery pattern)
│   │   │   │   ├── CartSheet.tsx       ← Cart detail drawer
│   │   │   │   └── CartContext.tsx     ← Cart state (localStorage + IndexedDB offline)
│   │   │   ├── auth/
│   │   │   │   ├── OtpForm.tsx         ← 6-digit OTP input
│   │   │   │   └── GuestBanner.tsx     ← "Register to see your pricing" banner
│   │   │   ├── admin/
│   │   │   │   ├── EnquiryTable.tsx
│   │   │   │   └── StatusSelect.tsx
│   │   │   └── shared/
│   │   │       ├── OfflineBanner.tsx
│   │   │       └── LoadingSkeleton.tsx
│   │   └── lib/
│   │       ├── supabase/
│   │       │   ├── client.ts           ← Browser Supabase client (anon key)
│   │       │   └── server.ts           ← Server Supabase client (service role)
│   │       ├── zoho.ts                 ← getToken, createEstimate, getContactByPhone
│   │       ├── whatsapp.ts             ← sendText(to, body), sendOtp(to, otp, refId)
│   │       ├── auth.ts                 ← getSession(cookie), requireSession middleware
│   │       └── pricing.ts             ← resolvePrice(contactId, itemId)
│   ├── public/
│   │   ├── manifest.json               ← PWA manifest
│   │   ├── sw.js                       ← Generated by next-pwa
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   ├── package.json
│   ├── next.config.ts                  ← next-pwa config here
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── supabase/                           ← AGENT 2: BACKEND/SYNC
│   ├── config.toml
│   ├── migrations/
│   │   ├── 001_extensions.sql          ← pg_trgm, pg_cron, uuid-ossp, pg_net
│   │   ├── 002_tables.sql              ← All table CREATE statements
│   │   ├── 003_indexes.sql             ← All indexes
│   │   ├── 004_functions.sql           ← pricing resolution, convert_estimate, cleanup
│   │   ├── 005_triggers.sql            ← updated_at, search_vector, auto-sequences
│   │   ├── 006_rls.sql                 ← Row Level Security policies
│   │   └── 007_cron.sql                ← pg_cron schedules
│   └── functions/
│       ├── _shared/
│       │   ├── zoho-client.ts          ← Deno Zoho API client
│       │   ├── supabase-client.ts      ← Deno Supabase admin client
│       │   └── types.ts                ← Deno-compatible types
│       ├── sync-items/
│       │   └── index.ts                ← Items + item_locations (4×/day)
│       ├── sync-contacts/
│       │   └── index.ts                ← Contacts + pricebooks (1×/day)
│       └── session-cleanup/
│           └── index.ts                ← Expired sessions + auth_requests (1×/day)
│
├── types/                              ← SHARED (both agents read)
│   ├── database.generated.ts           ← Auto-generated: `supabase gen types`
│   ├── zoho.ts                         ← Zoho API response shapes
│   └── catalog.ts                      ← Domain types (CatalogItem, CartItem, etc.)
│
├── scripts/
│   ├── generate-types.sh               ← Runs supabase gen types → types/
│   ├── test-zoho-connection.ts         ← Validates token + items API
│   ├── test-whatsapp.ts                ← Sends test message via WABA
│   └── seed-local.ts                   ← Seeds local Supabase with sample data
│
├── docs/
│   └── architecture.md                 ← This document
│
├── .env.local.example
├── .gitignore
└── README.md
```

---

## 5. Data Architecture

### Schema Overview

| Table | Source | Sync | Purpose |
|---|---|---|---|
| `items` | Zoho `/items` | 4×/day | Product catalog |
| `item_locations` | Zoho `/items` locations | 4×/day | Per-outlet stock (pending verification) |
| `contacts` | Zoho `/contacts` (lazy) | 1×/day + on-demand | Registered integrators |
| `contact_persons` | Zoho `/contacts/{id}` | 1×/day | Sub-contacts per integrator |
| `pricebooks` | Zoho `/pricebooks` (single: "General") | 1×/day | Custom pricing |
| `categories` | Derived from items | On sync | Category nav |
| `brands` | Derived from items | On sync | Brand filter |
| `locations` | Zoho `/locations` | 1×/week | Outlet metadata |
| `estimates` | App-local | App writes → Zoho | Enquiries/quotes |
| `sales_orders` | Zoho `/salesorders` | 4×/day | "Buy Again" data |
| `sessions` | App-local | — | Authenticated integrator sessions |
| `auth_requests` | App-local | — | **NEW: OTP + ref_id pre-auth** |
| `guest_sessions` | App-local | — | **NEW: 24h guest access tokens** |
| `zoho_tokens` | App-local | — | Cached Zoho access token |

### New Tables (v2)

#### `auth_requests` — Pre-authentication OTP records

```sql
CREATE TABLE auth_requests (
  id          BIGSERIAL PRIMARY KEY,
  ref_id      TEXT UNIQUE NOT NULL,         -- 8-char alphanumeric, goes in URL
  phone       TEXT NOT NULL,
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  otp_code    TEXT NOT NULL,                -- 6-digit code
  otp_expires_at  TIMESTAMPTZ NOT NULL,     -- NOW() + 10 minutes
  ref_expires_at  TIMESTAMPTZ NOT NULL,     -- NOW() + 1 hour
  attempts    INTEGER NOT NULL DEFAULT 0,   -- Max 3 before invalidation
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_requests_ref_id ON auth_requests(ref_id)
  WHERE used = FALSE AND ref_expires_at > NOW();
CREATE INDEX idx_auth_requests_phone  ON auth_requests(phone, created_at DESC);
```

**Security properties:**
- `ref_id` in URL alone grants nothing — it only renders the OTP form
- `otp_code` is the actual auth factor (10-min expiry)
- 3 wrong attempts → record marked `used = TRUE` → cannot retry (request new link)
- Rate limit: 1 auth_request per phone per 5 minutes (checked before INSERT)
- Forwarding the link: forwardee sees OTP form but has no OTP → harmless

#### `guest_sessions` — Unregistered visitor tokens

```sql
CREATE TABLE guest_sessions (
  id         BIGSERIAL PRIMARY KEY,
  token      UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL,               -- Whatsapp sender (for analytics)
  expires_at TIMESTAMPTZ NOT NULL,        -- NOW() + 24 hours
  page_views INTEGER DEFAULT 0,           -- Track engagement
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guest_sessions_token ON guest_sessions(token)
  WHERE expires_at > NOW();
```

**Guest access rules:**
- Can browse catalog (all categories, search, filters)
- Sees base prices only (no pricebook pricing)
- Cannot submit enquiries
- Persistent "Register with WineYard" banner + link to WABA

### Pricing Resolution

```sql
-- Single "General" pricebook simplifies this:
-- Contact either has pricebook_id = 'General PB ID' or NULL

SELECT
  i.item_name,
  i.sku,
  COALESCE(pb.custom_rate, i.base_rate)  AS final_price,
  CASE WHEN pb.custom_rate IS NOT NULL THEN 'custom' ELSE 'base' END AS price_type
FROM items i
LEFT JOIN contacts c ON c.zoho_contact_id = :contact_id
LEFT JOIN pricebooks pb
  ON pb.zoho_item_id    = i.zoho_item_id
 AND pb.zoho_pricebook_id = c.pricebook_id
WHERE i.status = 'active'
ORDER BY i.item_name;
```

### Stock Status

```typescript
// Start with total available_stock; location-wise via item_locations after Zoho verification
function getStockStatus(available: number): 'available' | 'limited' | 'out_of_stock' {
  if (available > 10) return 'available';
  if (available > 0)  return 'limited';
  return 'out_of_stock';
}
```

### Lazy Contact Creation

Only sync contacts who actually use the platform:

1. WhatsApp message received → extract phone
2. Look up in Supabase `contacts` table
3. Not found → call Zoho `GET /contacts?phone={phone}`
4. Zoho returns contact → INSERT into `contacts` → proceed as registered
5. Zoho returns nothing → proceed as guest

---

## 6. Key User Flows

### Flow 1: Registered Integrator — First Login

```
Integrator sends ANY message to WineYard WhatsApp
    │
    ▼
POST /api/webhook
    ├── Extract phone from Meta payload
    ├── Check contacts table by phone
    │   └── Not found? → Zoho GET /contacts?phone={phone}
    │       └── Found in Zoho? → INSERT into contacts
    │
    ├── Rate limit check: auth_request created in last 5 min? → skip, optionally reply "Link already sent"
    │
    ├── Generate ref_id (8-char: nanoid or crypto.randomBytes(4).toString('hex'))
    ├── Generate OTP (6-digit: Math.floor(100000 + Math.random() * 900000).toString())
    ├── INSERT auth_requests { ref_id, phone, otp_code, otp_expires = +10min, ref_expires = +1hr }
    │
    └── Meta API → WhatsApp (2 messages or 1 combined):
        "Hi [Name]! Open your WineYard catalog:
         https://catalog.wineyard.in/auth/[ref_id]

         Your OTP: 123456 (valid 10 minutes)"
```

### Flow 2: OTP Verification

```
Integrator opens https://catalog.wineyard.in/auth/[ref_id]
    │
    ▼
GET /auth/[ref_id] (Next.js page, server-side)
    ├── SELECT from auth_requests WHERE ref_id = :ref_id AND used = FALSE AND ref_expires_at > NOW()
    ├── Not found / expired → render "Link expired. Send any message to WineYard on WhatsApp."
    └── Valid → render OtpForm (pre-loaded with ref_id; shows "Enter OTP from WhatsApp")

User enters 6-digit OTP → submits OtpForm
    │
    ▼
POST /api/auth/verify { ref_id, otp_code }
    ├── SELECT auth_request WHERE ref_id = :ref_id AND used = FALSE AND otp_expires_at > NOW()
    ├── Not found / expired → 401 "OTP expired. Request a new link."
    ├── otp_code mismatch → INCREMENT attempts
    │   └── attempts >= 3 → UPDATE used = TRUE → 401 "Too many attempts. Request a new link."
    │   └── attempts < 3  → 401 "Incorrect OTP. X attempts remaining."
    │
    ├── OTP match ✓
    │   ├── UPDATE auth_requests SET used = TRUE
    │   ├── INSERT sessions { zoho_contact_id, phone, expires_at = +30 days }
    │   └── Set-Cookie: session_token=[session.token]; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
    │
    └── 200 → redirect to /catalog
```

### Flow 3: Returning Integrator (No WhatsApp Needed)

```
Integrator opens catalog.wineyard.in directly (bookmarked / PWA)
    │
    ▼
GET /catalog (Next.js page, server-side)
    ├── Read session_token cookie
    ├── SELECT sessions WHERE token = :cookie AND expires_at > NOW()
    │   └── Found → UPDATE last_activity_at = NOW()
    │   └── Not found / expired → redirect to /auth-expired
    │       (shows: "Send any message to WineYard on WhatsApp to log in again")
    │
    └── Render catalog with customer-specific pricing
```

### Flow 4: Guest Visitor (Unregistered)

```
Unregistered person sends WhatsApp message
    │
    ▼
POST /api/webhook
    ├── Phone not in contacts
    ├── Zoho returns nothing → unregistered
    ├── INSERT guest_sessions { phone, expires_at = +24 hours }
    │
    └── WhatsApp:
        "Welcome! Browse our CCTV catalog (24 hours):
         https://catalog.wineyard.in/guest/[token]

         For personalized pricing, contact us to register:
         https://wa.me/91XXXXXXXXXX"

Visitor opens /guest/[token]
    ├── Validate token, not expired
    ├── Render catalog with base prices
    ├── GuestBanner: "You're browsing as a guest. Tap to register for your pricing."
    └── Cannot access cart or enquiry features
```

### Flow 5: Cart → Enquiry → WhatsApp Quotation

```
Registered integrator taps "Get Quote"
    │
    ▼
POST /api/enquiry { items: [...] }  (session cookie present)
    ├── Validate session → get zoho_contact_id, pricebook_id
    ├── Resolve final prices (pricebook or base)
    ├── Calculate: subtotal, tax (18%), total
    ├── INSERT estimates { status='draft', line_items, totals }
    ├── POST Zoho /estimates → get zoho_estimate_id
    ├── UPDATE estimates SET zoho_estimate_id, status='sent'
    │
    └── Meta API → WhatsApp:
        "WineYard Quotation #EST-00042
         ─────────────────────────────
         Hikvision 2MP Dome Camera × 10   ₹22,000
         16 Channel NVR × 1               ₹14,500
         ─────────────────────────────
         Subtotal:   ₹36,500
         GST (18%):  ₹ 6,570
         Total:      ₹43,070
         ─────────────────────────────
         Reply YES to confirm or call us."

Response to browser: { success: true, estimate_number: 'EST-00042' }
```

---

## 7. API Design

### Next.js API Routes

#### `GET + POST /api/webhook`

```typescript
// GET — Meta webhook verification
// Params: hub.mode, hub.verify_token, hub.challenge
// Returns: hub.challenge as plain text (200)

// POST — Inbound WhatsApp message
// ALWAYS return 200. Log errors internally. Never return 4xx/5xx to Meta.
// Validate X-Hub-Signature-256 header before processing.
// Handler:
//   1. Extract sender phone + message body
//   2. Check contacts table → registered or guest flow
//   3. Rate limit check (5 min window per phone)
//   4. Create auth_request or guest_session
//   5. Send WhatsApp response
```

#### `POST /api/auth/verify`

```typescript
// Body:   { ref_id: string, otp_code: string }
// Cookie: none (pre-auth)
// Returns:
//   200 + Set-Cookie → success
//   401 { error: string, attempts_remaining?: number }
//   410 { error: "OTP expired" }
```

#### `GET /api/catalog`

```typescript
// Cookie: session_token (required) OR guest context from page props
// Query:  ?category=&brand=&q=&page=1&sort=popular
// Returns: {
//   items: CatalogItem[],   // includes final_price
//   total: number,
//   categories: string[],
//   brands: string[]
// }
```

#### `POST /api/enquiry`

```typescript
// Cookie: session_token (required — guests cannot enquire)
// Body:   { items: CartItem[], notes?: string }
// Returns: { success: boolean, estimate_number: string, whatsapp_sent: boolean }
```

#### `GET + PATCH /api/admin`

```typescript
// Auth: Supabase Auth session (admin only)
// GET    → list estimates with contact info, sorted by created_at DESC
// PATCH  → update estimate status
```

---

## 8. Sync Architecture

### Why Supabase Edge Functions + pg_cron

| | Vercel Cron (Hobby) | Supabase EF + pg_cron |
|---|---|---|
| Max execution time | 60s | 150s |
| DB proximity | Remote | Co-located |
| Free invocations | 2 cron jobs | 500K/month |
| Secrets location | Vercel dashboard | Supabase dashboard (same as DB) |

### pg_cron Schedules

```sql
-- 007_cron.sql

-- Items + stock: 8:30, 12:30, 16:30, 20:30 IST (3:00, 7:00, 11:00, 15:00 UTC)
SELECT cron.schedule('sync-items', '0 3,7,11,15 * * *', $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-items',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'),
    body    := '{}'::jsonb)
$$);

-- Contacts + pricebooks: 7:00 IST (1:30 UTC)
SELECT cron.schedule('sync-contacts', '30 1 * * *', $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-contacts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'),
    body    := '{}'::jsonb)
$$);

-- Session cleanup: 3:00 IST (21:30 UTC previous day)
SELECT cron.schedule('session-cleanup', '30 21 * * *', $$
  SELECT cleanup_expired_sessions()
$$);
```

### Zoho API Budget

| Operation | Calls/Day | Notes |
|---|---|---|
| Items sync (4×) | 8–12 | Paginated: 200 items/page |
| Contacts sync (1×) | 3–5 | Only updates existing Supabase contacts |
| Pricebooks sync (1×) | 2–3 | Single "General" pricebook |
| WhatsApp webhook contact lookup | 0–30 | Only on first-ever message from new phone |
| Estimate creation | 0–20 | One per cart submission |
| **Total** | **~50–70/day** | **vs 10,000/day limit — 0.7% usage** |

### Zoho Token Caching

```sql
-- zoho_tokens table (single row, upserted by sync functions)
CREATE TABLE zoho_tokens (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Sync functions check expiry before every Zoho call, refresh if within 5 minutes of expiry.

---

## 9. Authentication Design

### Overview: Two-Factor WhatsApp OTP (Option B)

```
Factor 1: ref_id in URL    → proves user received the WhatsApp message
Factor 2: 6-digit OTP      → proves user owns the WhatsApp number
Result:   30-day session cookie (HTTP-only, Secure)
```

### Why This Over Magic Links

| | Magic Link (v1) | OTP + ref_id (v2) |
|---|---|---|
| Steps to auth | 1 tap | Open link + enter OTP |
| Forwarding risk | High (link = full auth) | Low (link + OTP needed separately) |
| Familiarity in India | Moderate | High (every app does OTP) |
| Suitable for custom pricing | Risky | Secure |
| Returning users | Auto (cookie) | Auto (cookie) — same |

The extra step only applies on first login or after session expiry. Returning users see no OTP.

### Token Design

```
ref_id:   8-char hex (crypto.randomBytes(4).toString('hex'))
          → Short, URL-safe, unguessable, 1-hour expiry
          → Grants: render OTP form only

otp_code: 6-digit numeric
          → Expires: 10 minutes
          → Invalidates: after 3 wrong attempts

session:  UUID v4 (gen_random_uuid())
          → Expires: 30 days
          → Invalidates: after 15 days inactivity
```

### Admin Authentication (Supabase Auth)

```
WineYard staff login at /admin/login
→ Supabase Auth email/password (managed by Supabase)
→ Session managed by Supabase JS client
→ Middleware: check supabase.auth.getUser() on all /admin/* routes
→ Admin users created manually in Supabase Dashboard → Auth → Users
```

Phase 1: Create admin users manually for WineYard staff (1–3 people).
Phase 2: Self-service admin user management if WineYard scales their team.

### Session Cleanup

```sql
-- cleanup_expired_sessions() — called by pg_cron daily
DELETE FROM sessions
WHERE expires_at < NOW()
   OR last_activity_at < NOW() - INTERVAL '15 days';

DELETE FROM auth_requests
WHERE ref_expires_at < NOW() OR used = TRUE;

DELETE FROM guest_sessions
WHERE expires_at < NOW();
```

---

## 10. Image Storage Strategy

### Phase 1: Supabase Storage

```
Bucket: items   (public read, authenticated write)
├── {zoho_item_id}.jpg        ← Primary product image
└── {zoho_item_id}_thumb.jpg  ← 300×300 thumbnail (if generated)

Bucket: brands  (public read)
└── {brand_slug}.png          ← Brand logos (Hikvision, CP Plus, Dahua...)
```

**During sync:** If Zoho item has an image URL, download and re-upload to Supabase Storage. Store the Supabase public URL in `items.image_urls`.

**Fallback:** If no image → serve SVG placeholder (CCTV camera icon). Don't show broken images.

**URL pattern:**
```
https://<project>.supabase.co/storage/v1/object/public/items/{zoho_item_id}.jpg
```

### Phase 2: Migration to Cloudflare R2

Migration is a 4-step script with zero frontend changes:
1. Copy all objects from Supabase Storage → R2 bucket
2. `UPDATE items SET image_urls = replace(image_urls::text, 'supabase_url', 'r2_url')::jsonb`
3. Update `next.config.ts` image domains
4. Point `brands/` bucket to R2

---

## 11. Search Design

### Phase 1: PostgreSQL FTS + pg_trgm

**Trade-off vs Typesense:**
- ✅ Zero additional service or cost
- ✅ Already in Supabase
- ⚠️ "camra" won't match "camera" (trigram handles partial matches, not all typos)
- ⚠️ 10–50ms query time (vs Typesense's 1–5ms)

**Mitigation:** pg_trgm trigram similarity handles ~60–70% of real-world typos. Acceptable for Phase 1 with 500 products.

```sql
-- 001_extensions.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- GIN trigram indexes
CREATE INDEX idx_items_trgm_name  ON items USING GIN(item_name  gin_trgm_ops);
CREATE INDEX idx_items_trgm_brand ON items USING GIN(brand      gin_trgm_ops);
CREATE INDEX idx_items_trgm_sku   ON items USING GIN(sku        gin_trgm_ops);
```

**Search query:**
```sql
SELECT i.*, ts_rank(i.search_vector, query) AS rank
FROM items i, websearch_to_tsquery('english', :q) query
WHERE i.status = 'active'
  AND (
    i.search_vector @@ query
    OR i.item_name ILIKE '%' || :q || '%'
    OR similarity(i.item_name, :q) > 0.25
    OR i.sku ILIKE :q || '%'
  )
ORDER BY rank DESC, similarity(i.item_name, :q) DESC
LIMIT 20;
```

**Phase 2:** Add Typesense when search quality complaints arise. The sync-items Edge Function already has all items — adding a Typesense index update is 1 day of work.

---

## 12. Admin Panel

### Purpose

The admin panel is for **WineYard staff** (not integrators) to manage inbound enquiries and track order intent.

### Features (Phase 1)

| Feature | Description |
|---|---|
| Enquiry list | All submitted estimates, newest first |
| Status management | Update estimate status: Draft → Received → Quoted → Confirmed → Fulfilled |
| Contact info | See which integrator submitted, their phone number |
| Item details | Expand to see line items in each enquiry |
| WhatsApp link | Tap to open WhatsApp conversation with that integrator |

### Access

- URL: `catalog.wineyard.in/admin`
- Auth: Supabase Auth (email/password)
- Users: Created manually in Supabase Dashboard → Authentication → Users
- Phase 1: 1–3 WineYard staff accounts

### Middleware

```typescript
// app/src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Verify Supabase Auth session
    const supabase = createServerClient(...)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))
  }
}
```

---

## 13. Agent Team Task Boundaries

### Agent Assignments

```
AGENT 1 — FRONTEND
  Owns:        /app/
  Reads:       /types/ (never modifies database.generated.ts)
  Never:       /supabase/, /types/database.generated.ts

AGENT 2 — BACKEND/SYNC
  Owns:        /supabase/
  Publishes:   /types/database.generated.ts (via `supabase gen types`)
  Never:       /app/

COORDINATION RULE:
  Types contract (/types/catalog.ts) must be agreed before agents
  start on any shared-interface feature.
```

### Shared Contracts (Define Before Parallel Work)

```typescript
// /types/catalog.ts — lock this before coding begins

export interface CatalogItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  brand: string | null;
  category_name: string | null;
  final_price: number;          // Pricebook or base
  base_rate: number;
  price_type: 'custom' | 'base';
  available_stock: number;
  stock_status: 'available' | 'limited' | 'out_of_stock';
  image_url: string | null;
  tax_percentage: 18;           // Hardcoded Phase 1
}

export interface CartItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  rate: number;
  tax_percentage: 18;
  line_total: number;
}

export interface SessionPayload {
  zoho_contact_id: string;
  contact_name: string;
  phone: string;
  pricebook_id: string | null;
}

export interface GuestPayload {
  token: string;
  expires_at: string;
}

export interface EnquiryRequest {
  items: CartItem[];
  notes?: string;
}

export interface EnquiryResponse {
  success: boolean;
  estimate_number: string;
  whatsapp_sent: boolean;
  error?: string;
}
```

### Conflict Prevention Rules

| Risk | Rule |
|---|---|
| Migrations numbering conflict | Only Agent 2 creates migration files. Sequential numbers only. |
| `database.generated.ts` overwrite | Only Agent 2 runs `supabase gen types`. Agent 1 never edits this file. |
| Environment variables | Both agents list all required vars in `.env.local.example` before coding. |
| `next.config.ts` | Agent 1 owns it. Agent 2 communicates any needed changes (e.g. image domains). |
| `types/catalog.ts` | Define upfront. Changes require explicit coordination. |

---

## 14. Environment & Deployment

### Environment Variables

```bash
# .env.local.example

# ─── Supabase ────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>        # Safe for browser
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>     # Server-side only

# ─── Zoho Books (India, Self Client) ─────────────────────────
ZOHO_CLIENT_ID=<self-client-id>
ZOHO_CLIENT_SECRET=<self-client-secret>
ZOHO_REFRESH_TOKEN=<refresh-token>               # Never expires
ZOHO_ORG_ID=<organization-id>                    # WineYard Org ID

# ─── Meta WhatsApp Cloud API ──────────────────────────────────
WHATSAPP_TOKEN=<system-user-access-token>
WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_VERIFY_TOKEN=<custom-string>            # For webhook handshake
WHATSAPP_APP_SECRET=<app-secret>                 # For HMAC signature check

# ─── App ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://catalog.wineyard.in  # Prod domain
NEXT_PUBLIC_WABA_LINK=https://wa.me/91XXXXXXXXXX # WineYard WA link for guest CTA
```

### Supabase Edge Function Secrets

Set in Supabase Dashboard → Edge Functions → Secrets:
```
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN
ZOHO_ORG_ID
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase.

### Local Development

```bash
# 1. Clone and install
git clone <repo> && cd wineyard-catalog/app && npm install

# 2. Start local Supabase
cd .. && npx supabase start

# 3. Run migrations
npx supabase db push

# 4. Generate types
./scripts/generate-types.sh

# 5. Configure env
cp .env.local.example app/.env.local  # Fill in real credentials

# 6. Validate connections
npx ts-node scripts/test-zoho-connection.ts
npx ts-node scripts/test-whatsapp.ts

# 7. Seed data (optional)
npx ts-node scripts/seed-local.ts

# 8. Run Next.js
cd app && npm run dev
```

### Deployment

**Vercel:**
```
Root Directory: app/
Branch:         main (auto-deploy)
Domain:         catalog.wineyard.in → CNAME to cname.vercel-dns.com
Env vars:       Add all from .env.local.example
```

**Supabase:**
```
npx supabase db push --linked          # Run migrations
npx supabase functions deploy          # Deploy all Edge Functions
# Set Edge Function secrets in Dashboard
# Verify pg_cron: SELECT * FROM cron.job;
```

**Meta WhatsApp Webhook:**
```
URL:           https://catalog.wineyard.in/api/webhook
Verify token:  matches WHATSAPP_VERIFY_TOKEN env var
Subscriptions: messages
```

---

## 15. Phase 2 Extension Points

### Multi-Tenant (Single → SaaS)

```sql
-- Add tenant_id column to all data tables (one ALTER each)
ALTER TABLE items     ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE contacts  ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE estimates ADD COLUMN tenant_id UUID REFERENCES tenants(id);
-- (sessions, guest_sessions, auth_requests)

-- Enable Row Level Security
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_items ON items USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Phase 1 rows: backfill with WineYard tenant_id in single UPDATE
```

### Other Phase 2 Items

| Feature | Change Required |
|---|---|
| **Typesense search** | Add index update step in sync-items EF; swap API search query |
| **Cloudflare R2 images** | URL update script + `next.config.ts` domain change |
| **Cashfree payments** | Add `payment_status` to estimates; new `/api/payment` route |
| **WhatsApp Business templates** | Replace plain-text quotation with approved template message |
| **Native PWA install** | `manifest.json` + next-pwa already scaffolded |
| **Auto Sales Order in Zoho** | Add Zoho `/salesorders` POST after estimate acceptance |

---

## 16. Risks, Flags & Open Items

### 🔴 Critical — Before Pilot

| # | Risk | Action |
|---|---|---|
| 1 | **Supabase free tier pauses** after 7 days inactivity | Upgrade to Pro ($25/month) at least 3 days before pilot. Don't risk cold-starts with live integrators. |
| 2 | **Zoho location stock API** — `items_data.json` has no `locations` array | Day 1: test `GET /items/{item_id}` with real credentials. If no locations → use `available_stock` total, drop `item_locations` table for now. |
| 3 | **Zoho Org ID** needed for every API call | Confirm from WineYard Zoho Books: Settings → Organization Profile. Add to `.env.local`. |

### 🟡 Important — Week 1

| # | Risk | Action |
|---|---|---|
| 4 | **WhatsApp number** — phone number ID + system user token | Link WineYard WABA tomorrow. Use personal WABA for dev until then. |
| 5 | **OTP delivery delay** — if WhatsApp delivers OTP message after user opens link, they may not know to check WhatsApp | Consider sending OTP first, then the link as a second message with 1–2 second delay |
| 6 | **GST display** — 18% flat hardcoded | Fine for Phase 1. Add note on quotation: "GST @ 18% (indicative). Final invoice from WineYard." |
| 7 | **Custom fields** — unknown until WineYard confirms | `items.custom_fields JSONB` already in schema. Display in Phase 2 if needed. |
| 8 | **Pricebook data cleanup** — some contacts may have stale/null pricebook_id | Pricing fallback to `base_rate` handles this gracefully. Flag to WineYard during pilot. |
| 9 | **Receiving phone number for admin** — needed for WhatsApp enquiry replies | Confirm with WineYard. Hardcode in env var as `NEXT_PUBLIC_WABA_LINK`. |

### 🟢 Low Priority

| # | Item | Note |
|---|---|---|
| 10 | OTP delivery via WhatsApp is not instant (0.5–2s) | Acceptable. Show "OTP sent to WhatsApp" with spinner. |
| 11 | Image pipeline — Zoho may not have images for all items | Launch with text-only for missing items. Upload via Supabase Storage dashboard if needed urgently. |
| 12 | next-pwa conflicts with App Router | Test service worker carefully. Use `next-pwa` v5 which supports App Router. |
| 13 | Vercel Hobby: 12 function limit | Current routes: 6. Fine for Phase 1. |

### Open (Confirm with WineYard)

- [ ] Does `/items/{item_id}` API return `locations` array? (Day 1 check)
- [ ] Custom fields on items — which ones to display?
- [ ] WineYard admin panel users — names + email addresses for Supabase Auth
- [ ] Receiving phone number / WABA number for guest CTA

---

## Appendix A: Auth Flow Diagram (Sequence)

```
Integrator    WhatsApp      Vercel API      Supabase      Zoho
    │              │              │              │           │
    │──(any msg)──►│              │              │           │
    │              │──POST /webhook►             │           │
    │              │              │──SELECT contacts(phone)─►│
    │              │              │◄──────────── │           │
    │              │              │    (not found? GET /contacts?phone)
    │              │              │──────────────────────────►│
    │              │              │◄──────────────────────────│
    │              │              │──INSERT auth_request──────►│
    │              │              │──INSERT contacts──────────►│
    │              │◄──send msg───│              │           │
    │◄─(link+OTP)──│              │              │           │
    │              │              │              │           │
    │──(opens link)────────────────►             │           │
    │              │              │──SELECT auth_request──────►│
    │◄─(OTP form)──────────────────│              │           │
    │              │              │              │           │
    │──(enters OTP)────────────────►             │           │
    │              │              │──UPDATE auth_req used=T──►│
    │              │              │──INSERT sessions──────────►│
    │◄─(cookie + redirect)─────────│              │           │
    │              │              │              │           │
    │──(loads catalog)─────────────►             │           │
    │              │              │──SELECT items + pricing───►│
    │◄─(product grid)──────────────│              │           │
```

---

## Appendix B: Zoho API Quick Reference

```
Token:      POST https://accounts.zoho.in/oauth/v2/token
            body: refresh_token=X&client_id=X&client_secret=X&grant_type=refresh_token
Items:      GET  https://www.zohoapis.in/books/v3/items?organization_id=X&per_page=200
Contacts:   GET  https://www.zohoapis.in/books/v3/contacts?organization_id=X&filter_by=Status.Active
Pricebooks: GET  https://www.zohoapis.in/books/v3/pricebooks?organization_id=X
Estimates:  POST https://www.zohoapis.in/books/v3/estimates?organization_id=X

Error code 57: Wrong domain (.com vs .in) or wrong scope. Regenerate token.
```

## Appendix C: WhatsApp Quick Reference

```
Send message:
  POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
  Authorization: Bearer {WHATSAPP_TOKEN}
  Body: {
    "messaging_product": "whatsapp",
    "to": "91XXXXXXXXXX",    ← country code, no +
    "type": "text",
    "text": { "body": "..." }
  }

Webhook verify: GET /api/webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
  → Return hub.challenge as 200 plain text

Inbound signature: X-Hub-Signature-256: sha256={HMAC-SHA256(body, APP_SECRET)}
  → Validate before processing every POST
```

---

*Document version: 2.0 | Last updated: March 15, 2026*
*Next review: After Zoho API access confirmed + WhatsApp number linked*
