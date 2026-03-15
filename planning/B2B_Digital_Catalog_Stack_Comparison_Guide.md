# B2B Digital Catalog Stack Comparison — Decision Framework

**For Solo Developers Building Production-Grade Web Apps**

**Last Updated:** March 14, 2026  
**Use Case:** Next.js web app, 500-7000 users, PostgreSQL database, real-time requirements

---

## Executive Summary

This document compares stack options for building a B2B digital catalog platform, optimized for solo developer velocity while maintaining production-grade quality. The core decision points are:

1. **Database + Auth:** Supabase vs Railway + Neon
2. **Search:** Typesense vs Postgres Full-Text Search
3. **Image Storage:** Cloudflare R2 vs Supabase Storage

**TL;DR Recommendation:**
- **Phase 1 (MVP, 2-3 weeks):** Supabase + Typesense + R2
- **Phase 2 (Optimization):** Same stack, add Redis if needed
- **Phase 3 (Scale):** Re-evaluate when hitting real limits (unlikely before 10K users)

**Why this matters:** Wrong stack choice costs 1-2 weeks in migration pain. Right choice = ship fast, scale smoothly.

---

## Part 1: Database + Auth Stack

### Option A: Supabase (PostgreSQL + Auth + Storage All-in-One)

**What You Get:**
- Fully managed PostgreSQL 15
- Built-in authentication (magic links, OAuth, phone auth)
- Row-Level Security (RLS) for multi-tenant data isolation
- Auto-generated REST + GraphQL APIs
- Built-in file storage
- Realtime subscriptions (WebSocket-based)
- Table Editor, SQL Editor, Database logs (excellent DX)
- Supabase CLI for local development

**Architecture:**
```
┌─────────────────┐
│   Next.js App   │
└────────┬────────┘
         │ (Supabase JS Client)
         ▼
┌─────────────────────────────────────┐
│         Supabase Cloud              │
│  ┌──────────────────────────────┐   │
│  │  PostgreSQL 15               │   │
│  │  + Connection Pooler         │   │
│  │  + Row-Level Security (RLS)  │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │  Auth (Magic Links, OAuth)   │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │  Storage (S3-compatible)     │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │  Realtime (WebSockets)       │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Pricing:**

| Tier | Price | Database | Auth | Storage | Bandwidth |
|---|---|---|---|---|---|
| **Free** | $0 | 500 MB | 50K MAU | 1 GB | 5 GB |
| **Pro** | $25/mo | 8 GB | 100K MAU | 100 GB | 250 GB |
| **Team** | $599/mo | 256 GB | 100K MAU | Unlimited | 1 TB |

**In INR:**
- Free: ₹0
- Pro: ₹2,100/month
- Team: ₹50,000/month

**Pros:**
- ✅ **Zero setup time** (5 minutes from signup to running database)
- ✅ **Built-in auth** (magic links, phone, OAuth out of the box)
- ✅ **Row-Level Security** (database-enforced multi-tenancy)
- ✅ **Auto-generated APIs** (REST + GraphQL)
- ✅ **Excellent DX** (Table Editor, SQL Editor, logs)
- ✅ **Local dev** (Supabase CLI runs Postgres + Auth locally)
- ✅ **Connection pooling** (built-in Supavisor)
- ✅ **Realtime** (WebSocket subscriptions for live updates)
- ✅ **TypeScript types** (auto-generated from schema)
- ✅ **Open source** (can self-host if needed)

**Cons:**
- ⚠️ **Vendor lock-in** (auth system is Supabase-specific)
- ⚠️ **Storage costs** ($0.09/GB egress — expensive at scale)
- ⚠️ **Limited customization** (can't run custom Postgres extensions easily)
- ⚠️ **Pro tier jump** (Free → Pro = $25/mo, no middle tier)

**Best For:**
- Solo developers (minimal DevOps)
- 2-3 week MVP timelines
- Multi-tenant SaaS (RLS is killer feature)
- Apps needing auth + database + storage

**Deal Breakers:**
- Need custom Postgres extensions (pgvector, TimescaleDB, etc.)
- High image bandwidth (>100 GB/month egress)
- Already have auth system elsewhere

---

### Option B: Railway + Neon (Separate Database + DIY Auth)

**What You Get:**
- **Neon:** Serverless PostgreSQL (auto-scaling, branch-per-PR)
- **Railway:** Application hosting (run any Docker container)
- **You build:** Authentication, file storage, APIs

**Architecture:**
```
┌─────────────────┐
│   Next.js App   │
│   (on Railway)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│         Neon Database               │
│  ┌──────────────────────────────┐   │
│  │  PostgreSQL 16               │   │
│  │  + Auto-scaling              │   │
│  │  + Branching (dev/staging)   │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
         ▲
         │
