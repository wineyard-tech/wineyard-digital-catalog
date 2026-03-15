# Claude Code — WineYard Initial Setup Prompt

Copy everything between the `---START---` and `---END---` markers and paste it into Claude Code.

Run in two phases:
- **Phase 1:** Paste the prompt → Claude Code builds the repo structure and migrations
- **Phase 2:** Add your `.env.local` credentials → ask Claude Code to validate connections

---START---

You are setting up the initial repository for the WineYard Digital Catalog project. Follow every instruction exactly. Do not skip steps or add things not asked for.

## Context

This is a B2B digital catalog for a CCTV distributor. The architecture is documented at `planning/WineYard_Architecture_v2.md`. Read it before starting. The tech stack is:
- Next.js 15 (App Router) in `/app/`
- Supabase (PostgreSQL + Edge Functions + Storage + Auth) in `/supabase/`
- Vercel for hosting
- Meta WhatsApp Cloud API for notifications

The current working directory is the repo root (`wineyard-catalog/`). The `planning/` folder already exists with documentation files. Do not touch anything in `planning/`.

---

## Phase 1: Repository Structure & Migrations

### Step 1: Initialize Next.js app

Run this exactly:
```bash
npx create-next-app@latest app \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint
```

Then install required packages:
```bash
cd app
npm install @supabase/supabase-js @supabase/ssr
npm install next-pwa
npm install nanoid
npm install -D @types/node
cd ..
```

### Step 2: Initialize Supabase project

```bash
npx supabase init
```

This creates `supabase/config.toml`. Do not modify `config.toml`.

### Step 3: Create the full folder structure

Create all of these (empty files/folders):

```
# Shared types
types/
types/catalog.ts
types/zoho.ts
types/database.generated.ts   ← leave empty, will be generated later

# Scripts
scripts/
scripts/generate-types.sh
scripts/test-zoho-connection.ts
scripts/test-whatsapp.ts
scripts/seed-local.ts

# Docs
docs/
docs/architecture.md          ← copy planning/WineYard_Architecture_v2.md here

# Supabase migrations
supabase/migrations/001_extensions.sql
supabase/migrations/002_tables.sql
supabase/migrations/003_indexes.sql
supabase/migrations/004_functions.sql
supabase/migrations/005_triggers.sql
supabase/migrations/006_rls.sql
supabase/migrations/007_cron.sql

# Supabase Edge Functions
supabase/functions/_shared/zoho-client.ts
supabase/functions/_shared/supabase-client.ts
supabase/functions/_shared/types.ts
supabase/functions/sync-items/index.ts
supabase/functions/sync-contacts/index.ts
supabase/functions/session-cleanup/index.ts

# Next.js app structure
app/src/app/api/webhook/route.ts
app/src/app/api/auth/verify/route.ts
app/src/app/api/auth/logout/route.ts
app/src/app/api/catalog/route.ts
app/src/app/api/enquiry/route.ts
app/src/app/api/admin/route.ts
app/src/app/auth/[ref_id]/page.tsx
app/src/app/guest/[token]/page.tsx
app/src/app/catalog/page.tsx
app/src/app/admin/page.tsx
app/src/app/admin/login/page.tsx
app/src/app/offline/page.tsx
app/src/app/layout.tsx
app/src/app/page.tsx
app/src/components/catalog/ProductGrid.tsx
app/src/components/catalog/ProductCard.tsx
app/src/components/catalog/CategoryFilter.tsx
app/src/components/catalog/BrandFilter.tsx
app/src/components/catalog/SearchBar.tsx
app/src/components/catalog/StockBadge.tsx
app/src/components/cart/CartBar.tsx
app/src/components/cart/CartSheet.tsx
app/src/components/cart/CartContext.tsx
app/src/components/auth/OtpForm.tsx
app/src/components/auth/GuestBanner.tsx
app/src/components/admin/EnquiryTable.tsx
app/src/components/admin/StatusSelect.tsx
app/src/components/shared/OfflineBanner.tsx
app/src/components/shared/LoadingSkeleton.tsx
app/src/lib/supabase/client.ts
app/src/lib/supabase/server.ts
app/src/lib/zoho.ts
app/src/lib/whatsapp.ts
app/src/lib/auth.ts
app/src/lib/pricing.ts
app/src/middleware.ts
app/public/manifest.json
```

