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

export interface EnquiryResponse {
  success: boolean;
  estimate_number: string;
  whatsapp_sent: boolean;
  error?: string;
}