┌────────┴────────┐
│  Railway Worker │ (Optional: Cron jobs)
└─────────────────┘

┌─────────────────┐
│  Your Auth Code │ (DIY: JWT, sessions, magic links)
└─────────────────┘

┌─────────────────┐
│  Cloudflare R2  │ (File storage)
└─────────────────┘
```

**Pricing:**

**Neon:**
| Tier | Price | Storage | Compute | Active Hours |
|---|---|---|---|---|
| **Free** | $0 | 512 MB | 0.25 vCPU | 191.9 hrs/mo |
| **Launch** | $19/mo | 10 GB | 0.25 vCPU | Unlimited |
| **Scale** | $69/mo | 50 GB | 4 vCPU | Unlimited |

**Railway:**
| Tier | Price | Resources |
|---|---|---|
| **Developer** | $5/mo | 512 MB RAM, $5 usage credit |
| **Hobby** | $20/mo | Up to $20 usage |

**Total (Railway + Neon):**
- Free tier: ₹0 (Neon free + Railway hobby)
- Production (Scale): ₹1,600/mo (Neon $19 + Railway $20)
- At scale: ₹7,000/mo (Neon $69 + Railway $50)

**Pros:**
- ✅ **No vendor lock-in** (standard Postgres, portable auth code)
- ✅ **Database branching** (dev/staging/prod branches like Git)
- ✅ **Latest Postgres** (Neon runs Postgres 16 vs Supabase 15)
- ✅ **Auto-scaling** (Neon scales compute on demand)
- ✅ **Flexible deployment** (Railway runs any Docker container)
- ✅ **Learning experience** (build auth yourself = deep understanding)
- ✅ **Lower cost** (Phase 2: ₹1,600 vs ₹2,100)

**Cons:**
- ❌ **Build auth yourself** (1-2 days: magic links, sessions, cookies)
- ❌ **Build APIs yourself** (no auto-generated REST/GraphQL)
- ❌ **No RLS** (enforce multi-tenancy in application code = error-prone)
- ❌ **Connection pooling** (need to set up PgBouncer manually)
- ❌ **More DevOps** (manage separate services)
- ❌ **No built-in storage** (use R2 or S3 separately)
- ❌ **Slower iteration** (more code to write = slower MVP)

**Best For:**
- Developers who want full control
- Apps with custom auth requirements
- Projects where learning > shipping speed
- Teams with DevOps expertise

**Deal Breakers:**
- Solo dev with 2-3 week timeline (too much setup)
- Need multi-tenant RLS (hard to build correctly)
- Want auto-generated APIs

---

## Side-by-Side Comparison: Supabase vs Railway+Neon

### 1. Developer Experience (Solo Dev Velocity)

| Aspect | Supabase | Railway + Neon | Winner |
|---|---|---|---|
| **Setup time** | 5 minutes | 20-30 minutes | **Supabase** |
| **Database UI** | ✅ Excellent (Table Editor, SQL Editor, logs) | ⚠️ Neon has basic UI, Railway has logs | **Supabase** |
| **Auth implementation** | ✅ Built-in (0 hours) | ❌ DIY (6-8 hours coding + 2-4 hours debugging) | **Supabase** |
| **API generation** | ✅ Auto-generated REST + GraphQL | ❌ Write all API routes yourself | **Supabase** |
| **Local development** | ✅ Supabase CLI (local Postgres + Auth) | ⚠️ Docker Compose for Postgres | **Supabase** |
| **TypeScript types** | ✅ Auto-generated from schema | ⚠️ Use Drizzle/Kysely to generate | **Tie** |
| **Real-time subscriptions** | ✅ Built-in WebSocket subscriptions | ❌ Build with WebSockets/SSE | **Supabase** |
| **Multi-tenancy (RLS)** | ✅ Database-enforced Row-Level Security | ❌ Enforce in app code (error-prone) | **Supabase** |

**For 2-3 week MVP:** Supabase saves **1-2 days** of auth + API setup work.

---

### 2. Cost Analysis

**Phase 1: Development + Beta (500 products, 50 active users)**

| Service | Supabase | Railway + Neon | Difference |
|---|---|---|---|
| **Database** | Free (500MB) | Free (Neon 512MB) | Tie |
| **Auth** | Free (50K MAU) | Free (DIY) | Tie |
| **Storage** | Free (1GB) | N/A (using R2) | N/A |
| **Worker/Cron** | External (Vercel Cron) | Railway worker ($0-5) | **Supabase -₹0-400** |
| **TOTAL** | **₹0** | **₹0-400** | **Supabase cheaper** |

**Phase 2: Production (500 products, 500 active users)**

| Service | Supabase Pro | Railway + Neon | Difference |
|---|---|---|---|
| **Database** | $25 (8GB, included in Pro) | Neon $19 (10GB Launch) | Railway ₹500 cheaper |
| **Auth** | Included in Pro | Free (DIY) | — |
| **Worker/Cron** | External Vercel Cron | Railway Hobby $20 | **Tie** |
| **Typesense** | External $10 | External $10 | Tie |
| **R2 Images** | External $5 | External $5 | Tie |
| **TOTAL** | **₹2,100/month** | **₹3,300/month** | **Supabase ₹1,200 cheaper** |

Wait, that's wrong. Let me recalculate Railway+Neon:

**Corrected Phase 2:**
- Neon Launch: $19/mo
- Railway Hobby: $20/mo (covers Next.js app + cron workers)
- Total: $39/mo = ₹3,300/month

**Supabase Phase 2:**
- Supabase Pro: $25/mo
- Total: ₹2,100/month

**Winner Phase 2:** Supabase (₹1,200/month cheaper)

**Phase 3: High Volume (7,000 active users, multi-tenant prep)**

| Service | Supabase Pro | Railway + Neon Scale | Difference |
|---|---|---|---|
| **Database** | $25 (8GB) | Neon $69 (50GB Scale) | Neon ₹3,700 more expensive |
| **Auth** | Included | DIY | — |
| **Worker/Cron** | Vercel Cron | Railway $50/mo | Railway ₹2,100 more |
| **Typesense** | $10 | $10 | Tie |
| **R2** | $10 | $10 | Tie |
| **TOTAL** | **₹2,100/month** | **₹11,500/month** | **Supabase ₹9,400 cheaper** |

**Cost Winner:**
- **Phase 1:** Tie (both ₹0)
- **Phase 2:** **Supabase** (₹2,100 vs ₹3,300)
- **Phase 3+:** **Supabase** (flat ₹2,100 vs Neon's aggressive scaling)

**Key Insight:** Neon pricing scales aggressively with database size. Supabase Pro is flat rate up to 8GB, then jumps to Team tier ($599/mo for 256GB). For most B2B catalogs, 8GB is plenty (500K products).

---

### 3. Performance

| Metric | Supabase | Railway + Neon | Notes |
|---|---|---|---|
| **Database query speed** | ~20-50ms | ~20-50ms | Tied (both Postgres) |
| **Connection pooling** | ✅ Supavisor (built-in) | ⚠️ Need PgBouncer (manual) | **Supabase** |
| **Edge location** | Singapore (closest to India) | Neon: AWS Mumbai | **Neon slightly better** |
| **Serverless scaling** | ✅ Auto-scales connections | ✅ Neon auto-scales compute | Tie |
| **Cold start** | ~100ms | ~50ms (Neon faster) | **Neon** |

**Performance Winner:** **Tie** (negligible difference for <10K users)

**Edge Case:** If you need ultra-low latency database queries (<10ms), consider:
- PlanetScale (MySQL, global edge caching)
- CockroachDB (distributed, multi-region)
- But for B2B catalog with cached search, this doesn't matter.

---

### 4. Features Comparison

**Supabase Features You'll Actually Use:**

| Feature | Useful for B2B Catalog? | Alternative on Railway+Neon |
|---|---|---|
| **Auth (magic links)** | ✅ **CRITICAL** (WhatsApp login flow) | Build yourself (1-2 days) |
| **Row-Level Security (RLS)** | ✅ **CRITICAL** (multi-tenant future) | Build in API layer (error-prone) |
| **Auto-generated REST API** | ⚠️ Nice-to-have (saves CRUD boilerplate) | Write Next.js API routes |
| **Real-time subscriptions** | ❌ Not needed Phase 1-2 | N/A |
| **Storage** | ❌ Using R2 instead | N/A |
| **Edge Functions** | ⚠️ Maybe (webhooks, scheduled tasks) | Use Next.js API routes |
| **Database branching** | ❌ Not supported | ✅ Neon has this (dev/staging branches) |

**Railway+Neon Features You'll Actually Use:**

| Feature | Useful? | Alternative on Supabase |
|---|---|---|
| **Database branching** | ✅ Dev/staging/prod branches | Manual: Separate Supabase projects |
| **Flexible deployment** | ✅ Any language/framework | Locked to Postgres + JS ecosystem |
| **Private networking** | ❌ Not needed Phase 1-2 | N/A |
| **Custom Postgres extensions** | ⚠️ If you need pgvector, TimescaleDB | Limited on Supabase |

**Features Winner:** **Supabase** (Auth + RLS are huge time-savers for multi-tenant apps)

---

### 5. Multi-Tenant Migration Path (Critical for Future SaaS)

**Goal:** Convert single-distributor app → multi-distributor platform

**With Supabase (Row-Level Security):**
```sql
-- Step 1: Add tenant_id column to all tables
ALTER TABLE products ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE contacts ADD COLUMN tenant_id INTEGER;
ALTER TABLE orders ADD COLUMN tenant_id INTEGER;

