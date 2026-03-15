# WineYard Digital Catalog — Technical Stack Recommendation

**B2B E-Commerce Platform for CCTV Distributors**

**Prepared:** March 14, 2026  
**Client:** WineYard Technologies, Hyderabad  
**Scope:** Phase 1 MVP (2-3 weeks) → Production Launch → Platform Evolution

---

## Executive Summary

This document outlines the recommended technical stack for WineYard's digital catalog platform, designed to replace manual WhatsApp-based product enquiries with a self-service catalog for 7,000+ integrators.

**The Core Architecture Decision: Separate Database Required**

WineYard's Zoho Books Elite plan provides excellent inventory management, but direct API queries cannot deliver the consumer-grade UX that modern B2B buyers expect. Here's why a caching layer is essential:

### Why Direct Zoho Books Querying Fails

**Your UX Requirements:**
- Product page load: <500ms
- Search results: Instant (<100ms)
- Offline catalog browsing
- Real-time stock visibility across 5 locations

**Zoho Books API Constraints:**
- Latency: 200–800ms per request (Hyderabad → Zoho servers)
- Rate limits: 10,000 calls/day (Elite plan)
- No fuzzy search or typo tolerance
- No offline support
- Location-wise stock requires additional API calls

**The Performance Gap:**

```
Scenario: Integrator opens catalog homepage (500 products)

DIRECT ZOHO APPROACH:
- Fetch products: 1 API call → 300–500ms
- Fetch location stock: 1 additional call per product → Rate limit exhausted
- Customer pricing: 1 call → 200ms
- Total time: 1.2s MINIMUM
- Result: FAILS <500ms target by 2.4×

CACHED DATABASE APPROACH:
- Query local Postgres: Single query, all data → 30–50ms
- Page render: 200–300ms
- Result: PASSES <500ms target ✅
```

**Sync Strategy:**
- Sync 4× daily (8 AM, 12 PM, 4 PM, 8 PM)
- Total API calls: 32/day (0.3% of quota)
- Stock data always <3 hours old

---

## Recommended Stack: Next.js + Supabase + Typesense + Cloudflare R2

**Stack Selection Philosophy:**
- Solo developer velocity (2-3 week timeline)
- Free tier Phase 0/1 (₹500/month for WhatsApp only)
- Production-ready from Day 1
- Scales to high-volume traffic
- Future-proof for platform evolution

---

### Architecture Components

#### **Frontend: Next.js 15 (App Router) + React**

**Why Next.js:**
- Best-in-class React framework for production
- Built-in performance optimization (automatic code splitting, image optimization)
- Server-side rendering (SSR) for SEO and fast initial loads
- API routes for backend logic
- TypeScript support for type safety

**Hosting: Vercel**
- Instant global CDN (low latency worldwide)
- Zero-config deployment (git push = deploy)
- Free tier: 100GB bandwidth, unlimited sites
- Automatic HTTPS + SSL

**Cost:** Free (Hobby tier) → ₹1,600/month (Pro tier at scale)

---

#### **Database: Supabase (PostgreSQL + Auth + Storage)**

**Why Supabase:**
- Fully managed PostgreSQL (ACID compliant, relational data)
- Built-in authentication (magic links via WhatsApp)
- Row-Level Security (RLS) for multi-customer data isolation
- Auto-generated REST/GraphQL APIs
- Built-in file storage
- Excellent developer experience (Table Editor, SQL Editor, logs)

**Database Schema:**
- `items` — Synced from Zoho Books Items API
- `item_locations` — Stock per warehouse/location
- `contacts` — Customer integrators
- `contact_persons` — Team members per integrator
- `pricebooks` — Customer-specific pricing
- `estimates` — Enquiries (save before conversion)
- `sales_orders` — Confirmed orders
- `sessions` — Magic link authentication tokens

**Cost:** Free (500MB) → ₹2,100/month (Pro: 8GB, 100k MAUs)

---

#### **Search: Typesense**

**Why Typesense (not Postgres full-text):**
- Typo tolerance ("camra" → "camera", "hikvison" → "hikvision")
- Fuzzy matching (critical for mobile users)
- Sub-10ms search latency
- Filters: brand, category, price range, stock status
- Faceted search (counts per brand/category)

**Postgres full-text search limitations:**
- No typo tolerance (exact match only)
- Slower (50–200ms vs <10ms)
- Limited ranking/relevance

