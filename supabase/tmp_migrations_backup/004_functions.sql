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
