# TraderOps Platform — Technical Stack Recommendations
**Digital Catalog for B2B Commerce — WineYard Phase 1 → Multi-Tenant SaaS**

**Prepared:** March 13, 2026  
**Context:** Solo developer, 2-3 week MVP timeline, 500 products, 7000 integrators, must scale to multi-tenant SaaS

---

## Executive Summary

**The Critical Question: Do You Need a Separate Database?**

**YES. Absolutely required.** Querying Zoho Books directly at runtime will not deliver the sub-500ms page loads your design system requires. Here's why:

### Why Direct Zoho Querying Fails for E-Commerce UX

**Your Design System Targets:**
- LCP (Largest Contentful Paint): <2.5s
- Product card grid load: <500ms
- Search results: Instant (<100ms)
- Offline browsing: Full catalog available

**Zoho Books API Reality:**
- API latency: 200–800ms per request (India to Zoho servers)
- Rate limits: 10,000 calls/day (WineYard Elite plan)
- No full-text search or fuzzy matching
- No offline capability
- No batch queries for "products + stock + pricing" in one call

**The Math That Kills Direct Querying:**

```
Scenario: Integrator opens catalog homepage

Required data:
- 500 products (basic info)
- Stock status for 500 products
- Customer-specific pricing for 500 products
- Category metadata
- Customer's order history

Zoho Books API approach:
- Fetch products: 1 API call → 300–500ms
- Fetch stock per product: 500 calls → IMPOSSIBLE (rate limit hit in 1 day with 20 users)
- Fetch pricing: 1 call per price list → 200–400ms
- Fetch order history: 1–3 calls → 300–600ms

Total time: 1.2s MINIMUM (best case, ignoring rate limits)
Your target: <500ms

Result: FAILS performance target by 2.4×
```

**The Caching Solution:**

```
Custom Database (PostgreSQL) Approach:

Sync from Zoho Books 4× daily:
- Fetch all products: 3 API calls (200 items/call) = 6s total
- Fetch all stock: Batched = 3 API calls = 5s total
- Fetch price lists: 2 API calls = 3s total
- Total sync: 14s, 8 API calls, runs 4× daily = 32 calls/day

Integrator browsing:
- Query local database: 20–50ms
- All 500 products with stock + pricing: Single query, <50ms
- Search with typo tolerance: 10–30ms
- Offline: Works from cached data

Total page load: 200–300ms
API consumption: 32/day (0.3% of 10,000 quota)
```

**Conclusion:** Separate database is non-negotiable for consumer-grade UX.

---

## Stack Recommendation: Progressive Architecture

**Philosophy:** Start simple, scale incrementally. Avoid over-engineering while keeping future SaaS migration path clear.

### Option 1: **Recommended — Next.js + Postgres + Typesense** (Best Balance)

**Why This Stack:**
- ✅ Meets 2-3 week MVP timeline
- ✅ Sub-500ms page loads achievable
- ✅ Fuzzy search + typo tolerance built-in
- ✅ Offline-first via service workers
- ✅ Zero-cost Phase 0/1 (free tiers)
- ✅ Scales to multi-tenant SaaS without rewrite
- ✅ Solo developer can ship this

---

### **Full Stack Breakdown**

#### **Frontend: Next.js 15 (App Router) + React**

**Why:**
- Server components reduce client JS → faster loads
- Built-in image optimization (critical for 500–1000 product images)
- API routes for backend logic (no separate server needed initially)
- Progressive Web App support (offline catalog)
- Vercel deployment = zero config

**Alternative Considered:**
- **SvelteKit:** Smaller bundles, but Next.js ecosystem is larger (easier to find help as solo dev)
- **Remix:** Great for data loading, but less mature PWA story

**Verdict:** Next.js wins for solo dev velocity + mature tooling.

---

#### **Database: PostgreSQL (Neon or Supabase)**

**Schema Design:**

