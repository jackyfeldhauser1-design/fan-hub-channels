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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bot_settings: {
        Row: {
          affiliate_percent: number
          free_group_url: string
          id: boolean
          tip_message: string
          ton_wallet: string
          updated_at: string
          upsell_message: string
          vip_group_url: string
          welcome_message: string
        }
        Insert: {
          affiliate_percent?: number
          free_group_url?: string
          id?: boolean
          tip_message?: string
          ton_wallet?: string
          updated_at?: string
          upsell_message?: string
          vip_group_url?: string
          welcome_message?: string
        }
        Update: {
          affiliate_percent?: number
          free_group_url?: string
          id?: boolean
          tip_message?: string
          ton_wallet?: string
          updated_at?: string
          upsell_message?: string
          vip_group_url?: string
          welcome_message?: string
        }
        Relationships: []
      }
      bundle_items: {
        Row: {
          bundle_id: string
          product_id: string
        }
        Insert: {
          bundle_id: string
          product_id: string
        }
        Update: {
          bundle_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_stars: number
          created_at: string
          id: string
          note: string
          status: Database["public"]["Enums"]["pay_status"]
          tg_user_id: string
        }
        Insert: {
          amount_stars?: number
          created_at?: string
          id?: string
          note?: string
          status?: Database["public"]["Enums"]["pay_status"]
          tg_user_id: string
        }
        Update: {
          amount_stars?: number
          created_at?: string
          id?: string
          note?: string
          status?: Database["public"]["Enums"]["pay_status"]
          tg_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          delivery_payload: string
          delivery_type: Database["public"]["Enums"]["delivery_kind"]
          description: string
          id: string
          kind: Database["public"]["Enums"]["product_kind"]
          price_stars: number
          price_ton: number
          sort_order: number
          title: string
          updated_at: string
          upsell_product_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_payload?: string
          delivery_type?: Database["public"]["Enums"]["delivery_kind"]
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["product_kind"]
          price_stars?: number
          price_ton?: number
          sort_order?: number
          title: string
          updated_at?: string
          upsell_product_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_payload?: string
          delivery_type?: Database["public"]["Enums"]["delivery_kind"]
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["product_kind"]
          price_stars?: number
          price_ton?: number
          sort_order?: number
          title?: string
          updated_at?: string
          upsell_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_upsell_product_id_fkey"
            columns: ["upsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_stars: number
          amount_ton: number
          commission_stars: number
          created_at: string
          currency: Database["public"]["Enums"]["pay_currency"]
          id: string
          product_id: string | null
          referrer_id: string | null
          status: Database["public"]["Enums"]["pay_status"]
          telegram_charge_id: string | null
          tg_user_id: string
          title_snapshot: string
          ton_memo: string | null
          updated_at: string
        }
        Insert: {
          amount_stars?: number
          amount_ton?: number
          commission_stars?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["pay_currency"]
          id?: string
          product_id?: string | null
          referrer_id?: string | null
          status?: Database["public"]["Enums"]["pay_status"]
          telegram_charge_id?: string | null
          tg_user_id: string
          title_snapshot?: string
          ton_memo?: string | null
          updated_at?: string
        }
        Update: {
          amount_stars?: number
          amount_ton?: number
          commission_stars?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["pay_currency"]
          id?: string
          product_id?: string | null
          referrer_id?: string | null
          status?: Database["public"]["Enums"]["pay_status"]
          telegram_charge_id?: string | null
          tg_user_id?: string
          title_snapshot?: string
          ton_memo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_updates: {
        Row: {
          chat_id: number | null
          created_at: string
          raw: Json
          telegram_user_id: number | null
          text: string | null
          update_id: number
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          raw: Json
          telegram_user_id?: number | null
          text?: string | null
          update_id: number
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          raw?: Json
          telegram_user_id?: number | null
          text?: string | null
          update_id?: number
        }
        Relationships: []
      }
      tg_users: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          joined_free: boolean
          last_seen_at: string
          referral_code: string
          referred_by: string | null
          telegram_id: number
          username: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          joined_free?: boolean
          last_seen_at?: string
          referral_code: string
          referred_by?: string | null
          telegram_id: number
          username?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          joined_free?: boolean
          last_seen_at?: string
          referral_code?: string
          referred_by?: string | null
          telegram_id?: number
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tg_users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      delivery_kind: "text" | "file" | "link"
      pay_currency: "stars" | "ton"
      pay_status: "pending" | "paid" | "failed" | "refunded"
      product_kind: "single" | "bundle" | "ppv" | "tip"
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
      app_role: ["admin", "user"],
      delivery_kind: ["text", "file", "link"],
      pay_currency: ["stars", "ton"],
      pay_status: ["pending", "paid", "failed", "refunded"],
      product_kind: ["single", "bundle", "ppv", "tip"],
    },
  },
} as const