-- Step 2: Enable Row-Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Step 3: Create RLS policy (one line per table)
CREATE POLICY tenant_isolation_products ON products
  FOR ALL
  USING (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::INTEGER);

CREATE POLICY tenant_isolation_contacts ON contacts
  FOR ALL
  USING (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::INTEGER);

-- Done! Database enforces tenant isolation.
-- No API changes needed.
```

**How it works:**
- JWT token contains `tenant_id` claim
- Database automatically filters all queries: `WHERE tenant_id = current_user_tenant`
- **Impossible to forget** — enforced at database level
- **Bulletproof security** — even if you write `SELECT * FROM products`, RLS adds `WHERE tenant_id = X`

**Migration time:** 1-2 days (add columns + RLS policies)

---

**With Railway+Neon (Application-Layer Auth):**
```typescript
// EVERY API route needs manual tenant check
export async function GET(request: Request) {
  const session = await getSession(request);
  
  // Easy to forget this check! 🚨
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const tenantId = session.user.tenantId;
  
  // Easy to forget WHERE clause! 🚨
  const products = await db.query(
    'SELECT * FROM products WHERE tenant_id = $1',
    [tenantId]
  );
  
  return Response.json(products);
}

// Repeat for EVERY API endpoint (100+ routes)
```

**Risks:**
- ❌ One forgotten `WHERE tenant_id = X` → **data leak** (Tenant A sees Tenant B's data)
- ❌ 100+ API routes = 100 places to forget
- ❌ Hard to audit (no central enforcement)
- ❌ Junior dev adds endpoint → forgets tenant check → security breach

**Migration time:** 2-3 weeks (refactor all API routes + add tests to catch missing checks)

**Multi-Tenant Winner:** **Supabase** (RLS is the right way to build multi-tenant SaaS)

---

### 6. Vendor Lock-In Risk

| Aspect | Supabase | Railway + Neon |
|---|---|---|
| **Database portability** | ✅ Postgres dump → any Postgres host | ✅ Standard Postgres | Tie |
| **Auth portability** | ⚠️ Supabase-specific (but can migrate) | ✅ DIY = fully portable | **Railway** |
| **Code portability** | ⚠️ Supabase client library in code | ✅ Standard SQL queries | **Railway** |
| **Migration difficulty** | Medium (1 week: rewrite auth + RLS) | Easy (just change DB connection) | **Railway** |
| **Self-hosting option** | ✅ Supabase is open-source | ✅ Postgres is open-source | Tie |

**Lock-In Winner:** **Railway+Neon** (less vendor-specific code)

**BUT:** Supabase lock-in is overstated:
- Database: Standard Postgres (pg_dump → restore anywhere)
- Auth: 1 week to migrate to NextAuth.js or Clerk
- RLS: Hardest part to migrate (2-3 weeks to API-layer auth)

**Question:** Will you ever actually migrate? Most teams don't unless:
1. Pricing becomes unreasonable (Supabase is competitive)
2. Supabase shuts down (unlikely, well-funded, open-source)
3. You outgrow their limits (Team tier = 256GB, 100K users — that's huge)

**Verdict:** Lock-in is a theoretical risk, not a practical one for 95% of projects.

---

### 7. What You'd Gain by Choosing Railway+Neon

✅ **Less vendor lock-in** (easier to migrate if needed)  
✅ **Learning:** Deep understanding of auth + multi-tenancy  
✅ **Flexibility:** Add any backend service (Redis, queues, workers)  
✅ **Database branching:** Dev/staging/prod branches (great for testing)  
✅ **Latest Postgres:** Postgres 16 vs Supabase's Postgres 15  
✅ **Slightly cheaper** in Phase 2 (₹500/month difference)

---

### 8. What You'd Lose by Choosing Railway+Neon

❌ **1-2 days of dev time** (building auth + magic links)  
❌ **Row-Level Security** (must enforce in API layer — error-prone at scale)  
❌ **Auto-generated APIs** (write all CRUD endpoints yourself)  
❌ **Built-in connection pooling** (need to set up PgBouncer)  
❌ **Local dev environment** (Supabase CLI vs manual Docker setup)  
❌ **Database UI** (Supabase Table Editor >> Neon's basic UI)  
❌ **Real-time subscriptions** (if you need live updates later)

---

### 9. The Real Question: Auth + RLS

This is the **actual** decision point. Everything else is noise.

#### **Supabase Auth (Built-in):**
```typescript
// Sign in with magic link (5 lines)
const { data, error } = await supabase.auth.signInWithOtp({
  phone: '+919876543210'
});

