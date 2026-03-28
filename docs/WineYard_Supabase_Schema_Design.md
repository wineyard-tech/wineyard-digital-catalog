# WineYard Digital Catalog — Supabase Database Schema Design

**Database:** PostgreSQL 15 (Supabase)  
**Based on:** Zoho Books API v3 Entities  
**Prepared:** March 14, 2026

---

## Schema Design Philosophy

**Principles:**
1. **Minimal sync overhead:** Only store entities needed for catalog UX
2. **Zoho nomenclature:** Use Zoho field names where possible for clarity
3. **Denormalization where needed:** Trade storage for query performance
4. **Location-wise stock:** Separate table for per-location inventory
5. **Lazy user creation:** Only sync contacts that actually use the platform
6. **JSONB for flexibility:** Store complex Zoho data structures as-is

---

## Entity Relationship Diagram (ER)

```
┌─────────────────┐
│   TENANTS       │ (Future multi-distributor, not Phase 1)
│ ─────────────── │
│ id (PK)         │
│ name            │
│ zoho_org_id     │
└────────┬────────┘
         │
         │ (1:N - Future)
         │
┌────────▼────────────────────┐          ┌──────────────────────┐
│   ITEMS                     │          │   ITEM_LOCATIONS     │
│ ─────────────────────────── │          │ ──────────────────── │
│ zoho_item_id (PK)           │◄─────────┤ zoho_item_id (FK)    │
│ item_name                   │  (1:N)   │ zoho_location_id     │
│ sku (UNIQUE)                │          │ location_name        │
│ category_id, category_name  │          │ stock_on_hand        │
│ brand                       │          │ available_stock      │
│ description                 │          └──────────────────────┘
│ base_rate                   │
│ purchase_rate               │          ┌──────────────────────┐
│ available_stock (TOTAL)     │          │   PRICEBOOKS         │
│ image_urls (JSONB)          │◄─────────┤ zoho_pricebook_id    │
│ custom_fields (JSONB)       │  (1:N)   │ zoho_item_id (FK)    │
│ search_vector (TSVECTOR)    │          │ custom_rate          │
└─────────────────────────────┘          └──────────────────────┘
         ▲
         │
         │ (N:1)
         │
┌────────┴────────────────────┐          ┌──────────────────────┐
│   ESTIMATES (Enquiries)     │          │   SALES_ORDERS       │
│ ─────────────────────────── │          │ ──────────────────── │
│ id (PK)                     │          │ id (PK)              │
│ zoho_estimate_id (UNIQUE)   │──────────┤ converted_from_      │
│ estimate_number             │ (1:1)    │   estimate_id (FK)   │
│ zoho_contact_id (FK)        │          │ zoho_salesorder_id   │
│ status (draft/sent/...)     │          │ salesorder_number    │
│ line_items (JSONB)          │          │ zoho_contact_id (FK) │
│ total                       │          │ status               │
│ whatsapp_sent               │          │ line_items (JSONB)   │
│ converted_to_salesorder_id  │          │ total                │
└─────────────────────────────┘          └──────────────────────┘
         ▲                                         ▲
         │                                         │
         │ (N:1)                                   │ (N:1)
         │                                         │
┌────────┴────────────────────┐          ┌────────┴─────────────┐
│   CONTACTS (Integrators)    │          │   CONTACT_PERSONS    │
│ ─────────────────────────── │          │ ──────────────────── │
│ zoho_contact_id (PK)        │◄─────────┤ zoho_contact_        │
│ contact_name                │  (1:N)   │   person_id (PK)     │
│ company_name                │          │ zoho_contact_id (FK) │
│ phone (UNIQUE)              │          │ first_name           │
│ email                       │          │ last_name            │
│ pricebook_id                │◄─┐       │ phone, mobile        │
│ billing_address (JSONB)     │  │       │ is_primary           │
│ shipping_address (JSONB)    │  │       └──────────────────────┘
│ status (active/inactive)    │  │
└─────────────────────────────┘  │
         ▲                       │
         │                       │ (N:1)
         │ (1:1)                 │
         │                       │
┌────────┴────────────────────┐  │
│   SESSIONS (Auth Tokens)    │  │
│ ─────────────────────────── │  │
│ id (PK)                     │  │
│ token (UUID, UNIQUE)        │  │
│ zoho_contact_id (FK)        │  │
│ phone                       │  │
│ expires_at                  │  │
│ last_activity_at            │  │
└─────────────────────────────┘  │
                                 │
         ┌───────────────────────┘
         │ (References via pricebook_id)
         │
┌────────▼────────────────────┐
│   (Pricebook metadata)      │
│   Not stored — inline in    │
│   PRICEBOOKS table          │
└─────────────────────────────┘
```

---

## Core Tables (Synced from Zoho Books API)

### 1. **items** — Products Catalog

**Source:** Zoho Books `GET /items` API  
**Sync Frequency:** 4× daily (8 AM, 12 PM, 4 PM, 8 PM)

