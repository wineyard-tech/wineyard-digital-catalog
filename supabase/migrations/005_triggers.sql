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