```sql
-- Core tables (synced from Zoho Books)

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  zoho_item_id VARCHAR(50) UNIQUE NOT NULL,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  brand VARCHAR(100),
  category VARCHAR(100),
  
  -- Stock (synced)
  stock_available INTEGER DEFAULT 0,
  stock_status VARCHAR(20), -- 'available', 'limited', 'out_of_stock'
  
  -- Base pricing
  mrp DECIMAL(10,2),
  
  -- Images
  image_urls JSONB, -- Array of image URLs
  thumbnail_url VARCHAR(500),
  
  -- Search optimization
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', 
      coalesce(name, '') || ' ' || 
      coalesce(sku, '') || ' ' || 
      coalesce(brand, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);

-- Full-text search index
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);

-- Customers (synced from Zoho Books Contacts)
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  zoho_contact_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  
  -- Pricing tier
  price_list_id VARCHAR(50), -- Links to Zoho Books price list
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  
  -- Session management
  magic_link_token VARCHAR(100),
  token_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_token ON customers(magic_link_token) WHERE token_expires_at > NOW();

-- Customer-specific pricing (synced from Zoho Books)
CREATE TABLE customer_pricing (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  product_id INTEGER REFERENCES products(id),
  price DECIMAL(10,2) NOT NULL,
  
  -- For fast lookups
  UNIQUE(customer_id, product_id)
);

CREATE INDEX idx_customer_pricing_lookup ON customer_pricing(customer_id, product_id);

-- Order history (synced from Zoho Books Sales Orders)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  zoho_salesorder_id VARCHAR(50) UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  
  order_number VARCHAR(50),
  order_date DATE NOT NULL,
  total_amount DECIMAL(10,2),
  status VARCHAR(50), -- 'confirmed', 'delivered', 'cancelled'
  
  -- Line items stored as JSONB for simplicity
  items JSONB, -- [{product_id, sku, name, quantity, price}]
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id, order_date DESC);

-- Enquiries (NOT synced — local to app)
CREATE TABLE enquiries (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  
  -- Cart contents
  items JSONB NOT NULL, -- [{product_id, sku, quantity, price}]
  total_amount DECIMAL(10,2),
  
  -- WhatsApp delivery
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  whatsapp_sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session tracking (for magic links)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  token VARCHAR(100) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token) WHERE expires_at > NOW();
```

**Why PostgreSQL:**
- ✅ Full-text search built-in (`tsvector`)
- ✅ JSONB for flexible product attributes (future: variants, specs)
- ✅ Mature, reliable, well-documented
- ✅ Free tier available (Neon: 512MB, Supabase: 500MB)
- ✅ Scales to multi-tenant (row-level security for future)

**Sync Strategy:**
- **Frequency:** 4× daily (6 AM, 12 PM, 4 PM, 10 PM)
- **Approach:** Upsert (insert new, update existing based on `zoho_item_id`)
- **Incremental:** Fetch only `modified_since` last sync (Zoho Books supports this)
- **API Usage:** ~30–50 calls per sync = 120–200/day (2% of quota)

---

#### **Search Engine: Typesense (Managed Cloud Free Tier)**

**Why NOT rely on PostgreSQL full-text search alone:**