// Get current user (1 line)
const { data: { user } } = await supabase.auth.getUser();

// Magic links, session management, JWT tokens → all handled
```

**Time to implement:** **0 hours** (it just works)

---

#### **Railway+Neon DIY Auth:**
```typescript
// You must build:
// 1. Generate magic link token (UUID)
// 2. Store in sessions table with expiry
// 3. Send via WhatsApp
// 4. Validate token on click
// 5. Set HTTP-only cookie
// 6. Middleware to check cookie on every request
// 7. Refresh token logic
// 8. Handle session expiry
// 9. Clean up old sessions

// app/api/auth/magic-link/route.ts (50+ lines)
export async function POST(req: Request) {
  const { phone } = await req.json();
  
  // Generate token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  // Store in database
  await db.query(
    'INSERT INTO sessions (phone, token, expires_at) VALUES ($1, $2, $3)',
    [phone, token, expiresAt]
  );
  
  // Send WhatsApp
  await sendWhatsApp(phone, `https://app.com/auth/${token}`);
  
  return Response.json({ success: true });
}

// middleware.ts for protected routes (30+ lines)
export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;
  
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  const session = await db.query(
    'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  
  if (!session.rows.length) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Update last activity
  await db.query(
    'UPDATE sessions SET last_activity_at = NOW() WHERE token = $1',
    [token]
  );
  
  return NextResponse.next();
}

