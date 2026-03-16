// Deno-compatible Zoho Books API response types for Edge Functions
// Mirrors the shapes returned by /items and /contacts endpoints (India region)

export interface ZohoItem {
  item_id: string
  name: string
  sku: string
  status: string
  item_type: string
  product_type: string
  rate: number | ''
  purchase_rate: number | ''
  description?: string
  category_id?: string
  category_name?: string
  brand?: string
  manufacturer_name?: string
  hsn_or_sac?: string
  unit?: string
  is_taxable?: boolean
  tax_id?: string
  tax_name?: string
  tax_percentage?: number | ''
  track_inventory?: boolean
  available_stock?: number | ''
  actual_available_stock?: number | ''
  reorder_level?: number | ''
  upc?: string
  ean?: string
  part_number?: string
  image_documents?: Array<{ image_url: string }>
  custom_fields?: Record<string, unknown>
  created_time?: string
  last_modified_time?: string
}

export interface ZohoContactPerson {
  contact_person_id: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  mobile?: string
  is_primary_contact?: boolean
  communication_preference?: string
}

export interface ZohoContact {
  contact_id: string
  contact_name: string
  company_name?: string
  contact_type?: string
  status?: string
  primary_contact_person_id?: string
  pricebook_id?: string
  mobile?: string
  phone?: string
  email?: string
  billing_address?: Record<string, unknown>
  shipping_address?: Record<string, unknown>
  payment_terms?: number
  payment_terms_label?: string
  currency_id?: string
  currency_code?: string
  custom_fields?: Record<string, unknown>
  contact_persons?: ZohoContactPerson[]
  created_time?: string
  last_modified_time?: string
}

export interface ZohoPricebook {
  pricebook_id: string
  name: string
  currency_code?: string
  description?: string
  is_active?: boolean
}

export interface ZohoPricebookItem {
  item_id: string
  name?: string
  custom_rate: number
  pricebook_rate: number
  discount?: number
}
