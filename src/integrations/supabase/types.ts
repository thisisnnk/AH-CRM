export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      quotation_requests: {
        Row: {
          id: string
          lead_id: string
          version: number
          trip_details: Json
          client_preferences: string | null
          required_services: string[] | null
          status: string
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          version?: number
          trip_details?: Json
          client_preferences?: string | null
          required_services?: string[] | null
          status?: string
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          version?: number
          trip_details?: Json
          client_preferences?: string | null
          required_services?: string[] | null
          status?: string
          created_by?: string
          created_at?: string | null
        }
        Relationships: []
      }
      quotations: {
        Row: {
          id: string
          request_id: string
          version: number
          pricing_data: Json
          total_cost: number | null
          notes: string | null
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          request_id: string
          version?: number
          pricing_data?: Json
          total_cost?: number | null
          notes?: string | null
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          request_id?: string
          version?: number
          pricing_data?: Json
          total_cost?: number | null
          notes?: string | null
          created_by?: string
          created_at?: string | null
        }
        Relationships: []
      }
      itineraries: {
        Row: {
          id: string
          lead_id: string
          version: number
          file_url: string | null
          file_type: string | null
          external_link: string | null
          notes: string | null
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          version?: number
          file_url?: string | null
          file_type?: string | null
          external_link?: string | null
          notes?: string | null
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          version?: number
          file_url?: string | null
          file_type?: string | null
          external_link?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string | null
        }
        Relationships: []
      }
      client_transactions: {
        Row: {
          id: string
          lead_id: string
          title: string
          amount: number
          payment_mode: string
          proof_url: string | null
          bill_url: string | null
          notes: string | null
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          title: string
          amount: number
          payment_mode: string
          proof_url?: string | null
          bill_url?: string | null
          notes?: string | null
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          title?: string
          amount?: number
          payment_mode?: string
          proof_url?: string | null
          bill_url?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string | null
        }
        Relationships: []
      }
      cost_categories: {
        Row: {
          id: string
          lead_id: string
          category_name: string
          planned_cost: number
          created_at: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          category_name: string
          planned_cost?: number
          created_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          category_name?: string
          planned_cost?: number
          created_at?: string | null
        }
        Relationships: []
      }
      vendor_transactions: {
        Row: {
          id: string
          category_id: string
          lead_id: string
          title: string
          amount: number
          payment_mode: string
          proof_url: string | null
          bill_url: string | null
          notes: string | null
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          category_id: string
          lead_id: string
          title: string
          amount: number
          payment_mode: string
          proof_url?: string | null
          bill_url?: string | null
          notes?: string | null
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          category_id?: string
          lead_id?: string
          title?: string
          amount?: number
          payment_mode?: string
          proof_url?: string | null
          bill_url?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          details: string | null
          id: string
          lead_id: string
          proof_url: string | null
          timestamp: string | null
          user_id: string
          user_role: string | null
          entity_type: string | null
          entity_id: string | null
        }
        Insert: {
          action: string
          details?: string | null
          id?: string
          lead_id: string
          proof_url?: string | null
          timestamp?: string | null
          user_id: string
          user_role?: string | null
          entity_type?: string | null
          entity_id?: string | null
        }
        Update: {
          action?: string
          details?: string | null
          id?: string
          lead_id?: string
          proof_url?: string | null
          timestamp?: string | null
          user_id?: string
          user_role?: string | null
          entity_type?: string | null
          entity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          city: string | null
          contact_id: string
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string
          state: string | null
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          contact_id: string
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone: string
          state?: string | null
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          contact_id?: string
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string
          state?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      incoming_leads: {
        Row: {
          created_at: string | null
          id: string
          name: string
          phone: string
          raw_data: string | null
          source: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          phone: string
          raw_data?: string | null
          source: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          phone?: string
          raw_data?: string | null
          source?: string
          status?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_employee_id: string | null
          badge_stage: string | null
          budget: string | null
          city: string | null
          client_id: string | null
          contact_id: string | null
          country: string | null
          created_at: string | null
          destination: string | null
          email: string | null
          enquiry_date: string | null
          id: string
          itinerary_code: string | null
          last_activity_at: string | null
          lead_source: string | null
          name: string
          phone: string
          state: string | null
          status: string | null
          total_expected: number | null
          tour_category: string | null
          travel_date: string | null
          travelers: number | null
          trip_duration: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          assigned_employee_id?: string | null
          badge_stage?: string | null
          budget?: string | null
          city?: string | null
          client_id?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string | null
          destination?: string | null
          email?: string | null
          enquiry_date?: string | null
          id?: string
          itinerary_code?: string | null
          last_activity_at?: string | null
          lead_source?: string | null
          name: string
          phone: string
          state?: string | null
          status?: string | null
          total_expected?: number | null
          tour_category?: string | null
          travel_date?: string | null
          travelers?: number | null
          trip_duration?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          assigned_employee_id?: string | null
          badge_stage?: string | null
          budget?: string | null
          city?: string | null
          client_id?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string | null
          destination?: string | null
          email?: string | null
          enquiry_date?: string | null
          id?: string
          itinerary_code?: string | null
          last_activity_at?: string | null
          lead_source?: string | null
          name?: string
          phone?: string
          state?: string | null
          status?: string | null
          total_expected?: number | null
          tour_category?: string | null
          travel_date?: string | null
          travelers?: number | null
          trip_duration?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          is_task: boolean | null
          lead_id: string | null
          message: string
          recipient_id: string
          sent_via: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_task?: boolean | null
          lead_id?: string | null
          message: string
          recipient_id: string
          sent_via?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          is_task?: boolean | null
          lead_id?: string | null
          message?: string
          recipient_id?: string
          sent_via?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      proof_of_activities: {
        Row: {
          created_at: string | null
          file_type: string
          file_url: string
          id: string
          lead_id: string
          submitted_by: string
        }
        Insert: {
          created_at?: string | null
          file_type: string
          file_url: string
          id?: string
          lead_id: string
          submitted_by: string
        }
        Update: {
          created_at?: string | null
          file_type?: string
          file_url?: string
          id?: string
          lead_id?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      revisions: {
        Row: {
          call_recording_url: string
          created_at: string | null
          created_by: string
          date_sent: string | null
          id: string
          itinerary_link: string
          lead_id: string
          notes: string
          revision_number: number
          send_status: string | null
        }
        Insert: {
          call_recording_url: string
          created_at?: string | null
          created_by: string
          date_sent?: string | null
          id?: string
          itinerary_link: string
          lead_id: string
          notes: string
          revision_number: number
          send_status?: string | null
        }
        Update: {
          call_recording_url?: string
          created_at?: string | null
          created_by?: string
          date_sent?: string | null
          id?: string
          itinerary_link?: string
          lead_id?: string
          notes?: string
          revision_number?: number
          send_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_employee_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string
          follow_up_date: string
          id: string
          lead_id: string
          notes: string | null
          proof_submitted: boolean | null
          proof_url: string | null
          status: string | null
        }
        Insert: {
          assigned_employee_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description: string
          follow_up_date: string
          id?: string
          lead_id: string
          notes?: string | null
          proof_submitted?: boolean | null
          proof_url?: string | null
          status?: string | null
        }
        Update: {
          assigned_employee_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string
          follow_up_date?: string
          id?: string
          lead_id?: string
          notes?: string | null
          proof_submitted?: boolean | null
          proof_url?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_client_id: { Args: Record<string, never>; Returns: string }
      generate_contact_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      delete_quotation_request: {
        Args: { p_request_id: string }
        Returns: void
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "execution" | "accounts" | "itinerary"
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
  public: {
    Enums: {
      app_role: ["admin", "employee", "execution", "accounts", "itinerary"],
    },
  },
} as const