```sql
CREATE TABLE items (
  -- Primary Key (Zoho item_id)
  zoho_item_id TEXT PRIMARY KEY,
  
  -- Basic Info
  item_name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  
  -- Category (from API response: category_id, category_name)
  category_id TEXT,
  category_name TEXT,
  
  -- Brand (from API custom field or brand field)
  brand TEXT,
  manufacturer TEXT,
  
  -- Description & Classification
  description TEXT,
  hsn_or_sac TEXT, -- HSN code for GST
  unit TEXT DEFAULT 'pcs', -- Unit of measurement
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inactive'
  item_type TEXT DEFAULT 'inventory', -- 'inventory' | 'service' | 'non_inventory'
  product_type TEXT DEFAULT 'goods', -- 'goods' | 'service'
  
  -- Pricing
  base_rate DECIMAL(10, 2), -- Selling price (rate field in API)
  purchase_rate DECIMAL(10, 2),
  
  -- Tax
  is_taxable BOOLEAN DEFAULT true,
  tax_id TEXT,
  tax_name TEXT,
  tax_percentage DECIMAL(5, 2) DEFAULT 18.00, -- GST 18%
  
  -- Inventory Tracking
  track_inventory BOOLEAN DEFAULT true,
  track_serial_number BOOLEAN DEFAULT false,
  
  -- Stock (Total across all locations)
  available_stock INTEGER DEFAULT 0, -- From API: available_stock
  actual_available_stock INTEGER DEFAULT 0, -- From API: actual_available_stock
  reorder_level INTEGER,
  
  -- Product Codes
  upc TEXT, -- Universal Product Code
  ean TEXT, -- European Article Number
  isbn TEXT, -- International Standard Book Number
  part_number TEXT,
  
  -- Images (Store R2 URLs as JSONB array)
  image_urls JSONB DEFAULT '[]'::jsonb,
  -- Example: ["https://r2.wineyard.com/items/123.jpg", "https://r2.wineyard.com/items/123-2.jpg"]
  
  -- Custom Fields (Store any additional Zoho custom fields)
  custom_fields JSONB DEFAULT '{}'::jsonb,
  -- Example: {"warranty": "1 year", "color": "black"}
  
  -- Full-Text Search (For Postgres fallback search)
  search_vector TSVECTOR,
  
  -- Metadata
  created_time TIMESTAMPTZ, -- From Zoho: created_time
  last_modified_time TIMESTAMPTZ, -- From Zoho: last_modified_time
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_category_name ON items(category_name);
CREATE INDEX idx_items_brand ON items(brand);
CREATE INDEX idx_items_sku ON items(sku);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_stock ON items(available_stock) WHERE available_stock > 0;
CREATE INDEX idx_items_search_vector ON items USING GIN(search_vector);

-- Full-Text Search Trigger
CREATE OR REPLACE FUNCTION items_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.item_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.sku, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_search_vector_trigger
BEFORE INSERT OR UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION items_search_vector_update();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at_trigger
BEFORE UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Zoho API Mapping:**
```javascript
// Zoho Books GET /items API response
{
  "item_id": "2251466000000251523",
  "name": "10A SMPS Metal Body CP Plus",
  "sku": "CP-DPS-MD100P-12D",
  "category_id": "2251466000000153079",
  "category_name": "SMPS",
  "brand": "CP Plus",
  "description": "CP-DPS-MD100P-12D",
  "rate": 590.0,
  "purchase_rate": 521.0,
  "available_stock": 345.0,
  "actual_available_stock": 336.0,
  "status": "active",
  "hsn_or_sac": "84716060",
  // ... map to items table
}
```

---

### 2. **item_locations** — Location-Wise Stock

**Source:** Zoho Books `GET /items/{item_id}` (locations array) OR Zoho Inventory `GET /reports/warehouse` API  
**Sync Frequency:** 4× daily (same as items)

```sql
CREATE TABLE item_locations (
  id BIGSERIAL PRIMARY KEY,
  
  -- Foreign Keys
  zoho_item_id TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  zoho_location_id TEXT NOT NULL,
  
  -- Location Info
  location_name TEXT NOT NULL,
  location_status TEXT DEFAULT 'active', -- 'active' | 'inactive'
  is_primary BOOLEAN DEFAULT false,
  
  -- Stock Levels
  stock_on_hand INTEGER DEFAULT 0, -- Total physical stock
  available_stock INTEGER DEFAULT 0, -- Stock available to sell
  actual_available_stock INTEGER DEFAULT 0, -- Stock minus committed/reserved
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: One row per item per location
  UNIQUE(zoho_item_id, zoho_location_id)
);

-- Indexes
CREATE INDEX idx_item_locations_item ON item_locations(zoho_item_id);
CREATE INDEX idx_item_locations_location ON item_locations(zoho_location_id);
CREATE INDEX idx_item_locations_stock ON item_locations(available_stock) WHERE available_stock > 0;

