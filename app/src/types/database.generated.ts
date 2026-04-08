export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auth_requests: {
        Row: {
          attempts: number
          created_at: string | null
          id: number
          otp_code: string
          otp_expires_at: string
          phone: string
          ref_expires_at: string
          ref_id: string
          used: boolean
          zoho_contact_id: string | null
          zoho_contact_person_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          id?: number
          otp_code: string
          otp_expires_at: string
          phone: string
          ref_expires_at: string
          ref_id: string
          used?: boolean
          zoho_contact_id?: string | null
          zoho_contact_person_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string | null
          id?: number
          otp_code?: string
          otp_expires_at?: string
          phone?: string
          ref_expires_at?: string
          ref_id?: string
          used?: boolean
          zoho_contact_id?: string | null
          zoho_contact_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_requests_zoho_contact_id_fkey"
            columns: ["zoho_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["zoho_contact_id"]
          },
          {
            foreignKeyName: "auth_requests_zoho_contact_person_id_fkey"
            columns: ["zoho_contact_person_id"]
            isOneToOne: false
            referencedRelation: "contact_persons"
            referencedColumns: ["zoho_contact_person_id"]
          },
        ]
      }
      brands: {
        Row: {
          brand_name: string
          created_at: string | null
          display_order: number | null
          id: number
          logo_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          brand_name: string
          created_at?: string | null
          display_order?: number | null
          id?: number
          logo_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          brand_name?: string
          created_at?: string | null
          display_order?: number | null
          id?: number
          logo_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_name: string
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          parent_category_id: string | null
          status: string | null
          updated_at: string | null
          zoho_category_id: string
        }
        Insert: {
          category_name: string
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          parent_category_id?: string | null
          status?: string | null
          updated_at?: string | null
          zoho_category_id: string
        }
        Update: {
          category_name?: string
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          parent_category_id?: string | null
          status?: string | null
          updated_at?: string | null
          zoho_category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["zoho_category_id"]
          },
        ]
      }
      contact_persons: {
        Row: {
          catalog_access: boolean
          communication_preference: Json | null
          created_at: string | null
          email: string | null
          first_name: string | null
          is_primary: boolean | null
          last_name: string | null
          mobile: string | null
          online_catalogue_access: boolean
          phone: string | null
          status: string
          updated_at: string | null
          zoho_contact_id: string
          zoho_contact_person_id: string
        }
        Insert: {
          catalog_access?: boolean
          communication_preference?: Json | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          is_primary?: boolean | null
          last_name?: string | null
          mobile?: string | null
          online_catalogue_access?: boolean
          phone?: string | null
          status?: string
          updated_at?: string | null
          zoho_contact_id: string
          zoho_contact_person_id: string
        }
        Update: {
          catalog_access?: boolean
          communication_preference?: Json | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          is_primary?: boolean | null
          last_name?: string | null
          mobile?: string | null
          online_catalogue_access?: boolean
          phone?: string | null
          status?: string
          updated_at?: string | null
          zoho_contact_id?: string
          zoho_contact_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_persons_zoho_contact_id_fkey"
            columns: ["zoho_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["zoho_contact_id"]
          },
        ]
      }
      contacts: {
        Row: {
          billing_address: Json | null
          company_name: string | null
          contact_name: string
          contact_type: string | null
          created_at: string | null
          created_time: string | null
          currency_code: string | null
          currency_id: string | null
          custom_fields: Json | null
          email: string | null
          last_modified_time: string | null
          payment_terms: number | null
          payment_terms_label: string | null
          phone: string | null
          pricebook_id: string | null
          primary_contact_person_id: string | null
          shipping_address: Json | null
          status: string | null
          updated_at: string | null
          zoho_contact_id: string
          catalog_access: boolean
          online_catalogue_access: boolean
        }
        Insert: {
          billing_address?: Json | null
          company_name?: string | null
          contact_name: string
          contact_type?: string | null
          created_at?: string | null
          created_time?: string | null
          currency_code?: string | null
          currency_id?: string | null
          custom_fields?: Json | null
          email?: string | null
          last_modified_time?: string | null
          payment_terms?: number | null
          payment_terms_label?: string | null
          phone?: string | null
          pricebook_id?: string | null
          primary_contact_person_id?: string | null
          shipping_address?: Json | null
          status?: string | null
          updated_at?: string | null
          zoho_contact_id: string
          catalog_access?: boolean
          online_catalogue_access?: boolean
        }
        Update: {
          billing_address?: Json | null
          company_name?: string | null
          contact_name?: string
          contact_type?: string | null
          created_at?: string | null
          created_time?: string | null
          currency_code?: string | null
          currency_id?: string | null
          custom_fields?: Json | null
          email?: string | null
          last_modified_time?: string | null
          payment_terms?: number | null
          payment_terms_label?: string | null
          phone?: string | null
          pricebook_id?: string | null
          primary_contact_person_id?: string | null
          shipping_address?: Json | null
          status?: string | null
          updated_at?: string | null
          zoho_contact_id?: string
          catalog_access?: boolean
          online_catalogue_access?: boolean
        }
        Relationships: []
      }
      estimates: {
        Row: {
          contact_phone: string
          converted_at: string | null
          converted_to_salesorder_id: number | null
          created_at: string | null
          date: string | null
          estimate_number: string
          expiry_date: string | null
          id: number
          line_items: Json
          notes: string | null
          status: string
          subtotal: number
          tax_total: number
          total: number
          updated_at: string | null
          whatsapp_sent: boolean | null
          whatsapp_sent_at: string | null
          zoho_contact_id: string | null
          zoho_estimate_id: string | null
        }
        Insert: {
          contact_phone: string
          converted_at?: string | null
          converted_to_salesorder_id?: number | null
          created_at?: string | null
          date?: string | null
          estimate_number?: string
          expiry_date?: string | null
          id?: number
          line_items: Json
          notes?: string | null
          status?: string
          subtotal: number
          tax_total: number
          total: number
          updated_at?: string | null
          whatsapp_sent?: boolean | null
          whatsapp_sent_at?: string | null
          zoho_contact_id?: string | null
          zoho_estimate_id?: string | null
        }
        Update: {
          contact_phone?: string
          converted_at?: string | null
          converted_to_salesorder_id?: number | null
          created_at?: string | null
          date?: string | null
          estimate_number?: string
          expiry_date?: string | null
          id?: number
          line_items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string | null
          whatsapp_sent?: boolean | null
          whatsapp_sent_at?: string | null
          zoho_contact_id?: string | null
          zoho_estimate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_zoho_contact_id_fkey"
            columns: ["zoho_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["zoho_contact_id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: number
          page_views: number | null
          phone: string
          token: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: number
          page_views?: number | null
          phone: string
          token?: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: number
          page_views?: number | null
          phone?: string
          token?: string
        }
        Relationships: []
      }
      item_locations: {
        Row: {
          actual_available_stock: number | null
          available_stock: number | null
          created_at: string | null
          id: number
          is_primary: boolean | null
          location_name: string
          location_status: string | null
          stock_on_hand: number | null
          updated_at: string | null
          zoho_item_id: string
          zoho_location_id: string
        }
        Insert: {
          actual_available_stock?: number | null
          available_stock?: number | null
          created_at?: string | null
          id?: number
          is_primary?: boolean | null
          location_name: string
          location_status?: string | null
          stock_on_hand?: number | null
          updated_at?: string | null
          zoho_item_id: string
          zoho_location_id: string
        }
        Update: {
          actual_available_stock?: number | null
          available_stock?: number | null
          created_at?: string | null
          id?: number
          is_primary?: boolean | null
          location_name?: string
          location_status?: string | null
          stock_on_hand?: number | null
          updated_at?: string | null
          zoho_item_id?: string
          zoho_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_locations_zoho_item_id_fkey"
            columns: ["zoho_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["zoho_item_id"]
          },
        ]
      }
      items: {
        Row: {
          actual_available_stock: number | null
          available_stock: number | null
          base_rate: number | null
          brand: string | null
          category_id: string | null
          category_name: string | null
          created_at: string | null
          created_time: string | null
          custom_fields: Json | null
          description: string | null
          ean: string | null
          hsn_or_sac: string | null
          image_urls: Json | null
          is_taxable: boolean | null
          item_name: string
          item_type: string | null
          last_modified_time: string | null
          manufacturer: string | null
          part_number: string | null
          product_type: string | null
          purchase_rate: number | null
          reorder_level: number | null
          search_vector: unknown
          sku: string
          status: string
          tax_id: string | null
          tax_name: string | null
          tax_percentage: number | null
          track_inventory: boolean | null
          unit: string | null
          upc: string | null
          updated_at: string | null
          zoho_item_id: string
        }
        Insert: {
          actual_available_stock?: number | null
          available_stock?: number | null
          base_rate?: number | null
          brand?: string | null
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          created_time?: string | null
          custom_fields?: Json | null
          description?: string | null
          ean?: string | null
          hsn_or_sac?: string | null
          image_urls?: Json | null
          is_taxable?: boolean | null
          item_name: string
          item_type?: string | null
          last_modified_time?: string | null
          manufacturer?: string | null
          part_number?: string | null
          product_type?: string | null
          purchase_rate?: number | null
          reorder_level?: number | null
          search_vector?: unknown
          sku: string
          status?: string
          tax_id?: string | null
          tax_name?: string | null
          tax_percentage?: number | null
          track_inventory?: boolean | null
          unit?: string | null
          upc?: string | null
          updated_at?: string | null
          zoho_item_id: string
        }
        Update: {
          actual_available_stock?: number | null
          available_stock?: number | null
          base_rate?: number | null
          brand?: string | null
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          created_time?: string | null
          custom_fields?: Json | null
          description?: string | null
          ean?: string | null
          hsn_or_sac?: string | null
          image_urls?: Json | null
          is_taxable?: boolean | null
          item_name?: string
          item_type?: string | null
          last_modified_time?: string | null
          manufacturer?: string | null
          part_number?: string | null
          product_type?: string | null
          purchase_rate?: number | null
          reorder_level?: number | null
          search_vector?: unknown
          sku?: string
          status?: string
          tax_id?: string | null
          tax_name?: string | null
          tax_percentage?: number | null
          track_inventory?: boolean | null
          unit?: string | null
          upc?: string | null
          updated_at?: string | null
          zoho_item_id?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: Json | null
          created_at: string | null
          email: string | null
          is_primary: boolean | null
          location_name: string
          location_type: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          zoho_location_id: string
        }
        Insert: {
          address?: Json | null
          created_at?: string | null
          email?: string | null
          is_primary?: boolean | null
          location_name: string
          location_type?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          zoho_location_id: string
        }
        Update: {
          address?: Json | null
          created_at?: string | null
          email?: string | null
          is_primary?: boolean | null
          location_name?: string
          location_type?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          zoho_location_id?: string
        }
        Relationships: []
      }
      pricebooks: {
        Row: {
          created_at: string | null
          custom_rate: number
          id: number
          pricebook_name: string
          updated_at: string | null
          zoho_item_id: string
          zoho_pricebook_id: string
        }
        Insert: {
          created_at?: string | null
          custom_rate: number
          id?: number
          pricebook_name: string
          updated_at?: string | null
          zoho_item_id: string
          zoho_pricebook_id: string
        }
        Update: {
          created_at?: string | null
          custom_rate?: number
          id?: number
          pricebook_name?: string
          updated_at?: string | null
          zoho_item_id?: string
          zoho_pricebook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricebooks_zoho_item_id_fkey"
            columns: ["zoho_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["zoho_item_id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          contact_phone: string
          converted_from_estimate_id: number | null
          created_at: string | null
          customer_notes: string | null
          date: string | null
          id: number
          line_items: Json
          notes: string | null
          salesorder_number: string
          shipment_date: string | null
          status: string
          subtotal: number
          tax_total: number
          total: number
          updated_at: string | null
          zoho_contact_id: string | null
          zoho_salesorder_id: string | null
        }
        Insert: {
          contact_phone: string
          converted_from_estimate_id?: number | null
          created_at?: string | null
          customer_notes?: string | null
          date?: string | null
          id?: number
          line_items: Json
          notes?: string | null
          salesorder_number?: string
          shipment_date?: string | null
          status?: string
          subtotal: number
          tax_total: number
          total: number
          updated_at?: string | null
          zoho_contact_id?: string | null
          zoho_salesorder_id?: string | null
        }
        Update: {
          contact_phone?: string
          converted_from_estimate_id?: number | null
          created_at?: string | null
          customer_notes?: string | null
          date?: string | null
          id?: number
          line_items?: Json
          notes?: string | null
          salesorder_number?: string
          shipment_date?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string | null
          zoho_contact_id?: string | null
          zoho_salesorder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_converted_from_estimate_id_fkey"
            columns: ["converted_from_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_zoho_contact_id_fkey"
            columns: ["zoho_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["zoho_contact_id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: number
          ip_address: unknown
          last_activity_at: string | null
          phone: string
          token: string
          user_agent: string | null
          zoho_contact_id: string | null
          zoho_contact_person_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: number
          ip_address?: unknown
          last_activity_at?: string | null
          phone: string
          token?: string
          user_agent?: string | null
          zoho_contact_id?: string | null
          zoho_contact_person_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: number
          ip_address?: unknown
          last_activity_at?: string | null
          phone?: string
          token?: string
          user_agent?: string | null
          zoho_contact_id?: string | null
          zoho_contact_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_zoho_contact_id_fkey"
            columns: ["zoho_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["zoho_contact_id"]
          },
          {
            foreignKeyName: "sessions_zoho_contact_person_id_fkey"
            columns: ["zoho_contact_person_id"]
            isOneToOne: false
            referencedRelation: "contact_persons"
            referencedColumns: ["zoho_contact_person_id"]
          },
        ]
      }
      zoho_tokens: {
        Row: {
          access_token: string
          expires_at: string
          id: number
          updated_at: string | null
        }
        Insert: {
          access_token: string
          expires_at: string
          id?: number
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          expires_at?: string
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_sessions: { Args: never; Returns: number }
      convert_estimate_to_salesorder: {
        Args: { p_estimate_id: number }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