### Step 4: Write the .gitignore

Create `.gitignore` at repo root:
```
# Env
.env.local
.env.*.local

# Next.js
app/.next/
app/out/
app/node_modules/

# Supabase
supabase/.branches/
supabase/.temp/

# OS
.DS_Store
Thumbs.db

# Generated
types/database.generated.ts
```

### Step 5: Write .env.local.example

Create `app/.env.local.example`:
```bash
# ─── Supabase ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# ─── Zoho Books (India region, Self Client grant) ─────────────────────────────
ZOHO_CLIENT_ID=<your-zoho-client-id>
ZOHO_CLIENT_SECRET=<your-zoho-client-secret>
ZOHO_REFRESH_TOKEN=<your-refresh-token>
ZOHO_ORG_ID=<your-organization-id>

# ─── Meta WhatsApp Cloud API ──────────────────────────────────────────────────
WHATSAPP_TOKEN=<system-user-access-token>
WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_VERIFY_TOKEN=<any-random-string-you-choose>
WHATSAPP_APP_SECRET=<your-app-secret>

# ─── App ──────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WABA_LINK=https://wa.me/91XXXXXXXXXX
```

### Step 6: Write the SQL migrations

Write the following content into each migration file exactly. Do not change table or column names.

#### `supabase/migrations/001_extensions.sql`
```sql
-- Required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
-- pg_cron and pg_net are pre-installed on Supabase; enable via Dashboard if needed
-- Dashboard → Database → Extensions → search "pg_cron" → Enable
```

