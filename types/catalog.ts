// /types/catalog.ts — lock this before coding begins

export interface CatalogItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  brand: string | null;
  category_name: string | null;
  base_rate: number;
  final_price: number;
  price_type: 'custom' | 'base';
  available_stock: number;
  stock_status: 'available' | 'limited' | 'out_of_stock';
  image_url: string | null;
  tax_percentage: 18;           // Hardcoded Phase 1
}

export interface CartItem {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  rate: number;
  tax_percentage: 18;
  line_total: number;
  image_url?: string | null;
}

export interface SessionPayload {
  zoho_contact_id: string;
  contact_name: string;
  phone: string;
  pricebook_id: string | null;
}

export interface GuestPayload {
  token: string;
  expires_at: string;
}

export interface EnquiryRequest {
  items: CartItem[];
  notes?: string;
}

export interface OrderRequest {
  items: CartItem[];
  estimate_id?: string;   // public_id of originating estimate (if converting from quote)
  notes?: string;
}

export interface OrderResponse {
  success: boolean;
  salesorder_number: string;
  order_id: string;        // public_id UUID — used for navigation
  whatsapp_sent: boolean;
  sync_pending?: boolean;  // true when Zoho sync failed but order was still saved
  duplicate?: boolean;     // true when same cart already ordered within 1 hour
  error?: string;
}

export interface OrderListItem {
  id: string;              // public_id UUID
  salesorder_number: string;
  zoho_sync_status: string;
  status: string;
  total: number;
  item_count: number;
  created_at: string;
  estimate_number?: string | null;
}

export interface EnquiryResponse {
  success: boolean;
  estimate_number: string;
  estimate_id: string;       // public_id UUID — used for deep links
  whatsapp_sent: boolean;
  sync_pending?: boolean;    // true when Zoho sync failed but WhatsApp was still sent
  error?: string;
}