**Cost:** Free tier (8GB, 20M ops/month) → $0.03/hour ($22/month)

---

#### **Images: Cloudflare R2**

**Why R2 (not Supabase Storage):**
- Zero egress fees ($0.00/GB download)
- Supabase Storage: $0.09/GB egress (expensive at scale)
- S3-compatible API (easy migration)
- Global CDN built-in

**Usage:**
- Product images (500 products × 3 images × 100KB = 150MB)
- Brand logos, category icons

**Cost:** Free tier (10GB storage, 1M requests) → ₹50/month at scale

---

#### **Cron Jobs: Vercel Cron → Next.js API Routes**

**Why Vercel Cron (not Supabase pg_cron or Edge Functions):**
- Precise scheduling (4× daily: 8 AM, 12 PM, 4 PM, 8 PM)
- Free on Vercel Hobby tier
- 10-second timeout (enough for 500 products)
- Easy debugging (logs in Vercel dashboard)
- No cold starts

**Supabase pg_cron limitations:**
- 15-minute minimum interval (too coarse)
- 25-second timeout (risky for 500 products + locations)
- Limited error handling

**Sync Flow:**
```
Vercel Cron (4× daily)
  → /api/cron/sync-zoho (Next.js API route)
    → Fetch from Zoho Books API (8 calls: items, contacts, stock, pricing)
    → Upsert into Supabase Postgres
    → Update Typesense search index
    → Update location stock table
```

---

### Cost Summary

| Phase | Monthly Cost | Details |
|---|---|---|
| **Phase 0/1** (Development + Beta) | **₹500** | WhatsApp API only; all other services on free tiers |
| **Production** (500 active users) | **₹7,300** | Vercel Pro + Supabase Pro + Typesense + R2 + WhatsApp |
| **Scale** (2,000 active users) | **₹9,500** | Incremental bandwidth + database storage |

**Breakdown (Production):**
- Vercel Pro: ₹1,600/month
- Supabase Pro: ₹2,100/month
- Typesense: ₹1,850/month
- R2 Storage: ₹50/month
- WhatsApp Business API: ₹1,700/month
- **Total: ₹7,300/month**

**Cost per Active User:** ₹14.60/month (at 500 users)

**Compared to Zoho Creator:**
- Zoho Creator: ₹11,400/month (₹28,800 licenses + ₹1,08,000 portal users ÷ 12)
- Custom stack: ₹7,300/month
- **Savings: ₹4,100/month (36% cheaper)**

---

## Authentication: WhatsApp Magic Links

**User Flow:**
1. Integrator sends WhatsApp message: "Catalog"
2. Server looks up phone number in Supabase `contacts` table
3. If not found → verify against Zoho Books Contacts API → create in Supabase
4. Generate UUID token → store in `sessions` table (30-day expiry)
5. Send magic link: `https://catalog.wineyard.in/auth/{token}`
6. User clicks → validate token → set HTTP-only cookie
7. Subsequent visits: Cookie-based authentication (no re-verification)

**Why Magic Links (No Passwords):**
- Zero friction (integrators hate passwords)
- Phone number is unique identifier (already in Zoho Books)
- WhatsApp delivery confirmation (read receipts)
- Secure (UUID tokens, HTTP-only cookies, 30-day expiry)

**Supabase Auth handles:**
- Token generation and validation
- Session management (refresh tokens)
- Cookie security (HTTP-only, SameSite, Secure flags)

**Lazy User Creation (Not Full Sync):**
- **Problem:** 7,000 contacts in Zoho Books, only 500 active users expected
- **Solution:** Create users in Supabase only on first login attempt
- **Verification:** On first login → call Zoho Books Contacts API → verify active status → create in Supabase
- **Subsequent logins:** Trust Supabase (no Zoho verification)
- **Daily sync:** Update contact status (active/inactive) for existing users only

**Why This Works:**
- Reduces Supabase storage (500 users vs 7,000)
- Reduces sync API calls (500 contacts vs 7,000)
- Faster page loads (smaller database)
- No security risk (first login verifies against Zoho)

---

## Database Schema Design (Supabase PostgreSQL)

### Core Tables (Synced from Zoho Books)

