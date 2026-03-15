// Minimal TypeScript interfaces for Zoho Books API responses

export interface ZohoItem {
  item_id: string;
  name: string;
  sku: string;
  brand: string;
  category_name: string;
  rate: number;
  available_stock: number;
  status: string;
  image_documents: Array<{
    image_id: string;
    image_name: string;
    image_url: string;
  }>;
}

export interface ZohoContact {
  contact_id: string;
  contact_name: string;
  phone: string;
  billing_address: {
    phone: string;
  };
  pricebook_id: string;
  status: string;
}

export interface ZohoPricebook {
  pricebook_id: string;
  pricebook_name: string;
  items: Array<{
    item_id: string;
    rate: number;
  }>;
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
