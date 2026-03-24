-- ── Invoices table ────────────────────────────────────────────────────────────
-- Mirrors the structure of the Zoho Books Invoice API and follows the same
-- JSONB line_items pattern used in the estimates table.

CREATE TABLE IF NOT EXISTS public.invoices (
  id                          BIGSERIAL PRIMARY KEY,
  zoho_invoice_id             TEXT UNIQUE,
  invoice_number              TEXT UNIQUE,
  zoho_contact_id             TEXT REFERENCES public.contacts(zoho_contact_id),
  customer_name               TEXT,
  contact_phone               TEXT NOT NULL DEFAULT '',
  status                      TEXT NOT NULL DEFAULT 'draft',
  date                        DATE DEFAULT CURRENT_DATE,
  due_date                    DATE,
  issued_date                 DATE,
  payment_terms               INTEGER,
  payment_terms_label         TEXT,
  currency_code               TEXT NOT NULL DEFAULT 'INR',
  exchange_rate               DECIMAL(10,6) NOT NULL DEFAULT 1.0,
  discount_type               TEXT DEFAULT 'multi_discount',
  is_discount_before_tax      BOOLEAN DEFAULT true,
  entity_discount_percent     DECIMAL(10,2) DEFAULT 0,
  is_inclusive_tax            BOOLEAN DEFAULT true,
  line_items                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal                    DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_total                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  total                       DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance                     DECIMAL(10,2) DEFAULT 0,
  adjustment                  DECIMAL(10,2) DEFAULT 0,
  adjustment_description      TEXT,
  adjustment_account          TEXT,
  notes                       TEXT,
  terms_and_conditions        TEXT,
  purchase_order              TEXT,
  place_of_supply             TEXT,
  gst_treatment               TEXT,
  gstin                       TEXT,
  invoice_type                TEXT DEFAULT 'Invoice',
  einvoice_status             TEXT,
  branch_id                   TEXT,
  branch_name                 TEXT,
  accounts_receivable         TEXT,
  tcs_amount                  DECIMAL(10,2) DEFAULT 0,
  tds_amount                  DECIMAL(10,2) DEFAULT 0,
  shipping_charge             DECIMAL(10,2) DEFAULT 0,
  estimate_number             TEXT,
  zoho_sync_status            TEXT NOT NULL DEFAULT 'synced',
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_invoices_zoho_contact_id ON public.invoices(zoho_contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date             ON public.invoices(date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status           ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number   ON public.invoices(invoice_number);

-- updated_at trigger
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: enable but keep open for service role (same as estimates)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on invoices"
  ON public.invoices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