#### **1. items** — Products Catalog
```sql
CREATE TABLE items (
  zoho_item_id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  category_id TEXT,
  category_name TEXT,
  brand TEXT,
  description TEXT,
  hsn_or_sac TEXT,
  unit TEXT,
  status TEXT, -- 'active' | 'inactive'
  base_rate DECIMAL(10, 2), -- MRP / base selling price
  purchase_rate DECIMAL(10, 2),
  tax_percentage DECIMAL(5, 2),
  track_inventory BOOLEAN DEFAULT true,
  available_stock INTEGER, -- Total across all locations
  actual_available_stock INTEGER,
  reorder_level INTEGER,
  image_urls JSONB, -- Array of R2 URLs
  custom_fields JSONB, -- Additional Zoho custom fields
  search_vector TSVECTOR, -- For Postgres full-text search (backup)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_brand ON items(brand);
CREATE INDEX idx_items_sku ON items(sku);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_search_vector ON items USING GIN(search_vector);
```

#### **2. item_locations** — Stock per Location
```sql
CREATE TABLE item_locations (
  id BIGSERIAL PRIMARY KEY,
  zoho_item_id TEXT REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  zoho_location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  location_status TEXT, -- 'active' | 'inactive'
  is_primary BOOLEAN DEFAULT false,
  stock_on_hand INTEGER DEFAULT 0,
  available_stock INTEGER DEFAULT 0,
  actual_available_stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zoho_item_id, zoho_location_id)
);

CREATE INDEX idx_item_locations_item ON item_locations(zoho_item_id);
CREATE INDEX idx_item_locations_location ON item_locations(zoho_location_id);
```

**Why Separate Table:**
- WineYard has 5 locations (outlets)
- Integrators need location-specific stock visibility
- One item → 5 location rows
- Easier to query: "Show me all products with stock in Kukatpally location"

#### **3. contacts** — Customer Integrators
```sql
CREATE TABLE contacts (
  zoho_contact_id TEXT PRIMARY KEY,
  contact_name TEXT NOT NULL,
  company_name TEXT,
  contact_type TEXT, -- 'customer' | 'vendor'
  status TEXT, -- 'active' | 'inactive'
  primary_contact_person_id TEXT,
  pricebook_id TEXT, -- Custom pricing assigned
  phone TEXT UNIQUE, -- From billing_address.phone
  email TEXT,
  billing_address JSONB,
  shipping_address JSONB,
  payment_terms INTEGER, -- Days
  currency_code TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_pricebook ON contacts(pricebook_id);
CREATE INDEX idx_contacts_status ON contacts(status);
```

#### **4. contact_persons** — Team Members per Integrator
```sql
CREATE TABLE contact_persons (
  zoho_contact_person_id TEXT PRIMARY KEY,
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contact_persons_contact ON contact_persons(zoho_contact_id);
CREATE INDEX idx_contact_persons_phone ON contact_persons(phone);
```

**Pricing Inheritance:**
- All contact_persons inherit the same pricing from parent contact's `pricebook_id`

#### **5. pricebooks** — Customer-Specific Pricing
```sql
CREATE TABLE pricebooks (
  id BIGSERIAL PRIMARY KEY,
  zoho_pricebook_id TEXT UNIQUE,
  pricebook_name TEXT NOT NULL,
  zoho_item_id TEXT REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  custom_rate DECIMAL(10, 2), -- Customer-specific price
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zoho_pricebook_id, zoho_item_id)
);

CREATE INDEX idx_pricebooks_item ON pricebooks(zoho_item_id);
CREATE INDEX idx_pricebooks_pricebook ON pricebooks(zoho_pricebook_id);
```

**Pricing Logic:**
```sql
-- Get price for a contact
SELECT COALESCE(pb.custom_rate, i.base_rate) AS final_price
FROM items i
LEFT JOIN contacts c ON c.zoho_contact_id = :contact_id
LEFT JOIN pricebooks pb 
  ON pb.zoho_item_id = i.zoho_item_id 
  AND pb.zoho_pricebook_id = c.pricebook_id
WHERE i.zoho_item_id = :item_id;
```

**Fallback:** If no pricebook assigned → use `items.base_rate`

---

### Application Tables (Local Only, NOT Synced)