// lib/auth.ts utilities (100+ lines)
// ... session validation, refresh tokens, logout, etc.
```

**Time to implement:** **6-8 hours** (if you've done it before)  
**Time to debug:** **2-4 hours** (edge cases: expired tokens, concurrent sessions, cleanup)  
**Total:** **1-2 days**

---

#### **Supabase RLS (Row-Level Security):**
```sql
-- Multi-tenant isolation (built-in, database-enforced)
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::INTEGER);

-- Impossible to forget — DB enforces it
-- No API changes needed
```

**Security:** ✅ **Bulletproof** (enforced at database level)

---

#### **Railway+Neon (API Layer Auth):**
```typescript
// EVERY API route needs this
export async function GET(request: Request) {
  const session = await getSession(request);
  
  // Easy to forget this check! 🚨
  if (!session) return new Response('Unauthorized', { status: 401 });
  
  const tenantId = session.user.tenantId;
  
  // Easy to forget WHERE clause! 🚨
  const products = await db.query(
    'SELECT * FROM products WHERE tenant_id = $1',
    [tenantId]
  );
  
  return Response.json(products);
}

// Repeat for 100+ API endpoints
```

**Security:** ⚠️ **Error-prone** (one forgotten `WHERE tenant_id = X` → data leak)

---

## Final Recommendation: Supabase (for most projects)

**Choose Supabase if:**
- ✅ Solo developer
- ✅ 2-3 week timeline
- ✅ Building multi-tenant SaaS (current or future)
- ✅ Want to ship fast, iterate quickly
- ✅ Value developer experience > flexibility
- ✅ Need auth + database + storage in one place

**Choose Railway+Neon if:**
- ✅ Team has DevOps expertise
- ✅ Timeline is flexible (4-6 weeks)
- ✅ Want full control over auth logic
- ✅ Need custom Postgres extensions (pgvector, TimescaleDB)
- ✅ Learning is more important than shipping speed
- ✅ Already have auth system elsewhere

**For WineYard Digital Catalog:** **Supabase** is the right choice.
- Solo dev, 2-3 week timeline → Supabase saves 1-2 days
- Multi-tenant future → RLS is the right architecture
- Cost: ₹2,100/month (cheaper than Railway+Neon at scale)

---

## Part 2: Search Stack

### Option A: Typesense (Recommended)

**What is Typesense?**
- Open-source search engine (like Elasticsearch, but simpler)
- Typo tolerance built-in
- Sub-10ms latency
- Faceted search (filters + counts)

**Why Not Just Use Postgres Full-Text Search?**

| Feature | Typesense | Postgres `tsvector` |
|---|---|---|
| **Typo tolerance** | ✅ "camra" → "camera" | ❌ Exact match only |
| **Fuzzy matching** | ✅ "hikvison" → "hikvision" | ❌ No fuzzy search |
| **Search speed** | ✅ <10ms | ⚠️ 50-200ms |
| **Relevance ranking** | ✅ BM25 algorithm | ⚠️ Basic ranking |
| **Faceted search** | ✅ Brand counts, category counts | ❌ Manual COUNT queries |
| **Highlighting** | ✅ Automatic match highlighting | ❌ Manual |
| **Multi-language** | ✅ Supports 30+ languages | ⚠️ Limited |

**Example: Typo Tolerance in Action**

```javascript
// User types: "camra hikvison 2mp"
// (Typos: "camra" = camera, "hikvison" = hikvision)