-- Auto-update trigger
CREATE TRIGGER item_locations_updated_at_trigger
BEFORE UPDATE ON item_locations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Why Separate Table?**
- WineYard has 5 locations (outlets across Hyderabad/AP/Telangana)
- Each item can have stock in 0-5 locations
- Easier to query: "Show products with stock in Kukatpally location"
- Supports future: "Find nearest location with stock for customer"

**Zoho API Mapping:**

*Option 1: From GET /items (if Zoho Books returns locations array):*
```javascript
{
  "item_id": "2251466000000251523",
  "locations": [
    {
      "location_id": "460000000038080",
      "location_name": "Kukatpally Outlet",
      "status": "active",
      "is_primary": true,
      "location_stock_on_hand": 150,
      "location_available_stock": 145,
      "location_actual_available_stock": 140
    },
    // ... 4 more locations
  ]
}
```

*Option 2: From Zoho Inventory Reports API (if Books doesn't return locations):*
```bash
GET /inventory/v1/reports/warehouse?organization_id=XXX
```

**Important:** Check if WineYard's Zoho Books API returns `locations` array in items response. If not, we'll need to use Zoho Inventory API or create a separate sync job.

---

### 3. **contacts** — Customer Integrators

**Source:** Zoho Books `GET /contacts` API  
**Sync Frequency:** 1× daily (8 AM) + On-demand (lazy creation on first login)

```sql
CREATE TABLE contacts (
  -- Primary Key (Zoho contact_id)
  zoho_contact_id TEXT PRIMARY KEY,
  
  -- Contact Info
  contact_name TEXT NOT NULL, -- Display name
  company_name TEXT, -- Legal company name
  contact_type TEXT DEFAULT 'customer', -- 'customer' | 'vendor'
  status TEXT DEFAULT 'active', -- 'active' | 'inactive'
  
  -- Primary Contact Person
  primary_contact_person_id TEXT, -- References contact_persons.zoho_contact_person_id
  
  -- Pricing
  pricebook_id TEXT, -- Custom price list assigned to this customer (NULL = base pricing)
  
  -- Contact Details
  phone TEXT UNIQUE, -- From billing_address.phone or primary contact_person.phone
  email TEXT,
  
  -- Addresses (Store as JSONB for flexibility)
  billing_address JSONB,
  /*
  Example:
  {
    "attention": "John Doe",
    "address": "123 Main St",
    "street2": "Suite 400",
    "city": "Hyderabad",
    "state": "Telangana",
    "zip": "500081",
    "country": "India",
    "phone": "+919876543210"
  }
  */
  shipping_address JSONB, -- Same structure as billing_address
  
  -- Payment Terms
  payment_terms INTEGER, -- Days (e.g., 30 for "Net 30")
  payment_terms_label TEXT, -- Human-readable (e.g., "Net 30 Days")
  
  -- Currency
  currency_id TEXT,
  currency_code TEXT DEFAULT 'INR',
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_time TIMESTAMPTZ,
  last_modified_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_pricebook ON contacts(pricebook_id);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_type ON contacts(contact_type);

-- Auto-update trigger
CREATE TRIGGER contacts_updated_at_trigger
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Lazy User Creation Strategy:**

Instead of syncing all 7,000 contacts from Zoho Books, we create users on-demand:

1. **User sends WhatsApp message** with phone number
2. **Check if exists in Supabase:**
   - YES → Generate magic link → send
   - NO → Verify against Zoho Books Contacts API
3. **Verification against Zoho:**
   - Call `GET /contacts?phone={phone}`
   - If found + active → Create in Supabase + generate magic link
   - If not found → Reject ("Contact WineYard to register")
4. **Subsequent logins:** Trust Supabase (no Zoho verification)
5. **Daily sync (8 AM):** Update status (active/inactive) for existing users only

**Why This Works:**
- Only 500 active users expected (not 7,000)
- Reduces Supabase storage by 93% (500 vs 7,000)
- Reduces API calls (no need to sync 7,000 contacts daily)
- First login verifies authenticity against Zoho
- No security risk (Zoho is source of truth)

**Zoho API Mapping:**
```javascript
// Zoho Books GET /contacts API response
{
  "contact_id": "2251466000000123456",
  "contact_name": "Ramesh Electronics",
  "company_name": "Ramesh Electronics Pvt Ltd",
  "contact_type": "customer",
  "status": "active",
  "primary_contact_person_id": "2251466000000123457",
  "pricebook_id": "2251466000000098765", // Custom pricing assigned
  "billing_address": {
    "attention": "Ramesh Kumar",
    "address": "Plot No 45, KPHB Colony",
    "city": "Hyderabad",
    "state": "Telangana",
    "zip": "500072",
    "country": "India",
    "phone": "+919876543210"
  },
  "payment_terms": 30,
  "payment_terms_label": "Net 30"
}
```

---

### 4. **contact_persons** — Team Members per Integrator

**Source:** Zoho Books `GET /contacts/{contact_id}` (includes contact_persons array)  
**Sync Frequency:** 1× daily (8 AM) + On-demand (when parent contact is created)

```sql
CREATE TABLE contact_persons (
  -- Primary Key (Zoho contact_person_id)
  zoho_contact_person_id TEXT PRIMARY KEY,
  
  -- Foreign Key to parent Contact
  zoho_contact_id TEXT NOT NULL REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE,
  
  -- Personal Info
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  
  -- Primary Contact Flag
  is_primary BOOLEAN DEFAULT false, -- Is this the main contact person?
  
  -- Communication Preferences (from Zoho API)
  communication_preference JSONB,
  /*
  Example:
  {
    "is_email_enabled": true,
    "is_sms_enabled": false,
    "is_whatsapp_enabled": true
  }
  */
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contact_persons_contact ON contact_persons(zoho_contact_id);
CREATE INDEX idx_contact_persons_phone ON contact_persons(phone);
CREATE INDEX idx_contact_persons_mobile ON contact_persons(mobile);
CREATE INDEX idx_contact_persons_email ON contact_persons(email);

-- Auto-update trigger
CREATE TRIGGER contact_persons_updated_at_trigger
BEFORE UPDATE ON contact_persons
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Pricing Inheritance:**
- All `contact_persons` under a `contact` inherit the same pricing from `contacts.pricebook_id`
- This matches Zoho Books behavior

**Zoho API Mapping:**
```javascript
// Zoho Books GET /contacts/{contact_id} response
{
  "contact_id": "2251466000000123456",
  "contact_persons": [
    {
      "contact_person_id": "2251466000000123457",
      "first_name": "Ramesh",
      "last_name": "Kumar",
      "email": "ramesh@rameshelectronics.com",
      "phone": "+919876543210",
      "mobile": "+919876543210",
      "is_primary": true,
      "communication_preference": {
        "is_email_enabled": true,
        "is_whatsapp_enabled": true
      }
    },
    {
      "contact_person_id": "2251466000000123458",
      "first_name": "Suresh",
      "last_name": "Kumar",
      "email": "suresh@rameshelectronics.com",
      "phone": "+919876543211",
      "mobile": "+919876543211",
      "is_primary": false
    }
  ]
}
```

---

### 5. **pricebooks** — Customer-Specific Pricing

**Source:** Zoho Books `GET /items/{item_id}/pricelists` OR `GET /pricebooks` API  
**Sync Frequency:** 1× daily (8 AM) — Pricing changes are rare

```sql
CREATE TABLE pricebooks (
  id BIGSERIAL PRIMARY KEY,
  
  -- Zoho Identifiers
  zoho_pricebook_id TEXT NOT NULL, -- Pricebook ID from Zoho
  pricebook_name TEXT NOT NULL, -- E.g., "VIP Customer Pricing", "Bulk Discount Tier 1"
  
  -- Item Reference
  zoho_item_id TEXT NOT NULL REFERENCES items(zoho_item_id) ON DELETE CASCADE,
  
  -- Custom Rate
  custom_rate DECIMAL(10, 2) NOT NULL, -- Customer-specific price for this item
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: One price per pricebook per item
  UNIQUE(zoho_pricebook_id, zoho_item_id)
);

-- Indexes
CREATE INDEX idx_pricebooks_item ON pricebooks(zoho_item_id);
CREATE INDEX idx_pricebooks_pricebook ON pricebooks(zoho_pricebook_id);

-- Auto-update trigger
CREATE TRIGGER pricebooks_updated_at_trigger
BEFORE UPDATE ON pricebooks
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Pricing Logic (Fallback to Base Rate):**
```sql
-- Get final price for a customer
SELECT 
  i.zoho_item_id,
  i.item_name,
  i.base_rate,
  COALESCE(pb.custom_rate, i.base_rate) AS final_price,
  CASE 
    WHEN pb.custom_rate IS NOT NULL THEN 'custom'
    ELSE 'base'
  END AS price_type
FROM items i
LEFT JOIN contacts c ON c.zoho_contact_id = :contact_id
LEFT JOIN pricebooks pb 
  ON pb.zoho_item_id = i.zoho_item_id 
  AND pb.zoho_pricebook_id = c.pricebook_id
WHERE i.zoho_item_id = :item_id;
```

**Example:**
- Item: "Hikvision 2MP Camera", base_rate = ₹2,500
- Customer: "Ramesh Electronics", pricebook_id = "PB001"
- Pricebook "PB001" has custom_rate = ₹2,200 for this item
- **Final price for Ramesh:** ₹2,200 (custom)
- **Final price for new customer (no pricebook):** ₹2,500 (base)

**Zoho API Mapping:**
```javascript
// Zoho Books GET /pricebooks response
{
  "pricebooks": [
    {
      "pricebook_id": "2251466000000098765",
      "pricebook_name": "VIP Customer Pricing",
      "items": [
        {
          "item_id": "2251466000000251523",
          "rate": 2200.00 // Custom rate (vs base_rate 2500)
        }
      ]
    }
  ]
}
```

---

## Application Tables (Local Only, NOT Synced to Zoho)

### 6. **estimates** — Enquiries / Draft Quotes

**Purpose:** Integrators create enquiries, save as Estimates before conversion to Sales Orders  
**Sync Direction:** Supabase → Zoho (when integrator creates enquiry)

```sql
CREATE TABLE estimates (
  -- Primary Key
  id BIGSERIAL PRIMARY KEY,
  
  -- Zoho Reference (NULL until synced to Zoho Books)
  zoho_estimate_id TEXT UNIQUE,
  estimate_number TEXT UNIQUE NOT NULL, -- Auto-generated: EST-001, EST-002
  
  -- Customer Reference
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  contact_phone TEXT NOT NULL, -- Denormalized for quick lookup
  
  -- Status Workflow
  status TEXT NOT NULL DEFAULT 'draft',
  -- Allowed values: 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'converted' | 'expired'
  
  -- Dates
  date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE, -- Auto-set to date + 7 days
  
  -- Line Items (Store as JSONB for flexibility)
  line_items JSONB NOT NULL,
  /*
  Example:
  [
    {
      "line_item_id": 1,
      "zoho_item_id": "2251466000000251523",
      "item_name": "Hikvision 2MP Camera",
      "sku": "HIK-2MP-DOME",
      "quantity": 10,
      "rate": 2200.00,
      "discount": 0,
      "tax_percentage": 18.00,
      "item_total": 22000.00
    },
    {
      "line_item_id": 2,
      "zoho_item_id": "2251466000000251524",
      "item_name": "16 Channel NVR",
      "sku": "HIK-NVR-16CH",
      "quantity": 1,
      "rate": 15000.00,
      "discount": 500.00,
      "tax_percentage": 18.00,
      "item_total": 14500.00
    }
  ]
  */
  
  -- Totals
  subtotal DECIMAL(10, 2) NOT NULL, -- Sum of all item_total (before tax)
  tax_total DECIMAL(10, 2) NOT NULL, -- Total tax amount
  total DECIMAL(10, 2) NOT NULL, -- Grand total (subtotal + tax)
  
  -- Notes
  notes TEXT, -- Customer notes / special requests
  
  -- WhatsApp Integration
  whatsapp_sent BOOLEAN DEFAULT false,
  whatsapp_sent_at TIMESTAMPTZ,
  
  -- Conversion to Sales Order
  converted_to_salesorder_id BIGINT REFERENCES sales_orders(id),
  converted_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_estimates_contact ON estimates(zoho_contact_id);
CREATE INDEX idx_estimates_phone ON estimates(contact_phone);
CREATE INDEX idx_estimates_status ON estimates(status);
CREATE INDEX idx_estimates_date ON estimates(date DESC);
CREATE INDEX idx_estimates_zoho_id ON estimates(zoho_estimate_id);

-- Auto-increment estimate_number
CREATE SEQUENCE estimate_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estimate_number IS NULL THEN
    NEW.estimate_number := 'EST-' || LPAD(nextval('estimate_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER estimates_number_trigger
BEFORE INSERT ON estimates
FOR EACH ROW EXECUTE FUNCTION generate_estimate_number();

-- Auto-update trigger
CREATE TRIGGER estimates_updated_at_trigger
BEFORE UPDATE ON estimates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Estimate Workflow:**
1. **Draft:** Integrator adds items to cart → creates estimate → status = 'draft'
2. **Sent:** WhatsApp quotation sent → status = 'sent', whatsapp_sent = true
3. **Accepted:** Integrator confirms → status = 'accepted'
4. **Converted:** Admin converts to Sales Order → status = 'converted', converted_to_salesorder_id set
5. **Declined:** Integrator rejects → status = 'declined'
6. **Expired:** expiry_date passed, not converted → status = 'expired'

---

### 7. **sales_orders** — Confirmed Orders

**Purpose:** Converted estimates become Sales Orders, synced to Zoho Books  
**Sync Direction:** Supabase ↔ Zoho (bidirectional)

```sql
CREATE TABLE sales_orders (
  -- Primary Key
  id BIGSERIAL PRIMARY KEY,
  
  -- Zoho Reference
  zoho_salesorder_id TEXT UNIQUE,
  salesorder_number TEXT UNIQUE NOT NULL, -- Auto-generated: SO-001, SO-002
  
  -- Customer Reference
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id),
  contact_phone TEXT NOT NULL,
  
  -- Status Workflow
  status TEXT NOT NULL DEFAULT 'draft',
  -- Allowed values: 'draft' | 'confirmed' | 'void' | 'invoiced'
  
  -- Dates
  date DATE DEFAULT CURRENT_DATE,
  shipment_date DATE, -- Expected delivery date
  
  -- Line Items (Same structure as estimates)
  line_items JSONB NOT NULL,
  
  -- Totals
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_total DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  
  -- Notes
  notes TEXT,
  customer_notes TEXT, -- Notes visible to customer
  
  -- Conversion from Estimate
  converted_from_estimate_id BIGINT REFERENCES estimates(id),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_salesorders_contact ON sales_orders(zoho_contact_id);
CREATE INDEX idx_salesorders_phone ON sales_orders(contact_phone);
CREATE INDEX idx_salesorders_status ON sales_orders(status);
CREATE INDEX idx_salesorders_date ON sales_orders(date DESC);
CREATE INDEX idx_salesorders_zoho_id ON sales_orders(zoho_salesorder_id);
CREATE INDEX idx_salesorders_estimate ON sales_orders(converted_from_estimate_id);

-- Auto-increment salesorder_number
CREATE SEQUENCE salesorder_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_salesorder_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.salesorder_number IS NULL THEN
    NEW.salesorder_number := 'SO-' || LPAD(nextval('salesorder_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER salesorders_number_trigger
BEFORE INSERT ON sales_orders
FOR EACH ROW EXECUTE FUNCTION generate_salesorder_number();

-- Auto-update trigger
CREATE TRIGGER salesorders_updated_at_trigger
BEFORE UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Estimate → Sales Order Conversion:**
```sql
-- SQL function to convert estimate to sales order
CREATE OR REPLACE FUNCTION convert_estimate_to_salesorder(p_estimate_id BIGINT)
RETURNS BIGINT AS $$
DECLARE
  v_salesorder_id BIGINT;
BEGIN
  -- Insert into sales_orders
  INSERT INTO sales_orders (
    zoho_contact_id, 
    contact_phone, 
    line_items, 
    subtotal, 
    tax_total, 
    total,
    notes,
    converted_from_estimate_id,
    status
  )
  SELECT 
    zoho_contact_id,
    contact_phone,
    line_items,
    subtotal,
    tax_total,
    total,
    notes,
    id,
    'confirmed' -- Start as confirmed
  FROM estimates 
  WHERE id = p_estimate_id
  RETURNING id INTO v_salesorder_id;
  
  -- Update estimate status
  UPDATE estimates 
  SET 
    status = 'converted',
    converted_to_salesorder_id = v_salesorder_id,
    converted_at = NOW()
  WHERE id = p_estimate_id;
  
  RETURN v_salesorder_id;
END;
$$ LANGUAGE plpgsql;
```

**Usage:**
```sql
-- Convert estimate #42 to sales order
SELECT convert_estimate_to_salesorder(42);
-- Returns: 15 (new sales_order.id)
```

---

### 8. **sessions** — Magic Link Authentication Tokens

**Purpose:** Manage WhatsApp magic link authentication  
**Not Synced** (Purely for app authentication)

```sql
CREATE TABLE sessions (
  -- Primary Key
  id BIGSERIAL PRIMARY KEY,
  
  -- Token (UUID for magic link)
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  
  -- User Reference
  zoho_contact_id TEXT REFERENCES contacts(zoho_contact_id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  
  -- Session Metadata
  user_agent TEXT, -- Browser/device info
  ip_address INET, -- IP address (for security audit)
  
  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL, -- 30 days from creation
  last_activity_at TIMESTAMPTZ DEFAULT NOW(), -- Updated on each request
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_phone ON sessions(phone);
CREATE INDEX idx_sessions_contact ON sessions(zoho_contact_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Auto-set expires_at to 30 days
CREATE OR REPLACE FUNCTION set_session_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_expiry_trigger
BEFORE INSERT ON sessions
FOR EACH ROW EXECUTE FUNCTION set_session_expiry();

-- Cleanup expired sessions (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM sessions 
  WHERE 
    expires_at < NOW() 
    OR last_activity_at < NOW() - INTERVAL '15 days'; -- Inactive for 15 days
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;
```

**Magic Link Flow:**

1. **User sends WhatsApp:** "Catalog"
2. **Backend receives message:**
   ```sql
   -- Check if contact exists
   SELECT zoho_contact_id FROM contacts WHERE phone = '+919876543210';
   
   -- If not found → Verify against Zoho Books API → Create contact
   INSERT INTO contacts (zoho_contact_id, contact_name, phone, ...)
   VALUES (...);
   ```

3. **Generate magic link:**
   ```sql
   INSERT INTO sessions (zoho_contact_id, phone)
   VALUES ('ZohoContactID123', '+919876543210')
   RETURNING token;
   -- Returns: '550e8400-e29b-41d4-a716-446655440000'
   ```

4. **Send magic link:**
   ```
   https://catalog.wineyard.in/auth/550e8400-e29b-41d4-a716-446655440000
   ```

5. **User clicks link:**
   ```sql
   -- Validate token
   SELECT zoho_contact_id, phone, expires_at 
   FROM sessions 
   WHERE token = '550e8400-e29b-41d4-a716-446655440000'
     AND expires_at > NOW();
   
   -- If valid → Set HTTP-only cookie
   -- Cookie: session_token=550e8400-e29b-41d4-a716-446655440000; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
   ```

6. **Update last activity:**
   ```sql
   UPDATE sessions 
   SET last_activity_at = NOW() 
   WHERE token = :cookie_token;
   ```

---

## Additional Entities to Consider

### **Locations** (Reference Table)

**Source:** Zoho Books `GET /locations` API  
**Sync:** 1× weekly (locations rarely change)

```sql
CREATE TABLE locations (
  zoho_location_id TEXT PRIMARY KEY,
  location_name TEXT NOT NULL,
  location_type TEXT, -- 'general' | 'line_item_only'
  is_primary BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- 'active' | 'inactive'
  
  -- Address
  address JSONB,
  email TEXT,
  phone TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why Needed:**
- Store location metadata (address, phone)
- Display location names in UI ("Stock available at Kukatpally outlet")
- Filter products by location

---

### **Categories** (Reference Table)

**Source:** Derived from `items.category_id` / `items.category_name`  
**Sync:** On-demand (when new category appears in items)

```sql
CREATE TABLE categories (
  zoho_category_id TEXT PRIMARY KEY,
  category_name TEXT UNIQUE NOT NULL,
  parent_category_id TEXT REFERENCES categories(zoho_category_id),
  status TEXT DEFAULT 'active',
  
  -- UI Metadata
  display_order INTEGER DEFAULT 0,
  icon_url TEXT, -- Cloudflare R2 URL for category icon
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why Needed:**
- Category hierarchy (if Zoho supports parent-child)
- Category-based navigation in UI
- Upload category icons (cameras, NVRs, cables, etc.)

---

### **Brands** (Reference Table)

**Source:** Derived from `items.brand`  
**Sync:** On-demand (when new brand appears in items)

```sql
CREATE TABLE brands (
  id BIGSERIAL PRIMARY KEY,
  brand_name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',
  
  -- UI Metadata
  logo_url TEXT, -- Cloudflare R2 URL for brand logo
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why Needed:**
- Brand filtering in UI
- Upload brand logos (Hikvision, CP Plus, Dahua, etc.)
- Brand-based promotions

---

## Missing Entities / Questions

### ❓ **Question 1: Custom Fields in Items**
- Zoho Books allows custom fields per item
- Your `items_data.json` doesn't show custom fields explicitly
- **Action:** Verify with WineYard if they use custom fields (e.g., "Warranty", "Resolution", "Night Vision Range")
- **Storage:** Already included as `items.custom_fields JSONB`

### ❓ **Question 2: Location Stock API**
- Zoho Books API docs show `locations` array in items response
- Your `items_data.json` doesn't include this array
- **Action:** Test API call `GET /items?organization_id=XXX` to confirm if locations are returned
- **Fallback:** Use Zoho Inventory Reports API: `GET /reports/warehouse`

### ❓ **Question 3: Pricebook Structure**
- Zoho Books supports multiple pricebooks per organization
- **Action:** Confirm with WineYard how many pricebooks they have
- **Storage:** Already designed for N pricebooks

### ❓ **Question 4: Taxes (GST)**
- India uses GST (18% standard rate)
- Zoho Books supports IGST (interstate) vs GST (intrastate)
- **Action:** Confirm if different tax rates apply per location
- **Storage:** Already included as `items.tax_percentage`

### ❓ **Question 5: Serial Number Tracking**
- `items.track_serial_number` field exists in Zoho API
- High-value items (cameras, NVRs) may require serial number tracking
- **Action:** Confirm if WineYard tracks serial numbers
- **Impact:** If yes, need separate `item_serial_numbers` table

---

## Sync Implementation Pseudocode

### **Daily Sync (8 AM): Contacts & Pricebooks**
```javascript
async function syncContactsDaily() {
  // Fetch all contacts from Zoho Books
  const zohoContacts = await zoho.get('/contacts', {
    filter_by: 'Status.Active', // Only active contacts
    per_page: 200
  });
  
  for (const contact of zohoContacts) {
    // Upsert into Supabase (only if user exists — lazy creation)
    await supabase.from('contacts').upsert({
      zoho_contact_id: contact.contact_id,
      contact_name: contact.contact_name,
      company_name: contact.company_name,
      phone: contact.billing_address?.phone || contact.contact_persons[0]?.phone,
      pricebook_id: contact.pricebook_id,
      status: contact.status,
      // ... other fields
    }, { onConflict: 'zoho_contact_id' });
    
    // Sync contact_persons
    for (const person of contact.contact_persons) {
      await supabase.from('contact_persons').upsert({
        zoho_contact_person_id: person.contact_person_id,
        zoho_contact_id: contact.contact_id,
        first_name: person.first_name,
        // ... other fields
      }, { onConflict: 'zoho_contact_person_id' });
    }
  }
}

async function syncPricebooksDaily() {
  const pricebooks = await zoho.get('/pricebooks');
  
  for (const pb of pricebooks) {
    for (const item of pb.items) {
      await supabase.from('pricebooks').upsert({
        zoho_pricebook_id: pb.pricebook_id,
        pricebook_name: pb.pricebook_name,
        zoho_item_id: item.item_id,
        custom_rate: item.rate
      }, { onConflict: ['zoho_pricebook_id', 'zoho_item_id'] });
    }
  }
}
```

### **4× Daily Sync (8 AM, 12 PM, 4 PM, 8 PM): Items & Stock**
```javascript
async function syncItemsAndStock() {
  // Fetch all active items
  const items = await zoho.get('/items', {
    filter_by: 'Status.Active',
    per_page: 200
  });
  
  for (const item of items) {
    // Upsert item
    await supabase.from('items').upsert({
      zoho_item_id: item.item_id,
      item_name: item.name,
      sku: item.sku,
      category_id: item.category_id,
      category_name: item.category_name,
      brand: item.brand,
      base_rate: item.rate,
      available_stock: item.available_stock,
      // ... other fields
    }, { onConflict: 'zoho_item_id' });
    
    // Sync location-wise stock
    // Option 1: If Zoho Books returns locations in items API
    if (item.locations) {
      for (const loc of item.locations) {
        await supabase.from('item_locations').upsert({
          zoho_item_id: item.item_id,
          zoho_location_id: loc.location_id,
          location_name: loc.location_name,
          stock_on_hand: loc.location_stock_on_hand,
          available_stock: loc.location_available_stock
        }, { onConflict: ['zoho_item_id', 'zoho_location_id'] });
      }
    }
    
    // Option 2: If need separate API call for locations
    // const itemDetails = await zoho.get(`/items/${item.item_id}`);
    // ... process itemDetails.locations
  }
  
  // Update Typesense search index
  await typesense.collections('items').documents().import(items);
}
```

### **Ad-hoc Sync: Estimate/Sales Order Creation**
```javascript
async function createEstimateInZoho(estimateId) {
  const estimate = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single();
  
  // Create in Zoho Books
  const zohoEstimate = await zoho.post('/estimates', {
    customer_id: estimate.zoho_contact_id,
    date: estimate.date,
    expiry_date: estimate.expiry_date,
    line_items: estimate.line_items.map(item => ({
      item_id: item.zoho_item_id,
      quantity: item.quantity,
      rate: item.rate,
      discount: item.discount
    })),
    notes: estimate.notes
  });
  
  // Update Supabase with Zoho ID
  await supabase.from('estimates').update({
    zoho_estimate_id: zohoEstimate.estimate_id,
    status: 'sent'
  }).eq('id', estimateId);
}
```

---

## Summary: Entity Checklist

| Entity | Zoho Source | Sync Freq | Supabase Table | Purpose |
|---|---|---|---|---|
| **Items** | ✅ GET /items | 4×/day | `items` | Product catalog |
| **Item Locations** | ⚠️ GET /items (or Inventory API) | 4×/day | `item_locations` | Location-wise stock |
| **Contacts** | ✅ GET /contacts | 1×/day (lazy) | `contacts` | Customer integrators |
| **Contact Persons** | ✅ GET /contacts (nested) | 1×/day | `contact_persons` | Team members |
| **Pricebooks** | ✅ GET /pricebooks | 1×/day | `pricebooks` | Custom pricing |
| **Categories** | ✅ Derived from items | On-demand | `categories` (optional) | Category metadata |
| **Brands** | ✅ Derived from items | On-demand | `brands` (optional) | Brand metadata |
| **Locations** | ✅ GET /locations | 1×/week | `locations` (optional) | Location metadata |
| **Estimates** | ❌ Local only | N/A | `estimates` | Enquiries/quotes |
| **Sales Orders** | ✅ GET /salesorders (read) | 4×/day | `sales_orders` | Confirmed orders |
| **Sessions** | ❌ Local only | N/A | `sessions` | Magic link auth |

**✅ = Confirmed in Zoho API**  
**⚠️ = Needs verification**  
**❌ = Not synced from Zoho**

---

## Next Steps: Schema Implementation

1. **Create Supabase project** (via Supabase Dashboard)
2. **Run SQL migrations** (execute table creation scripts above)
3. **Test Zoho API calls** to confirm `locations` array in items response
4. **Write sync scripts** (Node.js/TypeScript)
5. **Set up Vercel Cron** for scheduled syncs
6. **Test lazy user creation** flow (magic link auth)

**Estimated Implementation Time:** 2-3 days (including testing)

---

**Questions? Review the schema and flag any missing entities or clarifications needed.**