#### **6. estimates** — Enquiries / Draft Quotes
```sql
CREATE TABLE estimates (
  id BIGSERIAL PRIMARY KEY,
  zoho_estimate_id TEXT UNIQUE, -- NULL until synced to Zoho
  estimate_number TEXT UNIQUE,
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  contact_phone TEXT, -- Denormalized for quick lookup
  status TEXT, -- 'draft' | 'sent' | 'accepted' | 'declined' | 'converted'
  date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  line_items JSONB NOT NULL, -- [{item_id, quantity, rate, total}, ...]
  subtotal DECIMAL(10, 2),
  tax_total DECIMAL(10, 2),
  total DECIMAL(10, 2),
  notes TEXT,
  whatsapp_sent BOOLEAN DEFAULT false,
  converted_to_salesorder_id TEXT, -- NULL until converted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_estimates_contact ON estimates(zoho_contact_id);
CREATE INDEX idx_estimates_status ON estimates(status);
CREATE INDEX idx_estimates_date ON estimates(date DESC);
```

#### **7. sales_orders** — Confirmed Orders
```sql
CREATE TABLE sales_orders (
  id BIGSERIAL PRIMARY KEY,
  zoho_salesorder_id TEXT UNIQUE, -- NULL until synced to Zoho
  salesorder_number TEXT UNIQUE,
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  contact_phone TEXT,
  status TEXT, -- 'draft' | 'confirmed' | 'void' | 'invoiced'
  date DATE DEFAULT CURRENT_DATE,
  shipment_date DATE,
  line_items JSONB NOT NULL,
  subtotal DECIMAL(10, 2),
  tax_total DECIMAL(10, 2),
  total DECIMAL(10, 2),
  notes TEXT,
  converted_from_estimate_id BIGINT REFERENCES estimates(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_salesorders_contact ON sales_orders(zoho_contact_id);
CREATE INDEX idx_salesorders_status ON sales_orders(status);
CREATE INDEX idx_salesorders_date ON sales_orders(date DESC);
```

**Estimate → Sales Order Conversion:**
```sql
-- Convert estimate to sales order
INSERT INTO sales_orders (
  zoho_contact_id, contact_phone, line_items, subtotal, tax_total, total,
  converted_from_estimate_id
)
SELECT 
  zoho_contact_id, contact_phone, line_items, subtotal, tax_total, total,
  id
FROM estimates WHERE id = :estimate_id;

-- Update estimate status
UPDATE estimates SET status = 'converted', 
  converted_to_salesorder_id = :new_salesorder_id
WHERE id = :estimate_id;
```

#### **8. sessions** — Magic Link Auth Tokens
```sql
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  phone TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_phone ON sessions(phone);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

**Session Expiry:**
- Token valid: 30 days from creation
- Inactive timeout: 15 days (no activity)
- Cleanup cron: Daily deletion of expired sessions

---

## Sync Strategy & API Calls

### Sync Schedule

| Entity | Frequency | API Calls | Reason |
|---|---|---|---|
| **Contacts & Contact Persons** | 1× daily (8 AM) | 2 calls | Deactivations, new integrators |
| **Items (products)** | 4× daily (8 AM, 12 PM, 4 PM, 8 PM) | 3 calls | Stock changes, price updates |
| **Item Locations (stock)** | 4× daily (same as items) | 5 calls | Location-wise stock visibility |
| **Pricebooks** | 1× daily (8 AM) | 2 calls | Custom pricing changes (rare) |
| **Estimates (read)** | 4× daily | 1 call | Sync status from Zoho (if edited in Books) |
| **Sales Orders (read)** | 4× daily | 1 call | Sync status from Zoho (if edited in Books) |
| **Estimates (write)** | Ad-hoc (on create) | 1 call/estimate | When integrator creates enquiry |
| **Sales Orders (write)** | Ad-hoc (on convert) | 1 call/order | When estimate converted to order |

**Total Daily API Calls:** ~32 calls (0.3% of 10,000 quota)

### Zoho Webhooks (Future Optimization)

Zoho Books supports webhooks for real-time updates:
- Item updated → Trigger immediate sync (no 3-hour delay)
- Contact created → Add to Supabase
- Sales Order invoiced → Update status

**Phase 1:** Scheduled sync (simpler, reliable)  
**Phase 2:** Hybrid (webhooks + daily full sync for reconciliation)

---

## Search Implementation

### Phase 1: Typesense (Recommended)

**Setup:**
1. Sync products to Typesense collection on every Zoho sync
2. Define schema:
```json
{
  "name": "items",
  "fields": [
    {"name": "zoho_item_id", "type": "string"},
    {"name": "item_name", "type": "string"},
    {"name": "sku", "type": "string"},
    {"name": "brand", "type": "string", "facet": true},
    {"name": "category_name", "type": "string", "facet": true},
    {"name": "description", "type": "string"},
    {"name": "base_rate", "type": "float"},
    {"name": "available_stock", "type": "int32"},
    {"name": "status", "type": "string", "facet": true}
  ]
}
```

**Search Query:**
```javascript
const results = await typesense
  .collections('items')
  .documents()
  .search({
    q: 'hikvison', // Typo: "hikvision"
    query_by: 'item_name,sku,brand,description',
    filter_by: 'status:=active && available_stock:>0',
    facet_by: 'brand,category_name',
    max_facet_values: 50,
    typo_tokens_threshold: 2,
    per_page: 50
  });
