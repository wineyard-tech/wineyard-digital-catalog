-- ── source field for invoices and estimates ────────────────────────────────────
-- Tracks whether a record originated from Zoho Books or was created by the
-- catalog app (e.g. an estimate submitted via the B2B cart). This allows
-- reporting to distinguish app-driven activity from Zoho-native creation.
--
-- Values: 'zoho' (synced from Zoho Books) | 'catalog-app' (created in the app)
--
-- Default 'zoho' is correct for all existing rows — every row so far was
-- either synced from Zoho or created by the app and then pushed to Zoho
-- (those rows will be corrected by the app on next write).
--
-- The preserve_source trigger ensures that batch sync functions (sync-invoices,
-- sync-estimates, initial_sync) can never overwrite a 'catalog-app' source when
-- they UPDATE an existing row. Source is set once on INSERT and then frozen.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'zoho';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'zoho';

-- ── Trigger: preserve source on UPDATE ────────────────────────────────────────
-- Fires BEFORE UPDATE on both tables. Always restores OLD.source so that sync
-- functions (which upsert with source='zoho') cannot downgrade a 'catalog-app'
-- row. Any deliberate source change must go through a targeted UPDATE that sets
-- the column directly — the application layer handles this.

CREATE OR REPLACE FUNCTION public.preserve_source()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Restore the pre-update source value regardless of what the UPDATE sent.
  -- This is intentionally unconditional: source is immutable after first INSERT.
  NEW.source = OLD.source;
  RETURN NEW;
END;
$$;

CREATE TRIGGER estimates_preserve_source
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_source();

CREATE TRIGGER invoices_preserve_source
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_source();

-- Index: fast filtering by source for app-usage reporting queries
CREATE INDEX IF NOT EXISTS idx_estimates_source ON public.estimates(source);
CREATE INDEX IF NOT EXISTS idx_invoices_source  ON public.invoices(source);