// Typesense search
const results = await typesense
  .collections('items')
  .documents()
  .search({
    q: 'camra hikvison 2mp',
    query_by: 'item_name,brand,description',
    typo_tokens_threshold: 2 // Allow 2 typos
  });

// Returns: "Hikvision 2MP Camera" ✅

// Postgres full-text search
const results = await db.query(`
  SELECT * FROM items
  WHERE search_vector @@ to_tsquery('english', 'camra & hikvison & 2mp')
`);

// Returns: 0 results ❌ (exact match only)
```

**Pricing:**

| Tier | Price | Memory | Operations |
|---|---|---|
| **Free** | $0 | 8 GB | 20M ops/month |
| **Starter** | $0.03/hour | 8 GB | 20M ops/month |
| **Production** | ~$22/month | 8 GB | 20M ops/month |

**In INR:** ₹1,850/month

**When to Use Typesense:**
- ✅ Users make typos (mobile typing, non-native English speakers)
- ✅ Product names are complex (brand names, model numbers)
- ✅ Need faceted search (filter by brand, category, price range)
- ✅ Want <100ms search results

**When Postgres FTS is Good Enough:**
- ✅ Admin-only search (power users who don't make typos)
- ✅ Exact product codes (users copy-paste SKUs)
- ✅ MVP Phase 0 (add Typesense in Week 4-6)

**Migration Path:**
1. **Phase 1:** Postgres full-text search (simpler, fewer dependencies)
2. **Week 4-6:** Users complain about typos
3. **Add Typesense:** 4-6 hours (sync products, update search endpoint)

**OR:**

1. **Phase 1:** Start with Typesense (4 hours setup)
2. **Never worry about typos**
3. **No migration needed**

**Recommendation:** **Add Typesense from Day 1** if budget allows (₹1,850/month).

**Why:** Migration is painful. Users will complain about typos. Save yourself the Week 6 "search doesn't work" crisis.

---

### Postgres Full-Text Search (Backup/Offline)

**When to Use:**
- ✅ Offline search (PWA, service worker)
- ✅ Backup when Typesense is down
- ✅ Admin search (internal tools)

**Implementation:**
```sql
-- Add tsvector column
ALTER TABLE items ADD COLUMN search_vector TSVECTOR;