```

**Benefits:**
- Typo tolerance: "camra" → "camera", "hikvison" → "hikvision"
- Faceted search: Brand count, Category count
- Sub-10ms latency
- Highlight matching text

### Postgres Full-Text Search (Backup)

**For offline search via Service Worker:**
```sql
-- Update search vector on item insert/update
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
```

**Limitations:**
- No typo tolerance (exact match only)
- Slower (50–200ms vs <10ms)
- Good enough for offline mode

---

## Offline-First Architecture

**Service Worker Strategy:**
- Cache product catalog (items + images) on first visit
- Cache customer-specific pricing
- IndexedDB for cart and enquiry queue
- Fuse.js for offline fuzzy search

**Cache Sizes:**
- Product catalog: <10MB (500 products JSON)
- Product images: <50MB (compressed, lazy-loaded)
- Total: <60MB

**Offline Capabilities:**
- Browse full catalog
- Search products (Fuse.js fuzzy search)
- Add to cart
- Create enquiry (queued, syncs on reconnect)

**Not Available Offline:**
- Real-time stock updates (shows last cached stock)
- New products added today
- Price changes from last sync

**Sync on Reconnect:**
- Background sync API for queued enquiries
- Differential cache update (only changed products)

---

## Deployment & DevOps

### Environments

| Environment | Purpose | URL | Database |
|---|---|---|---|
| **Local** | Development | localhost:3000 | Supabase local (via CLI) |
| **Staging** | Testing | staging.catalog.wineyard.in | Supabase staging project |
| **Production** | Live | catalog.wineyard.in | Supabase production project |

### CI/CD Pipeline (Vercel)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/actions/deploy@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

**Deployment Flow:**
1. Push to GitHub `main` branch
2. Vercel auto-deploys to production
3. Runs TypeScript type checking
4. Runs database migrations (via Supabase CLI)
5. Live in <2 minutes

### Database Migrations

**Supabase Migrations:**
```bash
# Create migration
supabase migration new add_item_locations_table

# Apply migration (local)
supabase db push

# Apply migration (production)
supabase db push --db-url $PROD_DATABASE_URL
```

**Migration files stored in:** `/supabase/migrations/`

---

## Monitoring & Observability

### Error Tracking: Sentry
- Frontend errors (React component crashes)
- API route errors (Next.js)
- Zoho API failures (rate limits, timeouts)

### Performance Monitoring: Vercel Analytics
- Core Web Vitals (LCP, FID, CLS)
- Real User Monitoring (RUM)
- API route performance

### Database Monitoring: Supabase Dashboard
- Query performance
- Connection pool usage
- Table sizes
- Slow query log

### Alerts
- Sync failures (Zoho API errors)
- Database connection errors
- Search service downtime (Typesense)
- WhatsApp API failures

---

## Security Considerations

### Authentication & Authorization
- Magic links (UUID tokens, 30-day expiry)
- HTTP-only cookies (prevents XSS)
- CSRF protection (Next.js built-in)
- Phone number verification (first login against Zoho)

### Data Protection
- Supabase Row-Level Security (RLS) for multi-customer isolation
- No sensitive data in client-side code
- Environment variables for API keys (not committed to Git)
- HTTPS everywhere (Vercel auto-SSL)

### API Security
- Rate limiting (per IP, per user)
- Zoho Books API key rotation (quarterly)
- Webhook signature verification (Zoho → App)

### Compliance
- GDPR: User data deletion on request
- PCI DSS: No credit card data stored (Zoho Books handles payments)
- Data residency: India (Supabase Asia-Pacific region)

---

## Migration Path: Phase 1 → Platform Evolution

### Phase 1 (Weeks 1-3): WineYard MVP
- Single distributor (WineYard)
- 500 products, 7,000 integrators
- Magic link auth
- Estimate → Sales Order workflow
- WhatsApp integration

### Phase 2 (Month 2-3): Performance Optimization
- Add Typesense (if search complaints)
- Add Cloudflare R2 (if image costs spike)
- Optimize Supabase queries (indexes, caching)
- Add Redis for session caching

### Phase 3 (Month 4-6): Mobile App
- React Native (Expo)
- Shares API client with web app
- Offline-first (same strategy)
- Push notifications (order updates)

### Phase 4 (Month 6+): Multi-Distributor Platform
**Schema changes:**
```sql
ALTER TABLE items ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE contacts ADD COLUMN tenant_id INTEGER;
ALTER TABLE estimates ADD COLUMN tenant_id INTEGER;
-- ... (add to all tables)

