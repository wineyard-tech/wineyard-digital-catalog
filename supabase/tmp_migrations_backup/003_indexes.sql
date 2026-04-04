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
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(token);

-- estimates
CREATE INDEX IF NOT EXISTS idx_estimates_contact ON estimates(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_estimates_phone   ON estimates(contact_phone);
CREATE INDEX IF NOT EXISTS idx_estimates_status  ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_date    ON estimates(date DESC);

-- sales_orders
CREATE INDEX IF NOT EXISTS idx_salesorders_contact ON sales_orders(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_salesorders_status  ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_salesorders_date    ON sales_orders(date DESC);
