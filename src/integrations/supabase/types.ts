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
      access_token_recipients: {
        Row: {
          created_at: string
          recipient_id: string
          token_id: string
        }
        Insert: {
          created_at?: string
          recipient_id: string
          token_id: string
        }
        Update: {
          created_at?: string
          recipient_id?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_token_recipients_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_token_recipients_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          folder_id: string | null
          id: string
          last_ip_hash: string
          max_views: number
          product_id: string | null
          purchase_id: string | null
          reactivated_at: string | null
          reactivations: number
          revoked: boolean
          tg_user_id: string | null
          token: string
          views: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          folder_id?: string | null
          id?: string
          last_ip_hash?: string
          max_views?: number
          product_id?: string | null
          purchase_id?: string | null
          reactivated_at?: string | null
          reactivations?: number
          revoked?: boolean
          tg_user_id?: string | null
          token: string
          views?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          folder_id?: string | null
          id?: string
          last_ip_hash?: string
          max_views?: number
          product_id?: string | null
          purchase_id?: string | null
          reactivated_at?: string | null
          reactivations?: number
          revoked?: boolean
          tg_user_id?: string | null
          token?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      action_log: {
        Row: {
          action: string
          created_at: string
          id: string
          meta: string
          tg_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta?: string
          tg_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta?: string
          tg_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_log_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          chat_id: string | null
          created_at: string
          detail: string | null
          id: string
          meta: Json
          status: string
          target: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          chat_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          meta?: Json
          status?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          chat_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          meta?: Json
          status?: string
          target?: string | null
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          affiliate_percent: number
          app_base_url: string
          community_chat_id: string
          control_chat_id: string
          early_access_price_stars: number
          free_group_url: string
          id: boolean
          link_max_views: number
          link_ttl_hours: number
          max_purchases_per_hour: number
          notify_blocked: boolean
          notify_expired: boolean
          notify_unpaid: boolean
          shop_chat_id: string
          sponsor_price_stars: number
          tip_message: string
          ton_wallet: string
          updated_at: string
          upsell_message: string
          vip_group_url: string
          welcome_message: string
        }
        Insert: {
          affiliate_percent?: number
          app_base_url?: string
          community_chat_id?: string
          control_chat_id?: string
          early_access_price_stars?: number
          free_group_url?: string
          id?: boolean
          link_max_views?: number
          link_ttl_hours?: number
          max_purchases_per_hour?: number
          notify_blocked?: boolean
          notify_expired?: boolean
          notify_unpaid?: boolean
          shop_chat_id?: string
          sponsor_price_stars?: number
          tip_message?: string
          ton_wallet?: string
          updated_at?: string
          upsell_message?: string
          vip_group_url?: string
          welcome_message?: string
        }
        Update: {
          affiliate_percent?: number
          app_base_url?: string
          community_chat_id?: string
          control_chat_id?: string
          early_access_price_stars?: number
          free_group_url?: string
          id?: boolean
          link_max_views?: number
          link_ttl_hours?: number
          max_purchases_per_hour?: number
          notify_blocked?: boolean
          notify_expired?: boolean
          notify_unpaid?: boolean
          shop_chat_id?: string
          sponsor_price_stars?: number
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
      job_runs: {
        Row: {
          created_at: string
          detail: string
          failed: number
          id: string
          job: string
          ok: boolean
          processed: number
          sent: number
        }
        Insert: {
          created_at?: string
          detail?: string
          failed?: number
          id?: string
          job: string
          ok?: boolean
          processed?: number
          sent?: number
        }
        Update: {
          created_at?: string
          detail?: string
          failed?: number
          id?: string
          job?: string
          ok?: boolean
          processed?: number
          sent?: number
        }
        Relationships: []
      }
      leads: {
        Row: {
          amount_stars: number
          claim_token: string
          created_at: string
          early_access: boolean
          early_access_status: Database["public"]["Enums"]["pay_status"]
          email: string
          id: string
          interest: string
          ip_hash: string
          name: string
          source: string
          telegram_handle: string
          updated_at: string
        }
        Insert: {
          amount_stars?: number
          claim_token: string
          created_at?: string
          early_access?: boolean
          early_access_status?: Database["public"]["Enums"]["pay_status"]
          email?: string
          id?: string
          interest?: string
          ip_hash?: string
          name?: string
          source?: string
          telegram_handle?: string
          updated_at?: string
        }
        Update: {
          amount_stars?: number
          claim_token?: string
          created_at?: string
          early_access?: boolean
          early_access_status?: Database["public"]["Enums"]["pay_status"]
          email?: string
          id?: string
          interest?: string
          ip_hash?: string
          name?: string
          source?: string
          telegram_handle?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_downloads: {
        Row: {
          allowed: boolean
          created_at: string
          file_id: string | null
          folder_id: string | null
          id: string
          ip_hash: string
          reason: string
          tg_user_id: string | null
          token_id: string | null
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          file_id?: string | null
          folder_id?: string | null
          id?: string
          ip_hash?: string
          reason?: string
          tg_user_id?: string | null
          token_id?: string | null
        }
        Update: {
          allowed?: boolean
          created_at?: string
          file_id?: string | null
          folder_id?: string | null
          id?: string
          ip_hash?: string
          reason?: string
          tg_user_id?: string | null
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_downloads_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_downloads_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_downloads_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_downloads_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      media_files: {
        Row: {
          created_at: string
          display_name: string
          folder_id: string
          id: string
          mime_type: string
          preview_allowed: boolean
          size_bytes: number
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          folder_id: string
          id?: string
          mime_type?: string
          preview_allowed?: boolean
          size_bytes?: number
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          folder_id?: string
          id?: string
          mime_type?: string
          preview_allowed?: boolean
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          active: boolean
          cover_url: string
          created_at: string
          description: string
          id: string
          preview_file_id: string | null
          price_stars: number
          price_ton: number
          product_id: string | null
          sale_price_stars: number
          sale_until: string | null
          sort_order: number
          stock_limit: number
          stock_sold: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cover_url?: string
          created_at?: string
          description?: string
          id?: string
          preview_file_id?: string | null
          price_stars?: number
          price_ton?: number
          product_id?: string | null
          sale_price_stars?: number
          sale_until?: string | null
          sort_order?: number
          stock_limit?: number
          stock_sold?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cover_url?: string
          created_at?: string
          description?: string
          id?: string
          preview_file_id?: string | null
          price_stars?: number
          price_ton?: number
          product_id?: string | null
          sale_price_stars?: number
          sale_until?: string | null
          sort_order?: number
          stock_limit?: number
          stock_sold?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_preview_file_id_fkey"
            columns: ["preview_file_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_folders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          audience: string
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notify_kind"]
          last_error: string
          last_run_at: string | null
          link_url: string
          name: string
          scheduled_at: string | null
          segment: string
          sent_count: number
          status: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notify_kind"]
          last_error?: string
          last_run_at?: string | null
          link_url?: string
          name: string
          scheduled_at?: string | null
          segment?: string
          sent_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notify_kind"]
          last_error?: string
          last_run_at?: string | null
          link_url?: string
          name?: string
          scheduled_at?: string | null
          segment?: string
          sent_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempt: number
          body: string
          campaign_id: string | null
          channel: Database["public"]["Enums"]["notify_channel"]
          click_count: number
          clicked_at: string | null
          created_at: string
          error: string
          id: string
          kind: Database["public"]["Enums"]["notify_kind"]
          next_retry_at: string | null
          open_count: number
          opened_at: string | null
          provider_message_id: string
          provider_response: string
          recipient_id: string | null
          recipient_label: string
          status: Database["public"]["Enums"]["notify_status"]
          target: string
          tg_user_id: string | null
          token_id: string | null
          updated_at: string
          used_fallback: boolean
        }
        Insert: {
          attempt?: number
          body?: string
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["notify_channel"]
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          error?: string
          id?: string
          kind: Database["public"]["Enums"]["notify_kind"]
          next_retry_at?: string | null
          open_count?: number
          opened_at?: string | null
          provider_message_id?: string
          provider_response?: string
          recipient_id?: string | null
          recipient_label?: string
          status?: Database["public"]["Enums"]["notify_status"]
          target?: string
          tg_user_id?: string | null
          token_id?: string | null
          updated_at?: string
          used_fallback?: boolean
        }
        Update: {
          attempt?: number
          body?: string
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["notify_channel"]
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          error?: string
          id?: string
          kind?: Database["public"]["Enums"]["notify_kind"]
          next_retry_at?: string | null
          open_count?: number
          opened_at?: string | null
          provider_message_id?: string
          provider_response?: string
          recipient_id?: string | null
          recipient_label?: string
          status?: Database["public"]["Enums"]["notify_status"]
          target?: string
          tg_user_id?: string | null
          token_id?: string | null
          updated_at?: string
          used_fallback?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          amount_stars: number
          campaign_id: string | null
          created_at: string
          delivery_id: string | null
          detail: string
          event: string
          id: string
          ip_hash: string
          purchase_id: string | null
        }
        Insert: {
          amount_stars?: number
          campaign_id?: string | null
          created_at?: string
          delivery_id?: string | null
          detail?: string
          event: string
          id?: string
          ip_hash?: string
          purchase_id?: string | null
        }
        Update: {
          amount_stars?: number
          campaign_id?: string | null
          created_at?: string
          delivery_id?: string | null
          detail?: string
          event?: string
          id?: string
          ip_hash?: string
          purchase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["notify_kind"]
          recipient_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["notify_kind"]
          recipient_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["notify_kind"]
          recipient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          active: boolean
          channel: Database["public"]["Enums"]["notify_channel"]
          chat_id: string
          created_at: string
          email: string
          fallback_channel: Database["public"]["Enums"]["notify_channel"] | null
          fallback_target: string
          id: string
          is_default: boolean
          label: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel?: Database["public"]["Enums"]["notify_channel"]
          chat_id?: string
          created_at?: string
          email?: string
          fallback_channel?:
            | Database["public"]["Enums"]["notify_channel"]
            | null
          fallback_target?: string
          id?: string
          is_default?: boolean
          label?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel?: Database["public"]["Enums"]["notify_channel"]
          chat_id?: string
          created_at?: string
          email?: string
          fallback_channel?:
            | Database["public"]["Enums"]["notify_channel"]
            | null
          fallback_target?: string
          id?: string
          is_default?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          active: boolean
          audience: string
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notify_kind"]
          link_url: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notify_kind"]
          link_url?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notify_kind"]
          link_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_webhooks: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          label: string
          last_called_at: string | null
          last_status: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          label?: string
          last_called_at?: string | null
          last_status?: string
          secret?: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          label?: string
          last_called_at?: string | null
          last_status?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          detail: string
          id: string
          kind: string
          purchase_id: string | null
          tg_user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          kind: string
          purchase_id?: string | null
          tg_user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          purchase_id?: string | null
          tg_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_tg_user_id_fkey"
            columns: ["tg_user_id"]
            isOneToOne: false
            referencedRelation: "tg_users"
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
          sale_price_stars: number
          sale_until: string | null
          sort_order: number
          stock_limit: number
          stock_sold: number
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
          sale_price_stars?: number
          sale_until?: string | null
          sort_order?: number
          stock_limit?: number
          stock_sold?: number
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
          sale_price_stars?: number
          sale_until?: string | null
          sort_order?: number
          stock_limit?: number
          stock_sold?: number
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
      purchase_attributions: {
        Row: {
          amount_stars: number
          audience: string
          campaign_id: string | null
          channel: Database["public"]["Enums"]["notify_channel"] | null
          created_at: string
          delivery_id: string | null
          kind: Database["public"]["Enums"]["notify_kind"] | null
          minutes_to_purchase: number
          purchase_id: string
          template_source: string
          touch: string
          touched_at: string | null
        }
        Insert: {
          amount_stars?: number
          audience?: string
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["notify_channel"] | null
          created_at?: string
          delivery_id?: string | null
          kind?: Database["public"]["Enums"]["notify_kind"] | null
          minutes_to_purchase?: number
          purchase_id: string
          template_source?: string
          touch?: string
          touched_at?: string | null
        }
        Update: {
          amount_stars?: number
          audience?: string
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["notify_channel"] | null
          created_at?: string
          delivery_id?: string | null
          kind?: Database["public"]["Enums"]["notify_kind"] | null
          minutes_to_purchase?: number
          purchase_id?: string
          template_source?: string
          touch?: string
          touched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_attributions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_attributions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: true
            referencedRelation: "purchases"
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
          delivered_at: string | null
          delivery_note: string
          delivery_status: Database["public"]["Enums"]["delivery_state"]
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
          delivered_at?: string | null
          delivery_note?: string
          delivery_status?: Database["public"]["Enums"]["delivery_state"]
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
          delivered_at?: string | null
          delivery_note?: string
          delivery_status?: Database["public"]["Enums"]["delivery_state"]
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
      rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: string
          subject: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          subject: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          subject?: string
        }
        Relationships: []
      }
      sponsored_posts: {
        Row: {
          advertiser: string
          contact: string
          content: string
          created_at: string
          id: string
          link_url: string
          media_url: string
          price_stars: number
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["sponsor_status"]
          target: Database["public"]["Enums"]["audience"]
          tg_user_id: string | null
          updated_at: string
        }
        Insert: {
          advertiser: string
          contact?: string
          content?: string
          created_at?: string
          id?: string
          link_url?: string
          media_url?: string
          price_stars?: number
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["sponsor_status"]
          target?: Database["public"]["Enums"]["audience"]
          tg_user_id?: string | null
          updated_at?: string
        }
        Update: {
          advertiser?: string
          contact?: string
          content?: string
          created_at?: string
          id?: string
          link_url?: string
          media_url?: string
          price_stars?: number
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["sponsor_status"]
          target?: Database["public"]["Enums"]["audience"]
          tg_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_posts_tg_user_id_fkey"
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
          received_at: string
          telegram_user_id: number | null
          text: string | null
          update_id: number
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          raw: Json
          received_at?: string
          telegram_user_id?: number | null
          text?: string | null
          update_id: number
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          raw?: Json
          received_at?: string
          telegram_user_id?: number | null
          text?: string | null
          update_id?: number
        }
        Relationships: []
      }
      tg_users: {
        Row: {
          block_reason: string
          blocked: boolean
          created_at: string
          first_name: string | null
          id: string
          joined_free: boolean
          last_seen_at: string
          referral_code: string
          referred_by: string | null
          risk_score: number
          telegram_id: number
          username: string | null
        }
        Insert: {
          block_reason?: string
          blocked?: boolean
          created_at?: string
          first_name?: string | null
          id?: string
          joined_free?: boolean
          last_seen_at?: string
          referral_code: string
          referred_by?: string | null
          risk_score?: number
          telegram_id: number
          username?: string | null
        }
        Update: {
          block_reason?: string
          blocked?: boolean
          created_at?: string
          first_name?: string | null
          id?: string
          joined_free?: boolean
          last_seen_at?: string
          referral_code?: string
          referred_by?: string | null
          risk_score?: number
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
      cron_token_valid: { Args: { p_token: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "operator" | "viewer"
      audience: "free" | "vip" | "both"
      delivery_kind: "text" | "file" | "link"
      delivery_state: "pending" | "delivered" | "failed" | "revoked"
      notify_channel: "telegram" | "email" | "slack"
      notify_kind: "expiring" | "expired" | "unpaid" | "blocked" | "reactivated"
      notify_status: "queued" | "sent" | "retrying" | "dead" | "skipped_optout"
      pay_currency: "stars" | "ton"
      pay_status: "pending" | "paid" | "failed" | "refunded"
      product_kind: "single" | "bundle" | "ppv" | "tip"
      sponsor_status:
        | "requested"
        | "approved"
        | "paid"
        | "published"
        | "rejected"
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
      app_role: ["admin", "user", "operator", "viewer"],
      audience: ["free", "vip", "both"],
      delivery_kind: ["text", "file", "link"],
      delivery_state: ["pending", "delivered", "failed", "revoked"],
      notify_channel: ["telegram", "email", "slack"],
      notify_kind: ["expiring", "expired", "unpaid", "blocked", "reactivated"],
      notify_status: ["queued", "sent", "retrying", "dead", "skipped_optout"],
      pay_currency: ["stars", "ton"],
      pay_status: ["pending", "paid", "failed", "refunded"],
      product_kind: ["single", "bundle", "ppv", "tip"],
      sponsor_status: [
        "requested",
        "approved",
        "paid",
        "published",
        "rejected",
      ],
    },
  },
} as const
