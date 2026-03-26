// TypeScript interfaces for Zoho Books API responses

export interface ZohoItem {
  item_id: string;
  name: string;
  sku: string;
  brand: string;
  manufacturer_name?: string;
  category_id?: string;
  category_name: string;
  description?: string;
  hsn_or_sac?: string;
  unit?: string;
  item_type?: string;
  product_type?: string;
  rate: number;                 // default selling price — used as base_rate
  purchase_rate?: number;
  is_taxable?: boolean;
  tax_id?: string;
  tax_name?: string;
  tax_percentage?: number;
  track_inventory?: boolean;
  available_stock: number;      // -1 means tracking disabled; catalog ignores this in Phase 1
  actual_available_stock?: number;
  reorder_level?: number;
  upc?: string;
  ean?: string;
  part_number?: string;
  status: string;
  custom_fields?: Record<string, unknown>;
  created_time?: string;
  last_modified_time?: string;
  image_documents: Array<{
    image_id: string;
    image_name: string;
    image_url: string;
  }>;
}

export interface ZohoContactPerson {
  contact_person_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  is_primary_contact?: boolean;
  communication_preference?: Record<string, unknown>;
}

export interface ZohoContact {
  contact_id: string;
  contact_name: string;
  company_name?: string;
  contact_type?: string;
  status: string;
  phone?: string;
  mobile?: string;
  email?: string;
  pricebook_id?: string;
  primary_contact_person_id?: string;
  payment_terms?: number;
  payment_terms_label?: string;
  currency_id?: string;
  currency_code?: string;
  billing_address?: {
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  shipping_address?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  contact_persons?: ZohoContactPerson[];
  created_time?: string;
  last_modified_time?: string;
}

/** Lightweight row returned by GET /pricebooks (list endpoint — no items). */
export interface ZohoPricebookListItem {
  pricebook_id: string;
  pricebook_name: string;
  currency_id?: string;
  status?: string;
}

/** Full pricebook returned by GET /pricebooks/{id} (includes item prices). */
export interface ZohoPricebook {
  pricebook_id: string;
  pricebook_name: string;
  currency_id?: string;
  status?: string;
  items: Array<{
    item_id: string;
    name?: string;
    rate: number;           // custom_rate for this pricebook
    pricebook_rate?: number; // alias Zoho sometimes returns
  }>;
}

/** Wrapper returned by GET /pricebooks/{id} */
export interface ZohoPricebookDetailResponse {
  code: number;
  message: string;
  pricebook: ZohoPricebook;
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface ZohoEstimateCreate {
  customer_id: string;
  line_items: Array<{
    item_id: string;
    quantity: number;
    rate: number;
  }>;
  notes?: string;
}

export interface ZohoEstimateResponse {
  code: number;
  message: string;
  estimate: {
    estimate_id: string;
    estimate_number: string;
    status: string;
    total: number;
  };
}

export interface ZohoSalesOrderCreate {
  customer_id: string;
  line_items: Array<{
    item_id: string;
    name: string;
    quantity: number;
    rate: number;
  }>;
  reference_number?: string;  // used to link back to an estimate number
  notes?: string;
}

export interface ZohoSalesOrderResponse {
  code: number;
  message: string;
  salesorder: {
    salesorder_id: string;
    salesorder_number: string;
    status: string;
    total: number;
  };
}
