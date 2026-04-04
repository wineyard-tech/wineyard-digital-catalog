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
