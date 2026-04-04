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
