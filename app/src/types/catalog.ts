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
  /** Ordered [400w, 800w, 1200w] public URLs from `items.image_urls`. */
  image_urls: string[] | null;
  /** Ordered [400w, 800w, 1200w] from `categories.icon_urls` (legacy: derived from `icon_url`). */
  category_icon_urls: string[] | null;
  /** Largest product image URL (800w slot); legacy consumers. */
  image_url: string | null;
  /** Largest category icon URL; legacy consumers. */
  category_icon_url?: string | null;
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
  image_urls?: string[] | null;
  category_icon_urls?: string[] | null;
  image_url?: string | null;
  /** categories.icon_url — used when product has no image_urls */
  category_icon_url?: string | null;
}

export interface SessionPayload {
  zoho_contact_id: string;
  /** Integrator (parent contact) display name — Zoho-aligned. */
  contact_name: string;
  company_name: string | null;
  /** When logged in as a contact person; use for customer-facing UI / WhatsApp copy. */
  contact_person_name: string | null;
  zoho_contact_person_id: string | null;
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
  estimate_id?: string; // when set, update this estimate instead of creating a new one
  user_lat?: number | null;
  user_lng?: number | null;
  /** Zoho warehouse id from location selector (`wl` cookie); server validates against DB. */
  nearest_location_id?: string | null;
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
  estimate_url?: string | null;  // Zoho public estimate URL — available immediately if Zoho returned it
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
  image_urls?: string[] | null;
  category_icon_urls?: string[] | null;
  image_url: string | null;
  /** categories.icon_url when product image is missing */
  category_icon_url?: string | null;
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

// Raw Zoho Books estimate statuses — no app-level translation applied
export type EnquiryStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced' | 'expired' | (string & {})

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
  status: string;
  estimate_id: string;
  estimate_url?: string | null;
  line_items: EnquiryLineItemDetail[];
}