-- Row-Level Security
CREATE POLICY tenant_isolation_items ON items
  USING (tenant_id = current_setting('app.current_tenant')::INTEGER);
```

**Subdomain routing:**
- wineyard.catalog-platform.com
- distributor2.catalog-platform.com

**Cost at scale (10 distributors, 50,000 users):**
- ₹14,350/month total
- Revenue potential: ₹50,000 MRR (₹5,000/distributor)

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Zoho API rate limits exceeded | Low | High | Batch syncs, use webhooks, cache aggressively |
| Supabase free tier limits hit | Medium | Medium | Monitor usage, upgrade to Pro (₹2,100/month) |
| Typesense downtime | Low | Medium | Fallback to Postgres full-text search |
| Search quality (typos) | Medium | Medium | Use Typesense from Day 1 (avoid migration later) |
| Image bandwidth costs | Low | Low | Use R2 from Day 1 (avoid Supabase Storage) |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Low integrator adoption | Medium | High | WhatsApp onboarding, training sessions |
| Stock data out-of-sync | Low | Medium | 4× daily syncs, manual refresh button |
| Integrators bypass platform | Low | High | Make catalog faster than WhatsApp |

---

## Success Metrics (Phase 1)

### Performance KPIs
- [ ] Page load time: <500ms (P95)
- [ ] Search results: <100ms
- [ ] API uptime: >99.5%
- [ ] Mobile performance score: >90 (Lighthouse)

### Business KPIs
- [ ] 500 integrators onboarded (Month 1)
- [ ] 50% reduction in WhatsApp enquiries
- [ ] 200 enquiries/week via platform
- [ ] 30% enquiry → order conversion rate

### Developer KPIs
- [ ] <3 week MVP launch
- [ ] <2 hour deployment time (dev → production)
- [ ] Zero downtime deployments
- [ ] <1 critical bug/week (after launch)

---

## Next Steps

### Week 1: Foundation
- [ ] Set up Vercel project
- [ ] Set up Supabase project (PostgreSQL + Auth)
- [ ] Set up Typesense Cloud account
- [ ] Set up Cloudflare R2 bucket
- [ ] Create GitHub repository + CI/CD

### Week 2: Core Features
- [ ] Database schema (tables, indexes, RLS policies)
- [ ] Zoho Books API integration (items, contacts, stock sync)
- [ ] Authentication (magic links via WhatsApp)
- [ ] Product catalog UI (grid, filters, search)
- [ ] Shopping cart + enquiry flow

### Week 3: Polish & Launch
- [ ] Estimate → Sales Order conversion
- [ ] WhatsApp quotation sending
- [ ] Offline-first PWA
- [ ] Performance optimization
- [ ] Beta testing with 50 integrators
- [ ] Production launch

---

## Conclusion

This stack is optimized for WineYard's specific requirements:
- **Solo developer:** Supabase reduces backend complexity
- **2-3 week timeline:** Free tiers enable immediate start
- **7,000 integrators:** Supabase scales to 100k+ users
- **Consumer UX:** Typesense + R2 deliver <500ms loads
- **Future-proof:** Clean migration to multi-distributor platform

**Total Phase 1 investment:** ₹500/month (WhatsApp only)  
**ROI:** 90% reduction in manual enquiries, 50% faster quote turnaround

**This is production-grade architecture, not a prototype.**

---

**Questions or concerns? Let's discuss.**
