# WineYard Digital Catalog — Technical Architecture

**Version:** 1.0
**Date:** March 15, 2026
**Scope:** Single-tenant, Phase 1 (WineYard Technologies)
**Audience:** Developer(s), WineYard stakeholders, Claude agent teams

> This document is the authoritative reference for building the WineYard Digital Catalog platform. All architectural decisions, trade-offs, and agent team boundaries are defined here. Read this before writing any code.

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
12. [Agent Team Task Boundaries](#12-agent-team-task-boundaries)
13. [Environment & Deployment](#13-environment--deployment)
14. [Phase 2 Extension Points](#14-phase-2-extension-points)
15. [Risks, Flags & Open Items](#15-risks-flags--open-items)

---

## 1. System Overview

### What We're Building

A mobile-first B2B digital catalog for WineYard Technologies, enabling their ~1,000 CCTV integrators to browse products, see customer-specific pricing, and submit cart enquiries. Quotations are delivered via WhatsApp in under 5 seconds.

### What This Is NOT

- Not a payment collection system (Phase 2)
- Not an automatic order creation system (Phase 2)
- Not a native iOS/Android app (Phase 1 = mobile web / PWA)
- Not multi-tenant (single WineYard instance; multi-tenant hooks included for Phase 2)

### Core Constraint

**Zoho Books is the single source of truth.** All products, pricing, stock, and customer data originate in Zoho. The app reads from Zoho (via sync) and writes back (estimates/enquiries). The app never stores business data independently.

### Phase 1 Scope

| Feature | Included |
|---|---|
| Product catalog (search, filter by category/brand) | ✅ |
| Live stock status (synced 4× daily) | ✅ |
| Customer-specific pricing | ✅ |
| Cart + quantity selection | ✅ |
| WhatsApp magic link authentication | ✅ |
| WhatsApp quotation on cart submission | ✅ |
| Admin panel (view enquiries, mark status) | ✅ |
| Zoho Books sync (products, contacts, pricing) | ✅ |
| Offline catalog browsing (PWA service worker) | ✅ |
| Payment collection | ❌ Phase 2 |
| Automatic Sales Order in Zoho | ❌ Phase 2 |
| Native app | ❌ Phase 2 |

---

## 2. Final Tech Stack

### Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) | Server components, image optimization, API routes, Vercel zero-config |
| **Database** | Supabase (PostgreSQL 15) | Free tier, built-in RLS, realtime, Storage, pg_cron |
| **Sync jobs** | Supabase Edge Functions + pg_cron | 150s timeout (vs Vercel 60s), runs adjacent to DB, no extra platform |
| **Auth** | Custom magic links (sessions table) | Phone-first, WhatsApp-native, no password complexity |
| **Search** | PostgreSQL full-text + pg_trgm | Supabase native, no extra service; see trade-offs in §11 |
| **Image storage** | Supabase Storage → R2 later | Already in stack; R2 migration path documented in §14 |
| **Hosting** | Vercel (Hobby tier → Pro at pilot) | Zero-config, preview deployments, edge CDN |
| **WhatsApp** | Meta Business Cloud API | Direct API, lowest cost, customer-owned number |
| **Skipped** | Cloudflare R2 (Phase 1), Typesense (Phase 1), Railway | Reduce moving parts for 3-week MVP |

### Zoho API Reference

```
Region:       India
Base URL:     https://www.zohoapis.in/books/v3/
Auth URL:     https://accounts.zoho.in/oauth/v2/token
Grant type:   Server-to-server (Self Client → refresh token)
Rate limit:   10,000 calls/day (Elite plan)
Key scopes:
  - ZohoBooks.contacts.READ
  - ZohoBooks.items.READ
  - ZohoBooks.pricebooks.READ
  - ZohoInventory.items.READ  (for location stock if needed)
  - ZohoBooks.estimates.CREATE
  - ZohoBooks.salesorders.READ
```

---

## 3. Architecture Diagram

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTEGRATOR (Mobile)                       │
│                   Android/iOS browser or PWA                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     VERCEL (Frontend)                            │
│                    Next.js 15 App Router                         │
│                                                                  │
│  Pages:                    API Routes:                           │
│  /auth/[token]             POST /api/webhook   ← Meta WhatsApp   │
│  /catalog/[token]          GET  /api/catalog   → products+prices │
│  /admin                    POST /api/enquiry   → create estimate  │
│                            POST /api/auth      → validate token   │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ Supabase JS client            │ Zoho API (ad-hoc)
               │                              │ (webhook only)
               ▼                              ▼
┌──────────────────────────────┐   ┌─────────────────────────────┐
│   SUPABASE                   │   │   ZOHO BOOKS API (India)     │
│                              │   │   zohoapis.in/books/v3/      │
│  PostgreSQL 15               │   │                              │
│  ├── items                   │   │  Source of truth:            │
│  ├── item_locations          │◄──┤  - Products & stock          │
│  ├── contacts                │   │  - Contacts & pricebooks     │
│  ├── contact_persons         │   │  - Historical sales orders   │
│  ├── pricebooks              │   │                              │
│  ├── estimates               │──►│  Writes:                     │
│  ├── sales_orders            │   │  - Estimates (on cart submit) │
│  ├── sessions                │   │                              │
│  ├── categories              │   └─────────────────────────────┘
│  ├── brands                  │
│  └── locations               │   ┌─────────────────────────────┐
│                              │   │   META WHATSAPP CLOUD API    │
│  Edge Functions (Deno):      │   │                              │
│  ├── sync-items (4×/day)     │   │  Inbound: webhook to Vercel  │
│  ├── sync-contacts (1×/day)  │   │  Outbound: magic links +     │
│  └── session-cleanup (1×/day)│   │           quotations         │
│                              │   │                              │
│  pg_cron schedules above     │   │  Cost: ~₹0.50-0.70/          │
│                              │   │        conversation           │
│  Storage:                    │   └─────────────────────────────┘
│  ├── items/ (product images) │
│  └── brands/ (brand logos)   │
└──────────────────────────────┘
```

### Data Flow Summary

```
SYNC FLOW (Zoho → Supabase):
pg_cron (Supabase) → HTTP POST → Edge Function → Zoho Books API
                                               → Upsert to Supabase DB

INTEGRATOR AUTH FLOW:
WhatsApp msg → Meta API → Vercel /api/webhook
            → lookup contact in Supabase
            → create session token
            → Meta API → WhatsApp magic link to integrator

CATALOG BROWSE FLOW:
Browser → Vercel /catalog/[token]
        → validate session (Supabase sessions table)
        → fetch products + customer pricing (Supabase DB)
        → render product grid (SSR + client hydration)

ENQUIRY FLOW:
Cart submit → Vercel /api/enquiry
           → write estimate to Supabase
           → create estimate in Zoho Books
           → Meta API → WhatsApp quotation to integrator
```

---

## 4. Repository Structure

### Decision: Single Monorepo

**Why:** Agent teams work in isolated folders with no file conflicts. Shared TypeScript types prevent interface drift. Single CI/CD pipeline.

```
wineyard-catalog/                    ← GitHub repo root (also local dev dir)
│
├── app/                             ← AGENT 1: FRONTEND
│   ├── src/
│   │   ├── app/                     ← Next.js App Router
│   │   │   ├── api/
│   │   │   │   ├── webhook/
│   │   │   │   │   └── route.ts     ← WhatsApp webhook (GET verify + POST handler)
│   │   │   │   ├── catalog/
│   │   │   │   │   └── route.ts     ← GET products + customer pricing
│   │   │   │   ├── enquiry/
│   │   │   │   │   └── route.ts     ← POST create estimate
│   │   │   │   ├── auth/
│   │   │   │   │   └── route.ts     ← POST validate token, set cookie
│   │   │   │   └── admin/
│   │   │   │       └── route.ts     ← Admin: list enquiries, update status
│   │   │   ├── catalog/
│   │   │   │   └── [token]/
│   │   │   │       └── page.tsx     ← Catalog UI (SSR + client)
│   │   │   ├── auth/
│   │   │   │   └── [token]/
│   │   │   │       └── page.tsx     ← Magic link landing → redirects to catalog
│   │   │   ├── admin/
│   │   │   │   └── page.tsx         ← Admin panel (WineYard internal)
│   │   │   ├── offline/
│   │   │   │   └── page.tsx         ← Offline fallback page
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── catalog/
│   │   │   │   ├── ProductGrid.tsx
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   ├── CategoryFilter.tsx
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   └── StockBadge.tsx
│   │   │   ├── cart/
│   │   │   │   ├── CartBar.tsx      ← Persistent bottom cart
│   │   │   │   ├── CartSheet.tsx    ← Cart detail drawer
│   │   │   │   └── CartContext.tsx  ← Cart state
│   │   │   ├── admin/
│   │   │   │   ├── EnquiryTable.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   └── shared/
│   │   │       ├── OfflineBanner.tsx
│   │   │       └── LoadingSkeleton.tsx
│   │   └── lib/
│   │       ├── supabase/
│   │       │   ├── client.ts        ← Browser Supabase client
│   │       │   └── server.ts        ← Server Supabase client (service role)
│   │       ├── zoho.ts              ← Zoho API: getToken, createEstimate, getContactByPhone
│   │       ├── whatsapp.ts          ← sendWhatsAppText(to, body)
│   │       ├── auth.ts              ← validateSession(token), setSessionCookie
│   │       └── pricing.ts           ← getCustomerPrice(contactId, itemId)
│   ├── public/
│   │   ├── manifest.json            ← PWA manifest
│   │   ├── sw.js                    ← Service worker (offline)
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── supabase/                        ← AGENT 2: BACKEND/SYNC
│   ├── config.toml                  ← Supabase local dev config
│   ├── migrations/                  ← Sequential SQL migrations
│   │   ├── 001_extensions.sql       ← pg_trgm, pg_cron, uuid-ossp
│   │   ├── 002_tables.sql           ← All table CREATE statements
│   │   ├── 003_indexes.sql          ← All indexes
│   │   ├── 004_functions.sql        ← PL/pgSQL functions
│   │   ├── 005_triggers.sql         ← All triggers
│   │   ├── 006_rls.sql              ← Row Level Security policies
│   │   └── 007_cron.sql             ← pg_cron schedules
│   └── functions/
│       ├── _shared/                 ← Shared Deno utilities (NO node_modules)
│       │   ├── zoho-client.ts       ← Zoho API client for Deno
│       │   ├── supabase-client.ts   ← Supabase admin client for Deno
│       │   └── types.ts             ← Deno-compatible type definitions
│       ├── sync-items/
│       │   └── index.ts             ← Sync items + item_locations (4×/day)
│       ├── sync-contacts/
│       │   └── index.ts             ← Sync contacts + pricebooks (1×/day)
│       └── session-cleanup/
│           └── index.ts             ← Delete expired sessions (1×/day)
│
├── types/                           ← SHARED: both agents read, neither owns exclusively
│   ├── database.generated.ts        ← Auto-generated by `supabase gen types`
│   ├── zoho.ts                      ← Zoho Books API response shapes
│   └── catalog.ts                   ← Domain types (CatalogItem, CartItem, etc.)
│
├── scripts/                         ← Local dev helpers
│   ├── generate-types.sh            ← Runs supabase gen types → types/
│   ├── test-zoho-connection.ts      ← Validates Zoho OAuth + first API call
│   ├── test-whatsapp.ts             ← Sends a test WhatsApp message
│   └── seed-local.ts                ← Seeds Supabase local with sample data
│
├── docs/
│   └── architecture.md              ← This document
│
├── .env.local.example               ← All required env vars (no secrets)
├── .gitignore
└── README.md
```

### Critical Rule for Agent Teams

> **Never have two agents edit the same file simultaneously.** Each agent owns its directory. The `types/` folder is read by both but updated only via `scripts/generate-types.sh` or by explicit coordination.

---

## 5. Data Architecture

### Schema at a Glance

| Table | Source | Sync Freq | Purpose |
|---|---|---|---|
| `items` | Zoho Books `/items` | 4×/day | Product catalog |
| `item_locations` | Zoho Books `/items` (locations array) | 4×/day | Per-outlet stock |
| `contacts` | Zoho Books `/contacts` (lazy) | 1×/day + on-demand | Integrator accounts |
| `contact_persons` | Zoho Books `/contacts/{id}` | 1×/day | Team members per integrator |
| `pricebooks` | Zoho Books `/pricebooks` | 1×/day | Custom pricing per integrator |
| `categories` | Derived from `items.category_name` | On sync | Category browser |
| `brands` | Derived from `items.brand` | On sync | Brand filter |
| `locations` | Zoho Books `/locations` | 1×/week | Outlet metadata |
| `estimates` | App-local | N/A (app writes) | Cart enquiries (push to Zoho on submit) |
| `sales_orders` | Zoho Books `/salesorders` | 4×/day | Confirmed orders for "Buy Again" |
| `sessions` | App-local | N/A | Magic link tokens |

### Pricing Resolution

When rendering a price for an integrator:

```sql
SELECT
  i.item_name,
  COALESCE(pb.custom_rate, i.base_rate) AS final_price,
  CASE WHEN pb.custom_rate IS NOT NULL THEN 'custom' ELSE 'base' END AS price_type
FROM items i
LEFT JOIN contacts c ON c.zoho_contact_id = :contact_id
LEFT JOIN pricebooks pb
  ON pb.zoho_item_id = i.zoho_item_id
  AND pb.zoho_pricebook_id = c.pricebook_id
WHERE i.status = 'active';
```

Fallback: if no pricebook assigned → `base_rate`. No null prices displayed.

### Stock Status Labels

```typescript
function getStockStatus(available: number): 'available' | 'limited' | 'out_of_stock' {
  if (available > 10) return 'available';
  if (available > 0)  return 'limited';
  return 'out_of_stock';
}
```

### Lazy Contact Creation

Do NOT bulk-sync all 7,000 Zoho contacts on startup. Instead:

1. Integrator sends WhatsApp "Catalog"
2. Check `contacts` table by phone → if found, proceed
3. If not found → call Zoho `GET /contacts?phone={phone}` to verify
4. If Zoho confirms → insert into `contacts` + `contact_persons` → proceed
5. If Zoho doesn't know this number → reject ("Contact WineYard to register")

Daily sync only updates status of contacts already in Supabase (not bulk import).

---

## 6. Key User Flows

### Flow 1: First-Time Magic Link

```
Integrator WhatsApp → "Catalog"
    │
    ▼
Meta Webhook → POST /api/webhook (Vercel)
    │
    ├─ Extract phone number from message
    ├─ Query contacts table by phone
    │   └─ Not found? → Verify via Zoho API → Insert if valid
    │
    ├─ INSERT into sessions (token = UUID, expires = NOW()+30 days)
    │
    └─ Meta API → Send WhatsApp:
         "Hi [Name]! Here's your catalog link (valid 30 days):
          https://catalog.wineyard.in/auth/[token]"
```

### Flow 2: Catalog Browse

```
Integrator clicks magic link
    │
    ▼
GET /auth/[token] (Next.js page)
    │
    ├─ Server: validate token in sessions table
    │   └─ Expired/invalid? → "Link expired. Send 'Catalog' on WhatsApp"
    │
    ├─ SET HTTP-only cookie: session_token=[token]
    ├─ UPDATE sessions.last_activity_at = NOW()
    │
    └─ REDIRECT to /catalog/[token]

GET /catalog/[token] (Next.js page, SSR)
    │
    ├─ Read session cookie → get zoho_contact_id
    ├─ Fetch items JOIN pricebooks for this contact
    ├─ Render product grid (server-side)
    └─ Hydrate with React for cart interactivity
```

### Flow 3: Cart → Enquiry → WhatsApp Quotation

```
Integrator taps "Get Quote" (cart has items)
    │
    ▼
POST /api/enquiry { items: [...], session_token: cookie }
    │
    ├─ Validate session → get zoho_contact_id
    ├─ INSERT into estimates (status='draft', line_items=cart)
    ├─ POST to Zoho Books /estimates → get zoho_estimate_id
    ├─ UPDATE estimates SET zoho_estimate_id, status='sent'
    │
    └─ Meta API → Send WhatsApp quotation:
         "WineYard Quotation #EST-00042
          ─────────────────────────
          Hikvision 2MP Camera × 10   ₹22,000
          16Ch NVR × 1                ₹14,500
          ─────────────────────────
          Subtotal:  ₹36,500
          GST (18%): ₹6,570
          TOTAL:     ₹43,070
          ─────────────────────────
          Reply YES to confirm or call us."

Response to browser: { success: true, estimate_number: 'EST-00042' }
```

### Flow 4: Zoho Sync (Background)

```
pg_cron fires at 08:00, 12:00, 16:00, 20:00
    │
    ▼
HTTP POST → Supabase Edge Function: sync-items
    │
    ├─ GET Zoho token (refresh if expired, cache 55 min in EF memory)
    ├─ GET /items?filter_by=Status.Active&per_page=200&page=1
    ├─ GET /items?filter_by=Status.Active&per_page=200&page=2 (if >200 items)
    ├─ For each item: UPSERT into items table
    ├─ For each item with locations: UPSERT into item_locations table
    │
    └─ Log sync result to a sync_logs table (optional but recommended)
```

---

## 7. API Design

### Next.js API Routes (`app/src/app/api/`)

#### `GET/POST /api/webhook`

```typescript
// GET — Meta verification handshake
// Query params: hub.mode, hub.verify_token, hub.challenge
// Returns: hub.challenge as plain text if tokens match

// POST — Inbound WhatsApp message
// Body: Meta webhook payload
// Returns: 200 OK (always — Meta retries on non-200)

// Handler logic:
// 1. Validate X-Hub-Signature-256 header (HMAC-SHA256 of body with APP_SECRET)
// 2. Extract phone + message text
// 3. If message contains trigger keyword → run magic link flow
// 4. Respond 200 immediately (process async or inline, <5s total)
```

> ⚠️ **Always return 200 to Meta**, even on errors. Log errors internally. If you return 4xx/5xx, Meta will retry and send duplicate messages.

#### `GET /api/catalog`

```
Query params:
  token      — session token (from cookie, fallback query param)
  category   — filter by category_name
  brand      — filter by brand
  q          — full-text search query
  page       — pagination (default 1, 20 items/page)
  sort       — 'popular' | 'name' | 'price_asc' | 'price_desc'

Response:
{
  items: CatalogItem[],   // includes final_price for this customer
  total: number,
  page: number,
  categories: string[],
  brands: string[]
}
```

#### `POST /api/enquiry`

```
Body: {
  items: Array<{ zoho_item_id, item_name, sku, quantity, rate }>
  notes?: string
}
Cookie: session_token

Response: {
  success: boolean,
  estimate_number: string,   // "EST-00042"
  whatsapp_sent: boolean
}
```

#### `POST /api/auth`

```
Body: { token: string }  ← from magic link URL

Response:
  - 200 + Set-Cookie: session_token=...; HttpOnly; Secure; SameSite=Lax
  - 401 if token expired or not found
  - Redirects to /catalog/[token]
```

### Supabase Edge Functions

These are **not user-facing**. They're called by pg_cron only.

| Function | Trigger | Avg Duration | Calls/Day |
|---|---|---|---|
| `sync-items` | 08:00, 12:00, 16:00, 20:00 IST | ~10-20s | 4 |
| `sync-contacts` | 07:00 IST | ~5-10s | 1 |
| `session-cleanup` | 03:00 IST | <1s | 1 |

All Edge Functions require `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header.

---

## 8. Sync Architecture

### Why Supabase Edge Functions + pg_cron (Not Vercel Cron)

| | Vercel Cron (Hobby) | Supabase EF + pg_cron |
|---|---|---|
| **Max execution time** | 60 seconds | 150 seconds |
| **DB proximity** | Remote (extra network hop) | Co-located (same platform) |
| **Free tier** | 2 cron jobs | Unlimited |
| **Secrets management** | Vercel env vars | Supabase secrets (same place as DB) |
| **Cold starts** | Yes (Vercel serverless) | Minimal (Deno EF warm) |
| **Complexity** | One platform for sync | Two platforms (Vercel + Supabase) |

**Winner: Supabase Edge Functions + pg_cron.** The sync job writes to Supabase DB — it makes sense for it to run inside Supabase.

### pg_cron Schedule Setup

```sql
-- Run in Supabase SQL editor to set up schedules
-- (migration 007_cron.sql)

-- Items sync: 4× daily at 8, 12, 16, 20 IST (2:30, 6:30, 10:30, 14:30 UTC)
SELECT cron.schedule(
  'sync-items',
  '30 2,6,10,14 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.edge_function_url') || '/sync-items',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Contacts sync: daily at 7 IST (1:30 UTC)
SELECT cron.schedule(
  'sync-contacts',
  '30 1 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.edge_function_url') || '/sync-contacts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Session cleanup: daily at 3 AM IST (21:30 UTC previous day)
SELECT cron.schedule(
  'session-cleanup',
  '30 21 * * *',
  $$SELECT cleanup_expired_sessions()$$
);
```

### Zoho API Rate Limit Budget

| Operation | Calls/Run | Runs/Day | Calls/Day |
|---|---|---|---|
| Items sync (pagination) | 2-3 | 4 | 8-12 |
| Contacts sync | 3-5 | 1 | 3-5 |
| Pricebooks sync | 2-3 | 1 | 2-3 |
| WhatsApp webhook (contact lookup) | 0-1 | ~30 | 0-30 |
| Enquiry creation (estimate in Zoho) | 1 | ~20 | 0-20 |
| **Total** | | | **~50-70/day** |
| **Available (Elite plan)** | | | **10,000/day** |
| **Buffer remaining** | | | **~9,930 calls** |

Zoho API calls are not a bottleneck. Rate limiting concern is eliminated.

### Zoho Token Refresh Strategy

The Zoho access token expires every 55 minutes. Edge Functions are stateless; token must be refreshed on each function invocation or cached in Supabase DB.

**Recommended approach — cache in DB:**

```sql
CREATE TABLE zoho_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1,  -- Single row
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Edge Function logic:
```typescript
async function getZohoToken(): Promise<string> {
  const { data } = await supabase
    .from('zoho_tokens')
    .select('access_token, expires_at')
    .single();

  // Refresh if expired or expires in <5 minutes
  if (!data || data.expires_at < new Date(Date.now() + 5 * 60 * 1000)) {
    const newToken = await refreshZohoToken(Deno.env.get('ZOHO_REFRESH_TOKEN')!);
    await supabase.from('zoho_tokens').upsert({
      id: 1,
      access_token: newToken.access_token,
      expires_at: new Date(Date.now() + 55 * 60 * 1000)
    });
    return newToken.access_token;
  }
  return data.access_token;
}
```

---

## 9. Authentication Design

### Magic Link Flow (No Passwords)

```
Phone number = verified identity (WhatsApp guarantees the sender's number)
Token = cryptographically random UUID stored in sessions table
Cookie = HTTP-only, Secure, SameSite=Lax, 30-day expiry
```

### Session Persistence

- Token valid for 30 days from creation
- `last_activity_at` updated on every request
- Token invalidated if inactive >15 days (cleanup job handles this)
- Returning users do NOT need a new link every visit (cookie persists)
- New magic link sent: if cookie expired, or user explicitly requests via WhatsApp

### Rate Limiting on Magic Link Generation

To prevent WhatsApp quota abuse:

```sql
-- Check before generating new token
SELECT COUNT(*) FROM sessions
WHERE phone = :phone
  AND created_at > NOW() - INTERVAL '5 minutes';
-- If count > 0 → skip sending, optionally reply "You already have a valid link"
```

### Admin Panel Access

Admin panel (`/admin`) is for WineYard staff only. Authentication options:

1. **Simple: Hardcoded admin token in env var** — check `ADMIN_TOKEN` cookie. Fast to implement for Phase 1.
2. **Better: Supabase Auth email/password** — for WineYard admin users.

**Recommendation for Phase 1:** Use option 1 (hardcoded env token). Add Supabase Auth in Phase 2 if multiple admin users needed.

---

## 10. Image Storage Strategy

### Phase 1: Supabase Storage

**Bucket:** `items` (public read, private write)

```
items/
├── {zoho_item_id}.jpg       ← Primary product image
└── {zoho_item_id}_2.jpg     ← Additional images (if any)

brands/
└── {brand_slug}.png         ← Brand logos

categories/
└── {category_slug}.png      ← Category icons
```

**During sync:** If Zoho Books item has image URLs, download and re-upload to Supabase Storage. Store Supabase public URL in `items.image_urls`.

**Fallback:** If no image → serve a placeholder SVG (CCTV camera icon).

**URL pattern:**
```
https://<project>.supabase.co/storage/v1/object/public/items/{zoho_item_id}.jpg
```

### Phase 2: Migration to Cloudflare R2

When storage exceeds Supabase free tier (1GB) or CDN performance becomes a concern:

1. Set up R2 bucket with custom domain (`images.catalog.wineyard.in`)
2. Run migration script: download all Supabase Storage objects → upload to R2
3. Update `items.image_urls` values from Supabase URLs to R2 URLs (single UPDATE query)
4. Update Next.js `next.config.ts` `images.domains` to include R2 domain
5. No frontend code changes needed (URL is just a string)

---

## 11. Search Design

### Phase 1: PostgreSQL Full-Text + pg_trgm

**Skipping Typesense for Phase 1.** Reduces moving parts for 3-week MVP.

**Trade-off:**
- ✅ Zero additional service, zero cost
- ✅ Already in Supabase
- ⚠️ Less typo tolerance than Typesense ("camra" may not match "camera")
- ⚠️ No instant/typeahead search (queries take 10-50ms vs Typesense's 1-5ms)
- ❌ Will feel slower than Swiggy-style search at 500+ products with complex queries

**Mitigation:** Enable `pg_trgm` extension which adds trigram similarity. This handles partial matches and minor typos.

```sql
-- Migration 001_extensions.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- GIN index for trigram search on items
CREATE INDEX idx_items_trgm_name ON items USING GIN(item_name gin_trgm_ops);
CREATE INDEX idx_items_trgm_brand ON items USING GIN(brand gin_trgm_ops);
CREATE INDEX idx_items_trgm_sku ON items USING GIN(sku gin_trgm_ops);
```

**Search query:**

```sql
-- Combined full-text + trigram search
SELECT
  i.*,
  ts_rank(i.search_vector, query) AS rank,
  similarity(i.item_name, :q) AS trgm_score
FROM items i, websearch_to_tsquery('english', :q) query
WHERE
  i.status = 'active'
  AND (
    i.search_vector @@ query                         -- Full-text match
    OR i.item_name ILIKE '%' || :q || '%'            -- Partial match
    OR similarity(i.item_name, :q) > 0.3             -- Trigram fuzzy
  )
ORDER BY rank DESC, trgm_score DESC
LIMIT 20;
```

**Phase 2 Typesense addition:** When search quality is a complaint, add Typesense Cloud. The sync job already writes all items to Supabase; adding a Typesense index update is a 1-day addition. No frontend changes — just swap the search API call.

---

## 12. Agent Team Task Boundaries

This section is specifically for Claude Code / AI agent teams working in parallel.

### Agent Assignments

```
AGENT 1: FRONTEND
  Owns: /app/
  Contract: Reads /types/ (never modifies)
  Never touches: /supabase/, /types/database.generated.ts

AGENT 2: BACKEND/SYNC
  Owns: /supabase/
  Contract: Publishes /types/database.generated.ts via supabase gen types
  Never touches: /app/

AGENT 3 (optional): SHARED TYPES
  Owns: /types/zoho.ts, /types/catalog.ts
  Works BEFORE agents 1 & 2 start on features that need new types
  Both agents must pull latest types before starting
```

### Shared Contracts — Define These First

Before any feature coding begins, both agents must agree on these interfaces in `/types/catalog.ts`:

```typescript
// /types/catalog.ts — Define these BEFORE parallel work begins

export interface CatalogItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  brand: string | null;
  category_name: string | null;
  final_price: number;        // After pricebook resolution
  base_rate: number;
  price_type: 'custom' | 'base';
  available_stock: number;
  stock_status: 'available' | 'limited' | 'out_of_stock';
  image_url: string | null;   // Primary image URL
  image_urls: string[];       // All image URLs
  tax_percentage: number;
}

export interface CartItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  rate: number;               // Price at time of cart add
  tax_percentage: number;
  line_total: number;         // quantity × rate
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

export interface SessionPayload {
  zoho_contact_id: string;
  contact_name: string;
  phone: string;
  pricebook_id: string | null;
}
```

### API Contracts — Define These First

Before frontend agent starts building API calls, document the response shapes as TypeScript types. The backend agent implements to the same shape. This prevents integration bugs.

### Migration Sequencing Rule

Only **one agent** runs `supabase db push` or creates new migration files at a time. Migration files are numbered sequentially (`001_`, `002_`, etc.). Two agents creating migrations simultaneously will cause numbering conflicts.

**Rule:** Backend agent owns all migrations. Frontend agent never touches `/supabase/migrations/`.

### Potential Conflict Zones

| File/Area | Risk | Prevention |
|---|---|---|
| `/types/catalog.ts` | Both agents may want to add types | Define upfront; only modify via PR/agreement |
| `/types/database.generated.ts` | Backend agent regenerates after migrations | Frontend agent must not edit this file (it gets overwritten) |
| `.env.local` / environment vars | Both need env vars | List ALL vars in `.env.local.example` first |
| `next.config.ts` | Backend may need to add image domains | Communicate before editing |

---

## 13. Environment & Deployment

### Required Environment Variables

```bash
# .env.local.example — copy to .env.local, fill in secrets

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>            # Safe for browser
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>         # Server-side only, never expose

# Zoho Books (India)
ZOHO_CLIENT_ID=<self-client-id>
ZOHO_CLIENT_SECRET=<self-client-secret>
ZOHO_REFRESH_TOKEN=<refresh-token>                   # Never expires (server-to-server)
ZOHO_ORG_ID=<organization-id>                        # WineYard's Zoho org ID

# Meta WhatsApp
WHATSAPP_TOKEN=<meta-system-user-access-token>
WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_VERIFY_TOKEN=<custom-string-for-webhook-verification>
WHATSAPP_APP_SECRET=<for-HMAC-signature-verification>

# Admin
ADMIN_TOKEN=<random-secure-string>                   # Simple admin auth for Phase 1

# App
NEXT_PUBLIC_APP_URL=https://catalog.wineyard.in      # Production domain
```

### Supabase Edge Function Secrets

Set these in Supabase Dashboard → Project Settings → Edge Functions:
```
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_REFRESH_TOKEN
ZOHO_ORG_ID
SUPABASE_URL                 (auto-set by Supabase)
SUPABASE_SERVICE_ROLE_KEY    (auto-set by Supabase)
```

### Local Development Setup

```bash
# 1. Clone repo
git clone <repo-url> && cd wineyard-catalog

# 2. Install Next.js dependencies
cd app && npm install

# 3. Start local Supabase
npx supabase start       # Starts local Postgres + Edge Functions + Studio

# 4. Run migrations
npx supabase db push

# 5. Generate TypeScript types from DB
./scripts/generate-types.sh

# 6. Seed local data (sample products from items_data.json)
npx ts-node scripts/seed-local.ts

# 7. Copy env file
cp .env.local.example .env.local
# → Fill in Zoho + WhatsApp credentials (use real credentials even locally)

# 8. Start Next.js
cd app && npm run dev    # Runs on localhost:3000
```

### Deployment

**Frontend (Vercel):**
```
1. Connect GitHub repo to Vercel
2. Set Root Directory: app/
3. Add all environment variables in Vercel Dashboard
4. Production domain: catalog.wineyard.in (CNAME → cname.vercel-dns.com)
5. Deploy on every push to main
```

**Database (Supabase):**
```
1. Create project at supabase.com
2. Run migrations: npx supabase db push --linked
3. Set Edge Function secrets
4. Deploy Edge Functions: npx supabase functions deploy
5. Verify pg_cron schedules: SELECT * FROM cron.job;
```

**Meta WhatsApp Webhook:**
```
1. Go to Meta Developer Console
2. Set webhook URL: https://catalog.wineyard.in/api/webhook
3. Set verify token: matches WHATSAPP_VERIFY_TOKEN env var
4. Subscribe to: messages
```

---

## 14. Phase 2 Extension Points

This is a single-tenant architecture. Multi-tenant extensions are documented here so Phase 1 decisions don't block Phase 2.

### Multi-Tenant Migration

```sql
-- Add tenant isolation (single ALTER per table)
ALTER TABLE items        ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE contacts     ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE estimates    ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE sales_orders ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE sessions     ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Enable Row Level Security
ALTER TABLE items    ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_items ON items USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- (repeat for each table)

-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,           -- wineyard.traderops.in
  custom_domain TEXT,              -- catalog.wineyard.in
  zoho_org_id TEXT,
  zoho_refresh_token TEXT,         -- Encrypted
  whatsapp_phone_number_id TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0066CC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Phase 1 all rows will have `tenant_id = NULL` — queries work without the filter. When multi-tenant is activated, backfill with WineYard's tenant_id in a single UPDATE.

### Other Phase 2 Extensions

| Feature | Extension Point |
|---|---|
| **Cashfree payment** | Add `payment_status` to `estimates`; new `/api/payment` route |
| **Typesense search** | Add sync step to `sync-items` Edge Function; swap `/api/catalog` search query |
| **Cloudflare R2 images** | Update `image_urls` values; update `next.config.ts` domains |
| **Supabase Auth (admin)** | Replace `ADMIN_TOKEN` cookie check with `supabase.auth.getUser()` |
| **Realtime enquiry updates** | Subscribe to `estimates` table changes via Supabase Realtime in admin panel (already available, zero code changes to DB) |
| **Native PWA** | `manifest.json` + service worker already scaffolded in `/app/public/` |
| **Auto Sales Order** | On estimate acceptance → POST to Zoho `/salesorders`; already have `convert_estimate_to_salesorder()` SQL function |

---

## 15. Risks, Flags & Open Items

### 🔴 Critical — Address Before Pilot

| # | Risk | Impact | Action |
|---|---|---|---|
| 1 | **Supabase free tier project pauses** after 7 days of inactivity | Catalog goes offline during pilot | Upgrade to Supabase Pro ($25/month) **before pilot starts**. Do not risk this with 10 live integrators. |
| 2 | **WhatsApp Business Account verification** by Meta can take 2-5 business days | Cannot send messages until verified | Submit for verification NOW if not done. Do not wait until Week 2. |
| 3 | **Zoho API location stock** — the `items_data.json` does not show a `locations` array | Item-location table cannot be populated | Test `GET /items/{item_id}` with WineYard's actual API key on Day 1. If no locations, fall back to `available_stock` total only and drop `item_locations` table. |
| 4 | **Zoho Organization ID** not obtained yet | No API calls can succeed | Obtain from WineYard's Zoho Books: Settings → Organization Profile → Organization ID. |

### 🟡 Important — Address in Week 1

| # | Risk | Impact | Action |
|---|---|---|---|
| 5 | **Zoho refresh token**: must be generated using Self Client (server-to-server). If generated with wrong grant type, it will expire and break sync silently | Sync stops; catalog goes stale | Use "Self Client" grant in Zoho API Console. Confirm token type before Day 1. |
| 6 | **WhatsApp message trigger keyword**: no trigger word is documented | Webhook receives all messages — no filtering | Define trigger keywords: "catalog", "Catalog", "CATALOG". Add to webhook handler. Consider multilingual: "कैटलॉग" for Hindi-speaking integrators. |
| 7 | **GST on quotations**: IGST (interstate) vs CGST+SGST (intrastate) logic | Wrong tax on quotation message | Confirm with WineYard: are all customers in Telangana (intrastate), or do they have interstate customers? For Phase 1, assume 18% GST flat. |
| 8 | **No error monitoring** included in stack | Silent failures in sync jobs | Add free Sentry account (Next.js SDK + Deno SDK for Edge Functions). Takes 1 hour to set up. |
| 9 | **Vercel Hobby: 12 serverless functions limit** | Extra API routes may hit limit | Current count: 5 routes (webhook, catalog, enquiry, auth, admin). Fine for Phase 1. Watch if adding more. |

### 🟢 Low Priority — Track But Not Blocking

| # | Item | Note |
|---|---|---|
| 10 | **pg_trgm typo tolerance** may disappoint integrators used to Swiggy search | Plan Typesense for Phase 2 if complaints arise |
| 11 | **Image pipeline**: Zoho Books may not have product images for most items | Phase 1 launch may be text-only catalog. Flag to WineYard early. |
| 12 | **WhatsApp quotation formatting**: Plain text only in Phase 1 | WhatsApp Business template messages can add formatting in Phase 2 |
| 13 | **Offline PWA** service worker conflicts with Next.js App Router | Use `next-pwa` package or Workbox; test carefully before pilot |
| 14 | **Admin panel authentication** (hardcoded token) is not secure for sharing with multiple WineYard staff | Upgrade to Supabase Auth in Phase 2 |

### Open Questions (Require WineYard Input)

1. Does WineYard's Zoho Books return `locations` array in the items API response?
2. How many pricebooks are configured? (Affects sync duration estimate)
3. Do any items have custom fields (warranty, resolution, etc.) that should be displayed?
4. Which phone number will receive the WhatsApp bot messages from integrators?
5. Who is the admin panel user? Single person or multiple staff?

---

## Appendix A: Zoho API Quick Reference

```
Region:  India
Token:   POST https://accounts.zoho.in/oauth/v2/token
         ?refresh_token={token}&client_id={id}&client_secret={secret}&grant_type=refresh_token

Items:   GET https://www.zohoapis.in/books/v3/items?organization_id={org_id}&per_page=200&page=1
Contacts: GET https://www.zohoapis.in/books/v3/contacts?organization_id={org_id}&filter_by=Status.Active
Pricebooks: GET https://www.zohoapis.in/books/v3/pricebooks?organization_id={org_id}
Estimates: POST https://www.zohoapis.in/books/v3/estimates?organization_id={org_id}

Common error — code 57: Wrong domain (.com instead of .in) or wrong scope.
Regenerate token with correct domain.
```

## Appendix B: WhatsApp Quick Reference

```
Send message: POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
Headers: Authorization: Bearer {WHATSAPP_TOKEN}
Body: {
  "messaging_product": "whatsapp",
  "to": "91XXXXXXXXXX",    ← include country code, no +
  "type": "text",
  "text": { "body": "Your message here" }
}

Webhook verification: GET /api/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
  → Return hub.challenge as plain text

Inbound message signature: X-Hub-Signature-256: sha256={HMAC-SHA256(body, APP_SECRET)}
  → Always validate before processing
```

---

*Document last updated: March 15, 2026*
*Next review: After Zoho API access is confirmed (expected March 16, 2026)*
