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
  estimate_id?: string;
  notes?: string;
}

export interface OrderResponse {
  success: boolean;
  salesorder_number: string;
  order_id: string;
  whatsapp_sent: boolean;
  sync_pending?: boolean;
  duplicate?: boolean;
  error?: string;
}

export interface OrderListItem {
  id: string;
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

// ── Orders / Enquiries tabs ───────────────────────────────────────────────────

export type TransactionKind = 'invoice' | 'order'

export interface TransactionListItem {
  kind: TransactionKind;
  id: string;
  doc_number: string;
  date: string;
  total: number;
  item_count: number;
  status_label: 'Invoiced' | 'Ordered';
}

export interface TransactionListResponse {
  items: TransactionListItem[];
  has_more: boolean;
  next_offset: number;
}

export interface LineItemDetail {
  zoho_item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  rate: number;
  tax_percentage: number;
  line_total: number;
  image_url: string | null;
}

export interface TransactionDetail {
  kind: TransactionKind;
  id: string;
  doc_number: string;
  date: string;
  total: number;
  subtotal: number;
  tax_total: number;
  line_items: LineItemDetail[];
}

export type EnquiryStatus = 'Pending' | 'Converted' | 'Expired'

export interface EnquiryListItem {
  id: string;
  doc_number: string;
  date: string;
  total: number;
  item_count: number;
  status: EnquiryStatus;
}

export interface EnquiryListResponse {
  items: EnquiryListItem[];
  has_more: boolean;
  next_offset: number;
}

export interface EnquiryLineItemDetail extends LineItemDetail {
  available_stock: number | null;
  stock_status: 'available' | 'limited' | 'out_of_stock' | 'unknown';
}

export interface EnquiryDetail {
  id: string;
  doc_number: string;
  date: string;
  total: number;
  subtotal: number;
  tax_total: number;
  status: EnquiryStatus;
  estimate_id: string;
  line_items: EnquiryLineItemDetail[];
}