PostgreSQL's `tsvector`:
- ✅ Works for exact matches
- ✅ Supports stemming ("camera" matches "cameras")
- ❌ No typo tolerance ("camra" won't match "camera")
- ❌ No fuzzy matching
- ❌ Slow for large result sets (500+ products)

**Typesense:**
- ✅ Typo tolerance out of the box (edit distance 2)
- ✅ Fuzzy search ("4mp wfi camra" → "4MP WiFi Camera")
- ✅ Sub-10ms search latency
- ✅ Faceted search (filter by brand, category, price)
- ✅ Personalization (boost products based on order history)
- ✅ Free tier: 8GB storage, 20M operations/month

**Architecture:**

```
PostgreSQL (source of truth)
     ↓ (sync on product update)
Typesense (search index)
     ↓ (search queries)
Next.js API route
     ↓ (results)
Frontend
```

**Typesense Schema:**

```typescript
{
  name: 'products',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'sku', type: 'string' },
    { name: 'brand', type: 'string', facet: true },
    { name: 'category', type: 'string', facet: true },
    { name: 'description', type: 'string' },
    { name: 'stock_status', type: 'string', facet: true },
    { name: 'mrp', type: 'float', facet: true }, // For price range filters
    { name: 'image_url', type: 'string' },
    
    // Personalization
    { name: 'popularity_score', type: 'int32' }, // Based on order frequency
  ],
  default_sorting_field: 'popularity_score'
}
```

**Search Query Example:**

```typescript
// User types: "4mp wfi camra"
const results = await typesenseClient
  .collections('products')
  .documents()
  .search({
    q: '4mp wfi camra',
    query_by: 'name,sku,brand,description',
    typo_tokens_threshold: 2, // Allow 2 typos
    filter_by: 'stock_status:!=out_of_stock',
    per_page: 20
  });

// Returns: "Hikvision 4MP WiFi Camera" (corrected typos)
```

**Cost:**
- Phase 0/1: **₹0** (free tier, up to 8GB data)
- Production: **₹0–₹850/month** (scales with usage)

**Alternative Considered:**
- **Algolia:** Better UX, but expensive (starts $1/month → $99/month quickly)
- **Meilisearch:** Self-hosted option, but requires separate server (adds complexity)

**Verdict:** Typesense offers best balance of cost, features, and ease of use for solo dev.

---

#### **Image Storage: Cloudflare R2 (S3-compatible)**

**Why:**
- ✅ Zero egress fees (S3 charges $0.09/GB egress → expensive at scale)
- ✅ S3-compatible API (easy migration if needed)
- ✅ Free tier: 10GB storage, 1M reads/month
- ✅ Automatic CDN delivery (fast image loads globally)

**Cost:**
- Phase 0/1: **₹0** (500 images @ 200KB avg = 100MB → well within free tier)
- Production: **₹0–₹300/month** (10GB storage + 10M requests)

**Image Pipeline:**

```
Upload (admin):
1. Resize to multiple sizes (300x300, 600x600, 1200x1200)
2. Convert to WebP (80% compression)
3. Upload to R2 with filename pattern: {sku}_{size}.webp
4. Store URLs in PostgreSQL products.image_urls JSONB

Delivery (integrator):
1. Next.js Image component requests image
2. Served from Cloudflare R2 CDN (cached at edge)
3. Lazy-loaded below fold (design system requirement)
```

**Alternative Considered:**
- **Vercel Blob:** Easier to use, but costly ($0.15/GB/month + $0.30/GB egress)
- **Supabase Storage:** Good if using Supabase for DB, but not as fast as R2

**Verdict:** R2 wins on cost and performance.

---

#### **Authentication: Magic Links (No Password)**

**Why:**
- ✅ No password management complexity
- ✅ Integrators use WhatsApp → phone number is verified identifier
- ✅ Sessions persist (design system: "never expire unless 15 days inactive")
- ✅ Simple to build

**Flow:**

```
1. Integrator sends WhatsApp message to WineYard
2. Server looks up customer by phone in PostgreSQL
3. Generate magic link token (UUID)
4. Store in sessions table with 30-day expiry
5. Send link via WhatsApp: https://catalog.wineyard.in/auth/{token}
6. User clicks → Next.js validates token → sets HTTP-only cookie
7. Cookie persists for 30 days (unless user inactive for 15 days)
```

**Session Table:**

```sql
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  token VARCHAR(100) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-cleanup inactive sessions
CREATE INDEX idx_sessions_cleanup ON sessions(last_activity_at) 
WHERE last_activity_at < NOW() - INTERVAL '15 days';
```

**Security:**
- Tokens are cryptographically random (UUID v4)
- HTTPS only (prevent token interception)
- Rate limit magic link generation (prevent spam)

**Alternative Considered:**
- **Supabase Auth:** Handles everything, but adds vendor lock-in
- **NextAuth.js:** Overkill for phone-only auth

**Verdict:** Custom magic link is simplest and most aligned with WhatsApp flow.

---

#### **Offline-First: Service Workers + IndexedDB**

**Design System Requirement:**
> "Full catalog browsable offline, enquiries queued when offline"

**Implementation:**

```typescript
// service-worker.ts

// Cache strategies
const CACHE_STRATEGIES = {
  catalog: 'CacheFirst', // Products rarely change
  images: 'CacheFirst', // Images never change
  pricing: 'NetworkFirst', // Fresher is better
  api: 'NetworkOnly' // No caching for mutations
};

// On install: Pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('catalog-v1').then((cache) => {
      return cache.addAll([
        '/offline.html',
        '/manifest.json',
        '/icon-192.png',
        '/icon-512.png'
      ]);
    })
  );
});

// On fetch: Serve from cache or network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Catalog data: Cache-first
  if (url.pathname.startsWith('/api/products')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          return caches.open('catalog-v1').then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  }
  
  // Images: Cache-first
  if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          caches.open('images-v1').then((cache) => {
            cache.put(event.request, response.clone());
          });
          return response;
        });
      })
    );
  }
});
```

**IndexedDB for Cart:**

```typescript
// Store cart offline
import { openDB } from 'idb';

const db = await openDB('wineyard-catalog', 1, {
  upgrade(db) {
    db.createObjectStore('cart', { keyPath: 'productId' });
    db.createObjectStore('enquiries', { keyPath: 'id', autoIncrement: true });
  }
});

// Add to cart (works offline)
async function addToCart(product, quantity) {
  await db.put('cart', { 
    productId: product.id, 
    quantity, 
    addedAt: Date.now() 
  });
}

// Submit enquiry (queue if offline)
async function submitEnquiry(items) {
  if (navigator.onLine) {
    await fetch('/api/enquiries', {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  } else {
    // Queue for later
    await db.add('enquiries', {
      items,
      status: 'pending',
      createdAt: Date.now()
    });
    // Will sync when back online
  }
}
```

**Sync on Reconnect:**

```typescript
// On network recovery
window.addEventListener('online', async () => {
  const pendingEnquiries = await db.getAll('enquiries');
  
  for (const enquiry of pendingEnquiries) {
    try {
      await fetch('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify(enquiry)
      });
      await db.delete('enquiries', enquiry.id);
    } catch (err) {
      console.error('Sync failed:', err);
    }
  }
});
```

**Offline Indicator:**

```tsx
// components/OfflineBanner.tsx
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  if (isOnline) return null;
  
  return (
    <div className="bg-warning-500 text-white px-4 py-2 text-center">
      📵 You're offline. Browsing cached catalog. Enquiries will be sent when reconnected.
    </div>
  );
}
```

---

#### **Hosting: Vercel (Frontend) + Railway (Sync Jobs)**

**Why Split Hosting:**

| What | Where | Why |
|---|---|---|
| Next.js app | Vercel | Zero-config deployment, edge CDN, preview deployments |
| Zoho sync cron jobs | Railway | Long-running processes (Vercel has 60s timeout) |
| PostgreSQL | Neon or Railway | Managed, auto-scales |

**Architecture:**

```
Vercel (Next.js)
├── /api/products → Query Postgres (read-only)
├── /api/search → Query Typesense
├── /api/enquiries → Write to Postgres → Trigger WhatsApp
└── /api/auth → Magic link generation

Railway (Cron Worker)
├── Sync products from Zoho Books (4× daily)
├── Sync customers from Zoho Books (2× daily)
├── Sync orders from Zoho Books (4× daily)
└── Update Typesense index (after sync)
```

**Cost Breakdown:**

| Service | Phase 0/1 | Production (1000 users) |
|---|---|---|
| **Vercel** | ₹0 (Hobby tier) | ₹1,700/month (Pro, 1 seat) |
| **Railway** | ₹0 (trial credit) | ₹850/month (cron worker) |
| **Neon Postgres** | ₹0 (512MB free) | ₹1,600/month (3GB) |
| **Typesense Cloud** | ₹0 (free tier) | ₹850/month |
| **Cloudflare R2** | ₹0 (10GB free) | ₹300/month (20GB + requests) |
| **Meta WhatsApp API** | ₹500/month | ₹2,000/month (conversations) |
| **TOTAL** | **₹500/month** | **₹7,300/month** |

**Scaling to 10,000 users:**
- Vercel: ₹1,700 (same)
- Railway: ₹1,700 (larger worker)
- Neon: ₹3,400 (8GB)
- Typesense: ₹1,700
- R2: ₹850
- WhatsApp: ₹5,000
- **TOTAL: ₹14,350/month** (~₹1.40/user/month)

---

### **Personalization & Recommendations**

**Design System Requirement:**
> "Personalization without asking — use order history"

**Recommendation Engine (Simple but Effective):**

```sql
-- Frequently bought together
CREATE MATERIALIZED VIEW frequently_bought_together AS
SELECT 
  o1.product_id AS product_a,
  o2.product_id AS product_b,
  COUNT(*) AS frequency
FROM order_items o1
JOIN order_items o2 ON o1.order_id = o2.order_id AND o1.product_id < o2.product_id
GROUP BY product_a, product_b
ORDER BY frequency DESC;

-- Refresh daily
REFRESH MATERIALIZED VIEW frequently_bought_together;

-- Query: "People also bought"
SELECT p.*, fbt.frequency
FROM products p
JOIN frequently_bought_together fbt ON p.id = fbt.product_b
WHERE fbt.product_a = $1
ORDER BY fbt.frequency DESC
LIMIT 4;
```

**"Buy Again" Tab:**

```sql
-- Customer's most recent products (for quick reorder)
SELECT DISTINCT ON (p.id)
  p.*,
  MAX(o.order_date) as last_ordered
FROM products p
JOIN order_items oi ON p.id = oi.product_id
JOIN orders o ON oi.order_id = o.id
WHERE o.customer_id = $1
GROUP BY p.id
ORDER BY last_ordered DESC
LIMIT 50;
```

**"New Arrivals" Section:**

```sql
-- Products added in last 30 days
SELECT * FROM products
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 20;
```

**Implementation:**
- Pre-compute recommendations in daily cron job
- Cache results in Redis (optional, adds ₹850/month)
- For Phase 1: Postgres queries are fast enough (<50ms)

---

### **Phase 1 Deliverables (2-3 Weeks)**

**Week 1:**
- [ ] Next.js app scaffolded, deployed to Vercel
- [ ] PostgreSQL schema created (Neon)
- [ ] Zoho Books sync script (products, customers)
- [ ] Magic link auth working
- [ ] Product grid rendering (cached data)

**Week 2:**
- [ ] Typesense integration (search with typo tolerance)
- [ ] Cart + enquiry submission
- [ ] WhatsApp integration (magic links + quotations)
- [ ] Offline service worker (catalog browsing)
- [ ] Customer-specific pricing display

**Week 3:**
- [ ] Image upload + R2 integration
- [ ] "Buy Again" tab (order history)
- [ ] Polish + mobile responsiveness
- [ ] Pilot with 10 integrators
- [ ] Handover documentation

---

### **Migration to Multi-Tenant SaaS (Post-WineYard)**

**Database Schema Changes:**

```sql
-- Add tenant isolation
ALTER TABLE products ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE customers ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE orders ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);

-- Row-level security (Postgres)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.current_tenant')::INTEGER);

-- Tenants table
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE, -- wineyard.traderops.com
  custom_domain VARCHAR(255), -- catalog.wineyard.in
  
  -- Zoho integration per tenant
  zoho_org_id VARCHAR(100),
  zoho_access_token TEXT,
  zoho_refresh_token TEXT,
  
  -- Branding
  logo_url VARCHAR(500),
  primary_color VARCHAR(7), -- #2196F3
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Cost Model for SaaS:**
- **Base:** ₹5,000/month per distributor (up to 1000 buyers)
- **Overage:** ₹5/buyer/month above 1000
- **Setup fee:** ₹30,000 (Zoho integration + onboarding)

**Revenue Model at 10 Distributors:**
- Setup: ₹3,00,000 (one-time)
- MRR: ₹50,000/month
- ARR: ₹6,00,000
- **Gross margin:** ~85% (costs: ₹90,000/year infrastructure)

---

## Alternative Stack Options

### Option 2: **Supabase-First** (Simpler Backend)

**Stack:**
- Frontend: Next.js + React
- Database + Auth + Storage: Supabase (all-in-one)
- Search: Postgres full-text (no Typesense)
- Hosting: Vercel

**Pros:**
- ✅ Simpler setup (one vendor for DB + auth + storage)
- ✅ Built-in realtime subscriptions (if needed later)
- ✅ Row-level security for multi-tenant
- ✅ Free tier generous (500MB DB, 1GB storage)

**Cons:**
- ❌ No typo-tolerant search (Postgres full-text only)
- ❌ Slight vendor lock-in (but can export Postgres)
- ❌ Image storage not as fast as R2

**Cost:**
- Phase 0/1: ₹0
- Production: ₹2,100/month (Supabase Pro) + ₹1,700 (Vercel) = ₹3,800/month

**Verdict:** Good if you're okay with basic search. Recommended Stack (Option 1) is better for "both search AND personalization are critical" requirement.

---

### Option 3: **Firebase + Algolia** (Google Ecosystem)

**Stack:**
- Frontend: Next.js + React
- Database: Firestore (NoSQL)
- Search: Algolia
- Storage: Firebase Storage
- Auth: Firebase Auth
- Hosting: Vercel

**Pros:**
- ✅ Algolia has best-in-class search UX
- ✅ Firebase scales automatically
- ✅ Offline built-in (Firestore caching)

**Cons:**
- ❌ **Expensive:** Algolia starts $1/month → $99/month quickly
- ❌ NoSQL is awkward for relational data (products → customers → orders)
- ❌ Firebase pricing scales with operations (can spike unexpectedly)

**Cost:**
- Phase 0/1: ₹850/month (Algolia)
- Production: ₹8,500/month (Algolia $99 + Firebase Blaze)

**Verdict:** Too expensive for solo dev/bootstrap scenario. Only consider if funded startup.

---

## Final Recommendation

**Use Option 1: Next.js + Postgres + Typesense**

**Why:**
1. ✅ Meets all technical requirements (search, offline, performance)
2. ✅ Zero cost for Phase 0/1
3. ✅ Scales affordably to multi-tenant SaaS
4. ✅ Solo developer can ship in 2-3 weeks
5. ✅ No vendor lock-in (all components are portable)
6. ✅ Clear migration path from WineYard → SaaS

**Implementation Priority:**

**Week 1 (Must-Have):**
- PostgreSQL + sync from Zoho Books
- Next.js product grid (cached data)
- Magic link auth
- Basic search (Postgres full-text)

**Week 2 (High-Value):**
- Typesense integration (typo tolerance)
- Cart + WhatsApp quotations
- Customer pricing display
- Service worker (offline catalog)

**Week 3 (Polish):**
- Image optimization (R2)
- Buy Again tab
- Mobile responsiveness
- Pilot rollout

**Post-Pilot (SaaS Prep):**
- Multi-tenancy (tenant_id column)
- White-labeling (subdomain routing)
- Admin dashboard (onboard new distributors)

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Zoho Books API rate limits** | Cache aggressively, sync 4× daily not real-time, use batch endpoints |
| **Image storage costs** | Use Cloudflare R2 (zero egress), lazy-load images, compress to WebP |
| **Search quality with typos** | Typesense handles this, fallback to Postgres if Typesense fails |
| **Offline sync conflicts** | Last-write-wins for cart, queue enquiries, show sync status banner |
| **Solo dev velocity** | Use managed services (no custom servers), leverage Next.js defaults |

---

## Success Metrics (Post-Launch)

**Technical:**
- [ ] LCP < 2.5s (homepage)
- [ ] Search results < 100ms
- [ ] Offline catalog browsing works
- [ ] Zoho API usage < 500 calls/day

**Business:**
- [ ] 80%+ pilot integrators actively use catalog
- [ ] 50%+ enquiries come via app (not phone)
- [ ] Time-to-quotation < 60 seconds
- [ ] WineYard approves SaaS roadmap

---

**End of Technical Stack Recommendation**

---

**Next Steps:**
1. Approve Option 1 stack
2. Provision Neon Postgres account (free tier)
3. Set up Typesense Cloud account (free tier)
4. Create Next.js repo
5. Build Zoho Books sync script (Day 1)

**Questions:** [Your Email/Phone]