-- Update search vector on insert/update
CREATE OR REPLACE FUNCTION items_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.item_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_search_vector_trigger
BEFORE INSERT OR UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION items_search_vector_update();

-- Create GIN index
CREATE INDEX idx_items_search_vector ON items USING GIN(search_vector);

-- Search query
SELECT item_name, brand, ts_rank(search_vector, query) AS rank
FROM items, to_tsquery('english', 'camera & hikvision & 2mp') query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

**Pros:**
- ✅ Free (included in Postgres)
- ✅ No external dependency
- ✅ Works offline

**Cons:**
- ❌ No typo tolerance
- ❌ Slower (50-200ms)
- ❌ Manual facet counting

**Verdict:** Use Postgres FTS as **backup**, not primary search.

---

## Part 3: Image Storage

### Option A: Cloudflare R2 (Recommended)

**What is R2?**
- S3-compatible object storage
- **Zero egress fees** ($0.00/GB download)
- Global CDN built-in
- Cloudflare network (fast worldwide)

**Pricing:**

| Metric | Price |
|---|---|
| **Storage** | $0.015/GB/month |
| **Upload** | $4.50 per million requests |
| **Download (egress)** | **$0.00** 🎉 |

**Example: 500 products, 3 images each**
- Total images: 1,500
- Avg image size: 100 KB (optimized)
- Total storage: 150 MB
- Monthly downloads: 100K images (100 GB bandwidth)

**Cost:**
- Storage: 0.15 GB × $0.015 = **$0.002/month** (negligible)
- Egress: 100 GB × $0 = **$0**
- **Total: ₹0.20/month**

**At scale (10,000 users, 500K image views/month, 500 GB bandwidth):**
- Storage: 1 GB × $0.015 = $0.015/month
- Egress: 500 GB × $0 = $0
- **Total: ₹1.50/month**

---

### Option B: Supabase Storage

**Pricing:**

| Tier | Storage | Egress | Price |
|---|---|---|---|
| **Free** | 1 GB | 2 GB | $0 |
| **Pro** | 100 GB | 200 GB | Included in $25/mo |
| **Overage** | — | **$0.09/GB** | 🚨 |

**Example: Same 500 products, 100 GB bandwidth/month**
- Storage: 150 MB = Free ✅
- Egress: 100 GB - 2 GB free = 98 GB overage
- Overage cost: 98 GB × $0.09 = **$8.82/month**

**At scale (500 GB bandwidth/month):**
- Overage: 500 GB - 200 GB (Pro tier) = 300 GB
- Cost: 300 GB × $0.09 = **$27/month**

---

### Cost Comparison: R2 vs Supabase Storage

| Traffic | R2 Cost | Supabase Storage Cost | Savings |
|---|---|---|---|
| **100 GB/month** | ₹0.20 | ₹740 (98 GB × $0.09) | **₹740** |
| **500 GB/month** | ₹1.50 | ₹2,270 (300 GB × $0.09) | **₹2,270** |
| **1 TB/month** | ₹2.50 | ₹6,800 (800 GB × $0.09) | **₹6,800** |

**Winner:** **Cloudflare R2** (saves ₹740-6,800/month depending on traffic)

---

### When to Use Supabase Storage Anyway

✅ **Use Supabase Storage if:**
- Storing user uploads (PDFs, documents, avatars)
- Low bandwidth (<2 GB/month on free tier, <200 GB on Pro)
- Want one less vendor to manage
- Images are tiny (<10KB thumbnails)

✅ **Use R2 if:**
- Serving product images to public (high bandwidth)
- Cost-sensitive (egress adds up fast)
- Already using Cloudflare (Workers, Pages, etc.)

**For WineYard:** **Use R2** (product images = high bandwidth)

---

## Stack Decision Matrix

Use this table to decide your stack:

| Your Situation | Recommended Stack | Why |
|---|---|---|
| **Solo dev, 2-3 week MVP, multi-tenant future** | Supabase + Typesense + R2 | Auth + RLS save 1-2 days, Typesense prevents Week 6 typo crisis, R2 saves ₹740-6,800/mo |
| **Team with DevOps, 6+ week timeline, custom auth** | Railway + Neon + Typesense + R2 | Full control, database branching, no vendor lock-in |
| **Admin-only tool, no public search** | Supabase + Postgres FTS + Supabase Storage | Simpler, fewer dependencies, low bandwidth |
| **High-traffic public catalog (100K+ users)** | Supabase + Typesense + R2 + Redis | Redis for session caching, R2 for images |
| **Need custom Postgres extensions (pgvector, TimescaleDB)** | Railway + Neon + Typesense + R2 | Neon supports custom extensions |

---

## Migration Pain: What Happens If You Choose Wrong?

### Scenario 1: Start with Railway+Neon, Realize You Need RLS Later

**Problem:** Multi-tenant data leak (Tenant A sees Tenant B's data)

**Migration steps:**
1. Migrate database to Supabase (1 day: pg_dump → restore)
2. Rewrite auth to use Supabase Auth (2-3 days)
3. Add RLS policies to all tables (2-3 days)
4. Test multi-tenancy (1-2 days)
5. Deploy + monitor (1 day)

**Total:** **2 weeks** (painful, risky)

---

### Scenario 2: Start with Postgres FTS, Users Complain About Typos

**Problem:** "Search doesn't work!" — users can't find "Hikvision" when they type "hikvison"

**Migration steps:**
1. Set up Typesense Cloud account (30 mins)
2. Create collection schema (1 hour)
3. Sync products to Typesense (2 hours)
4. Update search endpoint (1 hour)
5. Test + deploy (1 hour)

**Total:** **6 hours** (annoying, but manageable)

---

### Scenario 3: Start with Supabase Storage, Bandwidth Costs Spike

**Problem:** Egress bill = $200/month (₹16,800)

**Migration steps:**
1. Set up R2 bucket (30 mins)
2. Upload images to R2 (1 hour for 1,500 images)
3. Update image URLs in database (1 hour)
4. Update app to serve from R2 (1 hour)
5. Test + deploy (1 hour)

**Total:** **5 hours** (easy migration, just changing URLs)

---

## The "No Regrets" Stack

If you're building a B2B catalog, e-commerce, or SaaS product, this is the stack that won't bite you later:

```
Frontend: Next.js 15 (Vercel)
Database: Supabase (Postgres + Auth + RLS)
Search: Typesense
Images: Cloudflare R2
Cron: Vercel Cron → Next.js API Routes
Monitoring: Vercel Analytics + Sentry
```

**Why this works:**
- ✅ Fast to build (ships in 2-3 weeks)
- ✅ Scales to 100K users (proven)
- ✅ Cheap Phase 1 (₹500/month)
- ✅ Reasonable Phase 2 (₹7,300/month)
- ✅ Multi-tenant ready (RLS)
- ✅ No typo complaints (Typesense)
- ✅ Low image costs (R2)
- ✅ Easy to hire for (popular stack)

**When to deviate:**
- Need custom Postgres extensions → Use Neon
- Building internal tool (no public search) → Skip Typesense
- Low bandwidth (<2 GB/month) → Use Supabase Storage
- Have DevOps team + long timeline → Consider Railway+Neon

---

## Conclusion

**For 90% of solo developers building B2B web apps:**

**Phase 1 (MVP):** Supabase + Typesense + R2  
**Cost:** ₹500/month (WhatsApp only, everything else free tier)  
**Time to production:** 2-3 weeks

**Phase 2 (Production):** Same stack, upgrade to paid tiers  
**Cost:** ₹7,300/month (500-1000 users)  
**Time to scale:** 0 weeks (no migration needed)

**Phase 3 (Growth):** Add Redis, optimize Supabase queries  
**Cost:** ₹9,500/month (2,000+ users)  
**Time to optimize:** 1 week (add caching, indexes)

**The alternative (Railway+Neon) costs:**
- **1-2 days** (auth implementation)
- **2-3 weeks later** (multi-tenant migration)
- **₹500-1,200/month more** (depending on scale)

**Is the flexibility worth it?** Only if you have time and expertise.

**For most solo devs:** Ship fast with Supabase. You can always migrate later if you hit real limits (you won't).

---

**Questions? Want to discuss your specific use case? This framework applies to most B2B/SaaS web apps.**