#### `supabase/migrations/002_tables.sql`
```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- SYNCED FROM ZOHO BOOKS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
  zoho_location_id  TEXT PRIMARY KEY,
  location_name     TEXT NOT NULL,
  location_type     TEXT,
  is_primary        BOOLEAN DEFAULT false,
  status            TEXT DEFAULT 'active',
  address           JSONB,
  email             TEXT,
  phone             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  zoho_item_id          TEXT PRIMARY KEY,
  item_name             TEXT NOT NULL,
  sku                   TEXT UNIQUE NOT NULL,
  category_id           TEXT,
  category_name         TEXT,
  brand                 TEXT,
  manufacturer          TEXT,
  description           TEXT,
  hsn_or_sac            TEXT,
  unit                  TEXT DEFAULT 'pcs',
  status                TEXT NOT NULL DEFAULT 'active',
  item_type             TEXT DEFAULT 'inventory',
  product_type          TEXT DEFAULT 'goods',
  base_rate             DECIMAL(10,2),
  purchase_rate         DECIMAL(10,2),
  is_taxable            BOOLEAN DEFAULT true,
  tax_id                TEXT,
  tax_name              TEXT,
  tax_percentage        DECIMAL(5,2) DEFAULT 18.00,
  track_inventory       BOOLEAN DEFAULT true,
  available_stock       INTEGER DEFAULT 0,
  actual_available_stock INTEGER DEFAULT 0,
  reorder_level         INTEGER,
  upc                   TEXT,
  ean                   TEXT,
  part_number           TEXT,
  image_urls            JSONB DEFAULT '[]'::jsonb,
  custom_fields         JSONB DEFAULT '{}'::jsonb,
  search_vector         TSVECTOR,
  created_time          TIMESTAMPTZ,
  last_modified_time    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_locations (
  id                        BIGSERIAL PRIMARY KEY,
  zoho_item_id              TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  zoho_location_id          TEXT NOT NULL,
  location_name             TEXT NOT NULL,
  location_status           TEXT DEFAULT 'active',
  is_primary                BOOLEAN DEFAULT false,
  stock_on_hand             INTEGER DEFAULT 0,
  available_stock           INTEGER DEFAULT 0,
  actual_available_stock    INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zoho_item_id, zoho_location_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  zoho_contact_id           TEXT PRIMARY KEY,
  contact_name              TEXT NOT NULL,
  company_name              TEXT,
  contact_type              TEXT DEFAULT 'customer',
  status                    TEXT DEFAULT 'active',
  primary_contact_person_id TEXT,
  pricebook_id              TEXT,
  phone                     TEXT UNIQUE,
  email                     TEXT,
  billing_address           JSONB,
  shipping_address          JSONB,
  payment_terms             INTEGER,
  payment_terms_label       TEXT,
  currency_id               TEXT,
  currency_code             TEXT DEFAULT 'INR',
  custom_fields             JSONB DEFAULT '{}'::jsonb,
  created_time              TIMESTAMPTZ,
  last_modified_time        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_persons (
  zoho_contact_person_id    TEXT PRIMARY KEY,
  zoho_contact_id           TEXT NOT NULL REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE,
  first_name                TEXT,
  last_name                 TEXT,
  email                     TEXT,
  phone                     TEXT,
  mobile                    TEXT,
  is_primary                BOOLEAN DEFAULT false,
  communication_preference  JSONB,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricebooks (
  id                    BIGSERIAL PRIMARY KEY,
  zoho_pricebook_id     TEXT NOT NULL,
  pricebook_name        TEXT NOT NULL,
  zoho_item_id          TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  custom_rate           DECIMAL(10,2) NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zoho_pricebook_id, zoho_item_id)
);

CREATE TABLE IF NOT EXISTS categories (
  zoho_category_id      TEXT PRIMARY KEY,
  category_name         TEXT UNIQUE NOT NULL,
  parent_category_id    TEXT REFERENCES categories(zoho_category_id),
  status                TEXT DEFAULT 'active',
  display_order         INTEGER DEFAULT 0,
  icon_url              TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brands (
  id            BIGSERIAL PRIMARY KEY,
  brand_name    TEXT UNIQUE NOT NULL,
  status        TEXT DEFAULT 'active',
  logo_url      TEXT,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- APPLICATION TABLES (local only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_requests (
  id              BIGSERIAL PRIMARY KEY,
  ref_id          TEXT UNIQUE NOT NULL,
  phone           TEXT NOT NULL,
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  otp_code        TEXT NOT NULL,
  otp_expires_at  TIMESTAMPTZ NOT NULL,
  ref_expires_at  TIMESTAMPTZ NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  used            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  BIGSERIAL PRIMARY KEY,
  token               UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  zoho_contact_id     TEXT REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE,
  phone               TEXT NOT NULL,
  user_agent          TEXT,
  ip_address          INET,
  expires_at          TIMESTAMPTZ NOT NULL,
  last_activity_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id          BIGSERIAL PRIMARY KEY,
  token       UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  page_views  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS estimate_number_seq START 1;

CREATE TABLE IF NOT EXISTS estimates (
  id                          BIGSERIAL PRIMARY KEY,
  zoho_estimate_id            TEXT UNIQUE,
  estimate_number             TEXT UNIQUE NOT NULL DEFAULT 'EST-' || LPAD(nextval('estimate_number_seq')::TEXT, 5, '0'),
  zoho_contact_id             TEXT REFERENCES contacts(zoho_contact_id),
  contact_phone               TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft',
  date                        DATE DEFAULT CURRENT_DATE,
  expiry_date                 DATE,
  line_items                  JSONB NOT NULL,
  subtotal                    DECIMAL(10,2) NOT NULL,
  tax_total                   DECIMAL(10,2) NOT NULL,
  total                       DECIMAL(10,2) NOT NULL,
  notes                       TEXT,
  whatsapp_sent               BOOLEAN DEFAULT false,
  whatsapp_sent_at            TIMESTAMPTZ,
  converted_to_salesorder_id  BIGINT,
  converted_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS salesorder_number_seq START 1;

CREATE TABLE IF NOT EXISTS sales_orders (
  id                          BIGSERIAL PRIMARY KEY,
  zoho_salesorder_id          TEXT UNIQUE,
  salesorder_number           TEXT UNIQUE NOT NULL DEFAULT 'SO-' || LPAD(nextval('salesorder_number_seq')::TEXT, 5, '0'),
  zoho_contact_id             TEXT REFERENCES contacts(zoho_contact_id),
  contact_phone               TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'draft',
  date                        DATE DEFAULT CURRENT_DATE,
  shipment_date               DATE,
  line_items                  JSONB NOT NULL,
  subtotal                    DECIMAL(10,2) NOT NULL,
  tax_total                   DECIMAL(10,2) NOT NULL,
  total                       DECIMAL(10,2) NOT NULL,
  notes                       TEXT,
  customer_notes              TEXT,
  converted_from_estimate_id  BIGINT REFERENCES estimates(id),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zoho_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  access_token  TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### `supabase/migrations/003_indexes.sql`
```sql
-- items
CREATE INDEX IF NOT EXISTS idx_items_category     ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_category_name ON items(category_name);
CREATE INDEX IF NOT EXISTS idx_items_brand         ON items(brand);
CREATE INDEX IF NOT EXISTS idx_items_status        ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_stock         ON items(available_stock) WHERE available_stock > 0;
CREATE INDEX IF NOT EXISTS idx_items_search_vector ON items USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_items_trgm_name     ON items USING GIN(item_name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_items_trgm_brand    ON items USING GIN(brand      gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_items_trgm_sku      ON items USING GIN(sku        gin_trgm_ops);

-- item_locations
CREATE INDEX IF NOT EXISTS idx_item_locations_item     ON item_locations(zoho_item_id);
CREATE INDEX IF NOT EXISTS idx_item_locations_location ON item_locations(zoho_location_id);

-- contacts
CREATE INDEX IF NOT EXISTS idx_contacts_phone     ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email     ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_pricebook ON contacts(pricebook_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status    ON contacts(status);

-- contact_persons
CREATE INDEX IF NOT EXISTS idx_contact_persons_contact ON contact_persons(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_persons_phone   ON contact_persons(phone);

-- pricebooks
CREATE INDEX IF NOT EXISTS idx_pricebooks_item      ON pricebooks(zoho_item_id);
CREATE INDEX IF NOT EXISTS idx_pricebooks_pricebook ON pricebooks(zoho_pricebook_id);

-- auth_requests
CREATE INDEX IF NOT EXISTS idx_auth_requests_ref_id ON auth_requests(ref_id)
  WHERE used = FALSE;
CREATE INDEX IF NOT EXISTS idx_auth_requests_phone ON auth_requests(phone, created_at DESC);

-- sessions
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_contact ON sessions(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- guest_sessions
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(token)
  WHERE expires_at > NOW();

-- estimates
CREATE INDEX IF NOT EXISTS idx_estimates_contact ON estimates(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_estimates_phone   ON estimates(contact_phone);
CREATE INDEX IF NOT EXISTS idx_estimates_status  ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_date    ON estimates(date DESC);

-- sales_orders
CREATE INDEX IF NOT EXISTS idx_salesorders_contact ON sales_orders(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_salesorders_status  ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_salesorders_date    ON sales_orders(date DESC);
```

#### `supabase/migrations/004_functions.sql`
```sql
-- ── Shared updated_at function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Full-text search vector update ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION items_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.item_name,    '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand,        '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category_name,'')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.sku,          '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.description,  '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Session expiry defaults ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_session_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_guest_session_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Cleanup expired records ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE v_count INTEGER := 0; v_n INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE expires_at < NOW() OR last_activity_at < NOW() - INTERVAL '15 days';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  DELETE FROM auth_requests
  WHERE ref_expires_at < NOW() OR used = TRUE;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  DELETE FROM guest_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ── Convert estimate to sales order ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION convert_estimate_to_salesorder(p_estimate_id BIGINT)
RETURNS BIGINT AS $$
DECLARE v_so_id BIGINT;
BEGIN
  INSERT INTO sales_orders (
    zoho_contact_id, contact_phone, line_items,
    subtotal, tax_total, total, notes, converted_from_estimate_id, status
  )
  SELECT zoho_contact_id, contact_phone, line_items,
         subtotal, tax_total, total, notes, id, 'confirmed'
  FROM estimates WHERE id = p_estimate_id
  RETURNING id INTO v_so_id;

  UPDATE estimates
  SET status = 'converted', converted_to_salesorder_id = v_so_id, converted_at = NOW()
  WHERE id = p_estimate_id;

  RETURN v_so_id;
END;
$$ LANGUAGE plpgsql;
```

#### `supabase/migrations/005_triggers.sql`
```sql
-- updated_at triggers
CREATE TRIGGER items_updated_at          BEFORE UPDATE ON items          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER item_locations_updated_at BEFORE UPDATE ON item_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER contacts_updated_at       BEFORE UPDATE ON contacts       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER contact_persons_updated_at BEFORE UPDATE ON contact_persons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER pricebooks_updated_at     BEFORE UPDATE ON pricebooks     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER estimates_updated_at      BEFORE UPDATE ON estimates      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER sales_orders_updated_at   BEFORE UPDATE ON sales_orders   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER locations_updated_at      BEFORE UPDATE ON locations      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER categories_updated_at     BEFORE UPDATE ON categories     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER brands_updated_at         BEFORE UPDATE ON brands         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- search_vector trigger
CREATE TRIGGER items_search_vector_trigger
BEFORE INSERT OR UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION items_search_vector_update();

-- Session expiry defaults
CREATE TRIGGER sessions_expiry_trigger
BEFORE INSERT ON sessions
FOR EACH ROW EXECUTE FUNCTION set_session_expiry();

CREATE TRIGGER guest_sessions_expiry_trigger
BEFORE INSERT ON guest_sessions
FOR EACH ROW EXECUTE FUNCTION set_guest_session_expiry();
```

#### `supabase/migrations/006_rls.sql`
```sql
-- Enable RLS on all tables
-- The Next.js server uses the SERVICE ROLE KEY which bypasses RLS.
-- RLS here protects against direct anon key access (e.g. from browser).

ALTER TABLE items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricebooks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands         ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoho_tokens    ENABLE ROW LEVEL SECURITY;

-- Public read for catalog data (items, categories, brands)
CREATE POLICY "Public can read active items"
  ON items FOR SELECT
  USING (status = 'active');

CREATE POLICY "Public can read categories"
  ON categories FOR SELECT USING (true);

CREATE POLICY "Public can read brands"
  ON brands FOR SELECT USING (true);

-- All other tables: service role only (no anon access)
-- Next.js API routes use SUPABASE_SERVICE_ROLE_KEY and bypass these.
-- No additional policies needed for server-side operations.
```

#### `supabase/migrations/007_cron.sql`
```sql
-- pg_cron schedules
-- NOTE: pg_cron and pg_net must be enabled in Supabase Dashboard before running this.
-- Dashboard → Database → Extensions → Enable pg_cron and pg_net

-- These will fail silently if pg_cron is not enabled. Enable it first.

-- Items sync: 4x daily at ~8:30, 12:30, 16:30, 20:30 IST (3:00, 7:00, 11:00, 15:00 UTC)
-- PLACEHOLDER: Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> after deployment
-- Run this manually in Supabase SQL editor after deploying Edge Functions:

/*
SELECT cron.schedule('sync-items', '0 3,7,11,15 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-items',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('sync-contacts', '30 1 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-contacts',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb)
$$);

SELECT cron.schedule('session-cleanup', '30 21 * * *', $$
  SELECT cleanup_expired_sessions()
$$);
*/

-- After running, verify: SELECT * FROM cron.job;
```

### Step 7: Write `scripts/test-zoho-connection.ts`

This script validates the Zoho API connection. Write it as a complete, runnable TypeScript script:

```typescript
// scripts/test-zoho-connection.ts
// Run: npx ts-node scripts/test-zoho-connection.ts

import * as https from 'https'
import * as querystring from 'querystring'

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ORG_ID,
} = process.env

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN || !ZOHO_ORG_ID) {
  console.error('❌ Missing env vars. Copy app/.env.local.example to app/.env.local and fill in Zoho credentials.')
  console.error('   Then run: source app/.env.local && npx ts-node scripts/test-zoho-connection.ts')
  process.exit(1)
}

async function post(url: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function get(url: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.end()
  })
}

async function main() {
  console.log('\n🔍 Testing Zoho API connection...\n')

  // 1. Refresh token
  console.log('1. Refreshing access token...')
  const tokenBody = querystring.stringify({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  const tokenRes = await post('https://accounts.zoho.in/oauth/v2/token', tokenBody)

  if (!tokenRes.access_token) {
    console.error('❌ Token refresh failed:', tokenRes)
    process.exit(1)
  }
  console.log('   ✅ Token obtained. Expires in:', tokenRes.expires_in, 'seconds')

  const token = tokenRes.access_token

  // 2. Fetch items
  console.log('\n2. Fetching items (first page)...')
  const itemsRes = await get(
    `https://www.zohoapis.in/books/v3/items?organization_id=${ZOHO_ORG_ID}&per_page=5`,
    token
  )
  if (itemsRes.code !== 0) {
    console.error('❌ Items fetch failed:', itemsRes)
    process.exit(1)
  }
  const items = itemsRes.items || []
  console.log(`   ✅ Items returned: ${items.length} (of ${itemsRes.page_context?.total || '?'} total)`)
  if (items[0]) {
    console.log(`   Sample item: "${items[0].name}" | SKU: ${items[0].sku} | Stock: ${items[0].available_stock}`)
    const hasLocations = items[0].locations && items[0].locations.length > 0
    console.log(`   Location-wise stock in response: ${hasLocations ? '✅ YES' : '⚠️  NO (will use available_stock total)'}`)
  }

  // 3. Fetch pricebooks
  console.log('\n3. Fetching pricebooks...')
  const pbRes = await get(
    `https://www.zohoapis.in/books/v3/pricebooks?organization_id=${ZOHO_ORG_ID}`,
    token
  )
  if (pbRes.code !== 0) {
    console.error('   ⚠️  Pricebooks fetch failed (may need ZohoBooks.pricebooks.READ scope):', pbRes.message)
  } else {
    const pbs = pbRes.pricebooks || []
    console.log(`   ✅ Pricebooks: ${pbs.map((p: any) => p.pricebook_name).join(', ') || 'none found'}`)
  }

  // 4. Fetch contacts (first page)
  console.log('\n4. Fetching contacts (first 3)...')
  const contactsRes = await get(
    `https://www.zohoapis.in/books/v3/contacts?organization_id=${ZOHO_ORG_ID}&per_page=3&filter_by=Status.Active`,
    token
  )
  if (contactsRes.code !== 0) {
    console.error('   ❌ Contacts fetch failed:', contactsRes)
  } else {
    const contacts = contactsRes.contacts || []
    console.log(`   ✅ Contacts returned: ${contacts.length}`)
    if (contacts[0]) {
      console.log(`   Sample: "${contacts[0].contact_name}" | Phone: ${contacts[0].billing_address?.phone || 'N/A'} | Pricebook: ${contacts[0].pricebook_id || 'none'}`)
    }
  }

  console.log('\n✅ Zoho API connection validated successfully!\n')
}

main().catch(err => {
  console.error('\n❌ Unexpected error:', err)
  process.exit(1)
})
```

### Step 8: Write `scripts/test-whatsapp.ts`

```typescript
// scripts/test-whatsapp.ts
// Run: npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "Test message"

import * as https from 'https'

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env
const toPhone = process.argv[2]
const message = process.argv[3] || 'WineYard catalog test message ✅'

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.error('❌ Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID')
  process.exit(1)
}
if (!toPhone) {
  console.error('Usage: npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "message"')
  process.exit(1)
}

const phone = toPhone.replace('+', '')
const body = JSON.stringify({
  messaging_product: 'whatsapp',
  to: phone,
  type: 'text',
  text: { body: message },
})

const req = https.request({
  hostname: 'graph.facebook.com',
  path: `/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
  method: 'POST',
  headers: {
    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => {
    const parsed = JSON.parse(data)
    if (parsed.messages) {
      console.log(`✅ WhatsApp message sent to ${toPhone}. Message ID: ${parsed.messages[0].id}`)
    } else {
      console.error('❌ Send failed:', JSON.stringify(parsed, null, 2))
    }
  })
})
req.on('error', err => console.error('❌ Request error:', err))
req.write(body)
req.end()
```

### Step 9: Write `scripts/generate-types.sh`

```bash
#!/bin/bash
# scripts/generate-types.sh
# Generates TypeScript types from local Supabase schema

echo "Generating Supabase TypeScript types..."
npx supabase gen types typescript --local > types/database.generated.ts
echo "✅ Types written to types/database.generated.ts"
```

Make it executable: `chmod +x scripts/generate-types.sh`

### Step 10: Write the shared type files

#### `types/catalog.ts`
Write the complete CatalogItem, CartItem, SessionPayload, GuestPayload, EnquiryRequest, and EnquiryResponse interfaces exactly as defined in the architecture document (§13 Shared Contracts).

#### `types/zoho.ts`
Write minimal TypeScript interfaces for:
- `ZohoItem` (item_id, name, sku, brand, category_name, rate, available_stock, status, image_documents)
- `ZohoContact` (contact_id, contact_name, phone, billing_address.phone, pricebook_id, status)
- `ZohoPricebook` (pricebook_id, pricebook_name, items: [{item_id, rate}])
- `ZohoTokenResponse` (access_token, expires_in, token_type)
- `ZohoEstimateCreate` and `ZohoEstimateResponse`

### Step 11: Write stub files for Next.js app

For each of the following, write a minimal stub that:
- Has the correct exports (default export for pages, named exports for route handlers)
- Has a TODO comment at the top: `// TODO: Implement — see architecture docs §[relevant section]`
- Does NOT implement actual logic yet

Files to stub:
- All `route.ts` files (export GET/POST functions returning `NextResponse.json({ todo: true })`)
- All `page.tsx` files (export default function returning `<div>TODO</div>`)
- All `components/**/*.tsx` files (export default function returning `<div>TODO</div>`)
- All `lib/**/*.ts` files (export placeholder functions with TODO comments)

### Step 12: Write `app/src/middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Protect /admin routes with Supabase Auth
  if (request.nextUrl.pathname.startsWith('/admin') &&
      !request.nextUrl.pathname.startsWith('/admin/login')) {
    const response = NextResponse.next()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value },
          set(name, value, options) { response.cookies.set({ name, value, ...options }) },
          remove(name, options) { response.cookies.set({ name, value: '', ...options }) },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return response
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

### Step 13: Configure next.config.ts

```typescript
// app/next.config.ts
import type { NextConfig } from 'next'
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = withPWA(nextConfig)
```

### Step 14: Write `app/public/manifest.json`

```json
{
  "name": "WineYard Catalog",
  "short_name": "WineYard",
  "description": "WineYard CCTV product catalog",
  "start_url": "/catalog",
  "display": "standalone",
  "background_color": "#F8FAFB",
  "theme_color": "#0066CC",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Create placeholder icon files (1×1 blue pixel PNG is fine for now).

### Step 15: Write a root README.md

```markdown
# WineYard Digital Catalog

B2B product catalog for WineYard Technologies (CCTV distributor, Hyderabad).

## Quick Start

See `planning/WineYard_Architecture_v2.md` for full architecture.

### Prerequisites
- Node.js 18+
- Docker (for local Supabase)
- Supabase CLI: `npm install -g supabase`

### Local Development
```bash
cd app && npm install
cd .. && npx supabase start
npx supabase db push
./scripts/generate-types.sh
cp app/.env.local.example app/.env.local  # Fill in credentials
cd app && npm run dev
```

### Test Connections
```bash
# From repo root, with env vars loaded:
npx ts-node scripts/test-zoho-connection.ts
npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "test"
```

## Stack
- Frontend: Next.js 15 (App Router) → Vercel
- Database: Supabase (PostgreSQL 15)
- Sync: Supabase Edge Functions + pg_cron
- WhatsApp: Meta Business Cloud API
```
`

---

## Acceptance Criteria

After completing all steps, verify:

```bash
# 1. Next.js dev server starts without errors
cd app && npm run dev
# → Should open on localhost:3000 without TypeScript errors

# 2. Local Supabase runs
npx supabase status
# → Should show all services running (API, DB, Studio, etc.)

# 3. Migrations run clean
npx supabase db push
# → Should apply all 7 migrations with no errors

# 4. Types generate
./scripts/generate-types.sh
# → Should write types/database.generated.ts with all table types

# 5. No TypeScript errors
cd app && npx tsc --noEmit
# → Should pass (stubs may have any[] but no structural errors)
```

Report any errors and fix them before stopping. The setup is complete when all 5 checks pass.

---

## Phase 2: Connection Validation (Run after .env.local is filled in)

Once `app/.env.local` has real credentials, run:

```bash
# Load env vars (from repo root)
export $(grep -v '^#' app/.env.local | xargs)

# Test Zoho API
npx ts-node scripts/test-zoho-connection.ts

# Test WhatsApp (replace with your number)
npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "Hello from WineYard setup"
```

Expected output from Zoho test:
- ✅ Token obtained
- ✅ Items returned with sample item name/SKU/stock
- ✅ or ⚠️ Pricebooks (⚠️ is OK if scope not added yet)
- ✅ Contacts returned with sample contact

Expected output from WhatsApp test:
- ✅ Message sent with Message ID

If any test fails, fix the specific issue before moving to feature development.

---END---
