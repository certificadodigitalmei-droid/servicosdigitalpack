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
      admin_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string | null
          error_message: string | null
          id: string
          method: string | null
          provider: string | null
          request_summary: Json | null
          response_summary: Json | null
          status_code: number | null
          success: boolean | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          method?: string | null
          provider?: string | null
          request_summary?: Json | null
          response_summary?: Json | null
          status_code?: number | null
          success?: boolean | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          method?: string | null
          provider?: string | null
          request_summary?: Json | null
          response_summary?: Json | null
          status_code?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      aquicnpj_settings: {
        Row: {
          cnaes: Json | null
          com_contato_telefonico: boolean | null
          com_email: boolean | null
          created_at: string
          excluir_mei: boolean | null
          id: string
          interval_minutes: number | null
          last_error: string | null
          last_run_at: string | null
          max_complete_credits_per_day: number | null
          max_new_companies_per_run: number | null
          max_pages_per_run: number | null
          monitor_enabled: boolean | null
          monitor_mode: Database["public"]["Enums"]["monitor_mode"] | null
          municipio: Json | null
          next_run_at: string | null
          page_size: number | null
          range_query: Json | null
          remove_contab: boolean | null
          situacao_cadastral: Json | null
          somente_filial: boolean | null
          somente_matriz: boolean | null
          somente_mei: boolean | null
          target_date: string | null
          uf: Json | null
          updated_at: string
          use_current_date: boolean | null
        }
        Insert: {
          cnaes?: Json | null
          com_contato_telefonico?: boolean | null
          com_email?: boolean | null
          created_at?: string
          excluir_mei?: boolean | null
          id?: string
          interval_minutes?: number | null
          last_error?: string | null
          last_run_at?: string | null
          max_complete_credits_per_day?: number | null
          max_new_companies_per_run?: number | null
          max_pages_per_run?: number | null
          monitor_enabled?: boolean | null
          monitor_mode?: Database["public"]["Enums"]["monitor_mode"] | null
          municipio?: Json | null
          next_run_at?: string | null
          page_size?: number | null
          range_query?: Json | null
          remove_contab?: boolean | null
          situacao_cadastral?: Json | null
          somente_filial?: boolean | null
          somente_matriz?: boolean | null
          somente_mei?: boolean | null
          target_date?: string | null
          uf?: Json | null
          updated_at?: string
          use_current_date?: boolean | null
        }
        Update: {
          cnaes?: Json | null
          com_contato_telefonico?: boolean | null
          com_email?: boolean | null
          created_at?: string
          excluir_mei?: boolean | null
          id?: string
          interval_minutes?: number | null
          last_error?: string | null
          last_run_at?: string | null
          max_complete_credits_per_day?: number | null
          max_new_companies_per_run?: number | null
          max_pages_per_run?: number | null
          monitor_enabled?: boolean | null
          monitor_mode?: Database["public"]["Enums"]["monitor_mode"] | null
          municipio?: Json | null
          next_run_at?: string | null
          page_size?: number | null
          range_query?: Json | null
          remove_contab?: boolean | null
          situacao_cadastral?: Json | null
          somente_filial?: boolean | null
          somente_matriz?: boolean | null
          somente_mei?: boolean | null
          target_date?: string | null
          uf?: Json | null
          updated_at?: string
          use_current_date?: boolean | null
        }
        Relationships: []
      }
      automatic_company_queries: {
        Row: {
          auto_generate_links_enabled: boolean
          auto_import_enabled: boolean
          created_at: string
          enabled: boolean
          filters: Json
          heartbeat_at: string | null
          id: string
          interval_minutes: number
          last_error: string | null
          last_run_at: string | null
          lock_token: string | null
          max_detail_queries_per_run: number
          max_execution_time_ms: number
          max_items_analyzed_per_run: number
          max_pages_per_run: number
          mode: string
          name: string
          next_run_at: string | null
          owner_user_id: string
          page_size: number
          pagination_cursors: Json
          quantity_per_run: number
          query_date_mode: string
          search_page_size: number
          search_pages_per_run: number
          selected_query_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auto_generate_links_enabled?: boolean
          auto_import_enabled?: boolean
          created_at?: string
          enabled?: boolean
          filters?: Json
          heartbeat_at?: string | null
          id?: string
          interval_minutes?: number
          last_error?: string | null
          last_run_at?: string | null
          lock_token?: string | null
          max_detail_queries_per_run?: number
          max_execution_time_ms?: number
          max_items_analyzed_per_run?: number
          max_pages_per_run?: number
          mode?: string
          name?: string
          next_run_at?: string | null
          owner_user_id: string
          page_size?: number
          pagination_cursors?: Json
          quantity_per_run?: number
          query_date_mode?: string
          search_page_size?: number
          search_pages_per_run?: number
          selected_query_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auto_generate_links_enabled?: boolean
          auto_import_enabled?: boolean
          created_at?: string
          enabled?: boolean
          filters?: Json
          heartbeat_at?: string | null
          id?: string
          interval_minutes?: number
          last_error?: string | null
          last_run_at?: string | null
          lock_token?: string | null
          max_detail_queries_per_run?: number
          max_execution_time_ms?: number
          max_items_analyzed_per_run?: number
          max_pages_per_run?: number
          mode?: string
          name?: string
          next_run_at?: string | null
          owner_user_id?: string
          page_size?: number
          pagination_cursors?: Json
          quantity_per_run?: number
          query_date_mode?: string
          search_page_size?: number
          search_pages_per_run?: number
          selected_query_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      automatic_company_query_runs: {
        Row: {
          api_summary: Json | null
          api_total: number | null
          automation_id: string
          complete_count: number
          created_at: string
          current_stage: string | null
          cursor_end: Json | null
          cursor_start: Json | null
          detail_queries: number
          duplicate_count: number
          error_message: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          imported_count: number
          incomplete_count: number
          items_analyzed: number
          items_received: number
          limit_reason: string | null
          link_created_count: number
          link_reused_count: number
          missing_fields_summary: Json
          pages_fetched: number
          partial_reason: string | null
          pending_enrichment_count: number
          query_date: string | null
          recovered_reason: string | null
          requested_quantity: number | null
          started_at: string
          status: string
          test_link_count: number
          trigger: string
        }
        Insert: {
          api_summary?: Json | null
          api_total?: number | null
          automation_id: string
          complete_count?: number
          created_at?: string
          current_stage?: string | null
          cursor_end?: Json | null
          cursor_start?: Json | null
          detail_queries?: number
          duplicate_count?: number
          error_message?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          imported_count?: number
          incomplete_count?: number
          items_analyzed?: number
          items_received?: number
          limit_reason?: string | null
          link_created_count?: number
          link_reused_count?: number
          missing_fields_summary?: Json
          pages_fetched?: number
          partial_reason?: string | null
          pending_enrichment_count?: number
          query_date?: string | null
          recovered_reason?: string | null
          requested_quantity?: number | null
          started_at?: string
          status?: string
          test_link_count?: number
          trigger?: string
        }
        Update: {
          api_summary?: Json | null
          api_total?: number | null
          automation_id?: string
          complete_count?: number
          created_at?: string
          current_stage?: string | null
          cursor_end?: Json | null
          cursor_start?: Json | null
          detail_queries?: number
          duplicate_count?: number
          error_message?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          imported_count?: number
          incomplete_count?: number
          items_analyzed?: number
          items_received?: number
          limit_reason?: string | null
          link_created_count?: number
          link_reused_count?: number
          missing_fields_summary?: Json
          pages_fetched?: number
          partial_reason?: string | null
          pending_enrichment_count?: number
          query_date?: string | null
          recovered_reason?: string | null
          requested_quantity?: number | null
          started_at?: string
          status?: string
          test_link_count?: number
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "automatic_company_query_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automatic_company_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      automatic_company_queue: {
        Row: {
          attempts: number
          automation_id: string
          cnpj: string
          company_id: string | null
          company_link_id: string | null
          created_at: string
          data_quality_status: string
          id: string
          is_test_record: boolean
          last_attempt_at: string | null
          last_error: string | null
          last_normalized_at: string | null
          missing_fields: Json
          query_date: string
          raw_data: Json | null
          run_id: string | null
          status: string
          was_new_company: boolean
          was_new_link: boolean
        }
        Insert: {
          attempts?: number
          automation_id: string
          cnpj: string
          company_id?: string | null
          company_link_id?: string | null
          created_at?: string
          data_quality_status?: string
          id?: string
          is_test_record?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_normalized_at?: string | null
          missing_fields?: Json
          query_date?: string
          raw_data?: Json | null
          run_id?: string | null
          status?: string
          was_new_company?: boolean
          was_new_link?: boolean
        }
        Update: {
          attempts?: number
          automation_id?: string
          cnpj?: string
          company_id?: string | null
          company_link_id?: string | null
          created_at?: string
          data_quality_status?: string
          id?: string
          is_test_record?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          last_normalized_at?: string | null
          missing_fields?: Json
          query_date?: string
          raw_data?: Json | null
          run_id?: string | null
          status?: string
          was_new_company?: boolean
          was_new_link?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "automatic_company_queue_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automatic_company_queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automatic_company_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automatic_company_queue_company_link_id_fkey"
            columns: ["company_link_id"]
            isOneToOne: false
            referencedRelation: "company_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automatic_company_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automatic_company_query_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_audit_logs: {
        Row: {
          cnpj: string | null
          company_id: string | null
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
        }
        Insert: {
          cnpj?: string | null
          company_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          cnpj?: string | null
          company_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_contact_numbers: {
        Row: {
          cnpj_snapshot: string | null
          company_id: string | null
          created_at: string
          id: string
          phone_canonical: string | null
          phone_e164: string | null
          provider_code: string | null
          provider_status: number | null
          reason: string
          source: string
        }
        Insert: {
          cnpj_snapshot?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          phone_canonical?: string | null
          phone_e164?: string | null
          provider_code?: string | null
          provider_status?: number | null
          reason?: string
          source?: string
        }
        Update: {
          cnpj_snapshot?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          phone_canonical?: string | null
          phone_e164?: string | null
          provider_code?: string | null
          provider_status?: number | null
          reason?: string
          source?: string
        }
        Relationships: []
      }
      campaign_variant_settings: {
        Row: {
          id: number
          updated_at: string
          variant_ids: Json
        }
        Insert: {
          id?: number
          updated_at?: string
          variant_ids?: Json
        }
        Update: {
          id?: number
          updated_at?: string
          variant_ids?: Json
        }
        Relationships: []
      }
      casa_dos_dados_settings: {
        Row: {
          api_base_url: string | null
          api_key: string | null
          id: number
          updated_at: string
        }
        Insert: {
          api_base_url?: string | null
          api_key?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          api_base_url?: string | null
          api_key?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      cloud_automation_settings: {
        Row: {
          burst_concurrency: number
          created_at: string
          enabled: boolean
          hourly_batch_size: number
          id: number
          import_batch_size: number
          last_run_at: string | null
          lock_heartbeat_at: string | null
          lock_token: string | null
          paced_delay_sec: number
          send_mode: string
          send_profile: string
          status: string
          updated_at: string
        }
        Insert: {
          burst_concurrency?: number
          created_at?: string
          enabled?: boolean
          hourly_batch_size?: number
          id?: number
          import_batch_size?: number
          last_run_at?: string | null
          lock_heartbeat_at?: string | null
          lock_token?: string | null
          paced_delay_sec?: number
          send_mode?: string
          send_profile?: string
          status?: string
          updated_at?: string
        }
        Update: {
          burst_concurrency?: number
          created_at?: string
          enabled?: boolean
          hourly_batch_size?: number
          id?: number
          import_batch_size?: number
          last_run_at?: string | null
          lock_heartbeat_at?: string | null
          lock_token?: string | null
          paced_delay_sec?: number
          send_mode?: string
          send_profile?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          bairro: string | null
          capital_social: number | null
          cep: string | null
          cnae_principal_codigo: string | null
          cnae_principal_descricao: string | null
          cnaes_secundarios: Json | null
          cnpj: string
          complemento: string | null
          complete_data_fetched_at: string | null
          created_at: string
          data_quality_status: string
          ddd: string | null
          email: string | null
          first_found_at: string | null
          fonte: string | null
          id: string
          inicio_atividade: string | null
          is_filial: boolean | null
          is_matriz: boolean | null
          is_mei: boolean | null
          is_simples: boolean | null
          is_test_record: boolean
          last_seen_at: string | null
          logradouro: string | null
          missing_fields: Json
          municipio_codigo: string | null
          municipio_descricao: string | null
          natureza_id: string | null
          nivel_dados: Database["public"]["Enums"]["data_level"] | null
          nome_fantasia: string | null
          nome_titular_exibicao: string | null
          numero: string | null
          numero_socios: number | null
          porte: string | null
          possui_email: boolean | null
          possui_telefone: boolean | null
          razao_social_original: string | null
          situacao_cadastral: string | null
          situacao_cadastral_data: string | null
          situacao_cadastral_desc: string | null
          socios: Json | null
          status: Database["public"]["Enums"]["company_status"] | null
          telefones: Json | null
          tipo_logradouro: string | null
          tipo_telefone: string | null
          uf: string | null
          updated_at: string
          whatsapp_phone_e164: string | null
        }
        Insert: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cnae_principal_codigo?: string | null
          cnae_principal_descricao?: string | null
          cnaes_secundarios?: Json | null
          cnpj: string
          complemento?: string | null
          complete_data_fetched_at?: string | null
          created_at?: string
          data_quality_status?: string
          ddd?: string | null
          email?: string | null
          first_found_at?: string | null
          fonte?: string | null
          id?: string
          inicio_atividade?: string | null
          is_filial?: boolean | null
          is_matriz?: boolean | null
          is_mei?: boolean | null
          is_simples?: boolean | null
          is_test_record?: boolean
          last_seen_at?: string | null
          logradouro?: string | null
          missing_fields?: Json
          municipio_codigo?: string | null
          municipio_descricao?: string | null
          natureza_id?: string | null
          nivel_dados?: Database["public"]["Enums"]["data_level"] | null
          nome_fantasia?: string | null
          nome_titular_exibicao?: string | null
          numero?: string | null
          numero_socios?: number | null
          porte?: string | null
          possui_email?: boolean | null
          possui_telefone?: boolean | null
          razao_social_original?: string | null
          situacao_cadastral?: string | null
          situacao_cadastral_data?: string | null
          situacao_cadastral_desc?: string | null
          socios?: Json | null
          status?: Database["public"]["Enums"]["company_status"] | null
          telefones?: Json | null
          tipo_logradouro?: string | null
          tipo_telefone?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_phone_e164?: string | null
        }
        Update: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cnae_principal_codigo?: string | null
          cnae_principal_descricao?: string | null
          cnaes_secundarios?: Json | null
          cnpj?: string
          complemento?: string | null
          complete_data_fetched_at?: string | null
          created_at?: string
          data_quality_status?: string
          ddd?: string | null
          email?: string | null
          first_found_at?: string | null
          fonte?: string | null
          id?: string
          inicio_atividade?: string | null
          is_filial?: boolean | null
          is_matriz?: boolean | null
          is_mei?: boolean | null
          is_simples?: boolean | null
          is_test_record?: boolean
          last_seen_at?: string | null
          logradouro?: string | null
          missing_fields?: Json
          municipio_codigo?: string | null
          municipio_descricao?: string | null
          natureza_id?: string | null
          nivel_dados?: Database["public"]["Enums"]["data_level"] | null
          nome_fantasia?: string | null
          nome_titular_exibicao?: string | null
          numero?: string | null
          numero_socios?: number | null
          porte?: string | null
          possui_email?: boolean | null
          possui_telefone?: boolean | null
          razao_social_original?: string | null
          situacao_cadastral?: string | null
          situacao_cadastral_data?: string | null
          situacao_cadastral_desc?: string | null
          socios?: Json | null
          status?: Database["public"]["Enums"]["company_status"] | null
          telefones?: Json | null
          tipo_logradouro?: string | null
          tipo_telefone?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_phone_e164?: string | null
        }
        Relationships: []
      }
      company_links: {
        Row: {
          access_count: number | null
          active: boolean | null
          amount_cents: number | null
          checkout_url: string | null
          company_data: Json
          company_id: string | null
          created_at: string
          data_quality_status: string
          discount_amount_cents: number | null
          discount_expires_at: string | null
          expires_at: string | null
          first_access_at: string | null
          generation_id: string | null
          id: string
          is_test_record: boolean
          last_access_at: string | null
          loader_shown_at: string | null
          promo_email_count: number
          promo_email_sent_at: string | null
          public_token: string
          public_url: string | null
          status: string | null
          token: string | null
          updated_at: string
        }
        Insert: {
          access_count?: number | null
          active?: boolean | null
          amount_cents?: number | null
          checkout_url?: string | null
          company_data?: Json
          company_id?: string | null
          created_at?: string
          data_quality_status?: string
          discount_amount_cents?: number | null
          discount_expires_at?: string | null
          expires_at?: string | null
          first_access_at?: string | null
          generation_id?: string | null
          id?: string
          is_test_record?: boolean
          last_access_at?: string | null
          loader_shown_at?: string | null
          promo_email_count?: number
          promo_email_sent_at?: string | null
          public_token: string
          public_url?: string | null
          status?: string | null
          token?: string | null
          updated_at?: string
        }
        Update: {
          access_count?: number | null
          active?: boolean | null
          amount_cents?: number | null
          checkout_url?: string | null
          company_data?: Json
          company_id?: string | null
          created_at?: string
          data_quality_status?: string
          discount_amount_cents?: number | null
          discount_expires_at?: string | null
          expires_at?: string | null
          first_access_at?: string | null
          generation_id?: string | null
          id?: string
          is_test_record?: boolean
          last_access_at?: string | null
          loader_shown_at?: string | null
          promo_email_count?: number
          promo_email_sent_at?: string | null
          public_token?: string
          public_url?: string | null
          status?: string | null
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_links_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "link_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          privacy_accepted: boolean
          service_private_acknowledged: boolean
          terms_accepted: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          privacy_accepted?: boolean
          service_private_acknowledged?: boolean
          terms_accepted?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          privacy_accepted?: boolean
          service_private_acknowledged?: boolean
          terms_accepted?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_queue: {
        Row: {
          approved_at: string | null
          company_id: string | null
          company_link_id: string | null
          created_at: string
          error_message: string | null
          id: string
          message_html: string | null
          message_text: string | null
          provider_message_id: string | null
          recipient_email: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["contact_status"] | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          company_id?: string | null
          company_link_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message_html?: string | null
          message_text?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          company_id?: string | null
          company_link_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message_html?: string | null
          message_text?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_queue_company_link_id_fkey"
            columns: ["company_link_id"]
            isOneToOne: false
            referencedRelation: "company_links"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          document: string
          email: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document: string
          email: string
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_campaign_recipients: {
        Row: {
          bounced_at: string | null
          campaign_id: string | null
          checkout_link: string | null
          clicked_at: string | null
          cnpj: string | null
          company_name: string | null
          created_at: string | null
          data_abertura: string | null
          data_situacao: string | null
          delivered_at: string | null
          email: string
          error_message: string | null
          gemmail_subscriber_id: string | null
          id: string
          municipio: string | null
          nome_titular: string | null
          opened_at: string | null
          provider_message_id: string | null
          provider_status: string | null
          public_link: string | null
          razao_social: string | null
          reference_code: string | null
          row_data: Json | null
          sent_at: string | null
          situacao: string | null
          status: string | null
          token: string | null
          uf: string | null
          unsubscribed_at: string | null
          updated_at: string | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id?: string | null
          checkout_link?: string | null
          clicked_at?: string | null
          cnpj?: string | null
          company_name?: string | null
          created_at?: string | null
          data_abertura?: string | null
          data_situacao?: string | null
          delivered_at?: string | null
          email: string
          error_message?: string | null
          gemmail_subscriber_id?: string | null
          id?: string
          municipio?: string | null
          nome_titular?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          public_link?: string | null
          razao_social?: string | null
          reference_code?: string | null
          row_data?: Json | null
          sent_at?: string | null
          situacao?: string | null
          status?: string | null
          token?: string | null
          uf?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string | null
          checkout_link?: string | null
          clicked_at?: string | null
          cnpj?: string | null
          company_name?: string | null
          created_at?: string | null
          data_abertura?: string | null
          data_situacao?: string | null
          delivered_at?: string | null
          email?: string
          error_message?: string | null
          gemmail_subscriber_id?: string | null
          id?: string
          municipio?: string | null
          nome_titular?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          public_link?: string | null
          razao_social?: string | null
          reference_code?: string | null
          row_data?: Json | null
          sent_at?: string | null
          situacao?: string | null
          status?: string | null
          token?: string | null
          uf?: string | null
          unsubscribed_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          design_json: Json | null
          from_email: string | null
          from_name: string | null
          gemmail_campaign_id: string | null
          gemmail_list_id: string | null
          gemmail_template_id: string | null
          html_template: string | null
          id: string
          invalid_recipients: number | null
          name: string
          preheader_template: string | null
          provider: string | null
          provider_error: string | null
          provider_status: string | null
          reply_to: string | null
          sent_at: string | null
          source_file_name: string | null
          status: string | null
          subject_template: string | null
          synced_at: string | null
          text_template: string | null
          total_rows: number | null
          updated_at: string | null
          valid_recipients: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          design_json?: Json | null
          from_email?: string | null
          from_name?: string | null
          gemmail_campaign_id?: string | null
          gemmail_list_id?: string | null
          gemmail_template_id?: string | null
          html_template?: string | null
          id?: string
          invalid_recipients?: number | null
          name: string
          preheader_template?: string | null
          provider?: string | null
          provider_error?: string | null
          provider_status?: string | null
          reply_to?: string | null
          sent_at?: string | null
          source_file_name?: string | null
          status?: string | null
          subject_template?: string | null
          synced_at?: string | null
          text_template?: string | null
          total_rows?: number | null
          updated_at?: string | null
          valid_recipients?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          design_json?: Json | null
          from_email?: string | null
          from_name?: string | null
          gemmail_campaign_id?: string | null
          gemmail_list_id?: string | null
          gemmail_template_id?: string | null
          html_template?: string | null
          id?: string
          invalid_recipients?: number | null
          name?: string
          preheader_template?: string | null
          provider?: string | null
          provider_error?: string | null
          provider_status?: string | null
          reply_to?: string | null
          sent_at?: string | null
          source_file_name?: string | null
          status?: string | null
          subject_template?: string | null
          synced_at?: string | null
          text_template?: string | null
          total_rows?: number | null
          updated_at?: string | null
          valid_recipients?: number | null
        }
        Relationships: []
      }
      email_send_queue: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          html: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          last_status_code: number | null
          next_retry_at: string | null
          sent_message_id: string | null
          status: string
          subject: string
          text: string | null
          to_email: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          html?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          last_status_code?: number | null
          next_retry_at?: string | null
          sent_message_id?: string | null
          status?: string
          subject: string
          text?: string | null
          to_email: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          html?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          last_status_code?: number | null
          next_retry_at?: string | null
          sent_message_id?: string | null
          status?: string
          subject?: string
          text?: string | null
          to_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          batch_size: number | null
          company_address: string | null
          company_name: string | null
          company_phone: string | null
          delay_between_batches: number | null
          footer_text: string | null
          from_email: string | null
          from_name: string | null
          hourly_limit: number | null
          id: string
          maximum_recipients_per_campaign: number | null
          monthly_limit: number | null
          reply_to: string | null
          sending_domain: string | null
          updated_at: string | null
        }
        Insert: {
          batch_size?: number | null
          company_address?: string | null
          company_name?: string | null
          company_phone?: string | null
          delay_between_batches?: number | null
          footer_text?: string | null
          from_email?: string | null
          from_name?: string | null
          hourly_limit?: number | null
          id?: string
          maximum_recipients_per_campaign?: number | null
          monthly_limit?: number | null
          reply_to?: string | null
          sending_domain?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_size?: number | null
          company_address?: string | null
          company_name?: string | null
          company_phone?: string | null
          delay_between_batches?: number | null
          footer_text?: string | null
          from_email?: string | null
          from_name?: string | null
          hourly_limit?: number | null
          id?: string
          maximum_recipients_per_campaign?: number | null
          monthly_limit?: number | null
          reply_to?: string | null
          sending_domain?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_workers: {
        Row: {
          created_at: string
          daily_limit: number
          from_email: string | null
          from_name: string | null
          hourly_limit: number
          id: string
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          last_used_at: string | null
          monthly_limit: number
          name: string
          notes: string | null
          priority: number
          updated_at: string
          worker_api_key: string
          worker_url: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          from_email?: string | null
          from_name?: string | null
          hourly_limit?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          last_used_at?: string | null
          monthly_limit?: number
          name: string
          notes?: string | null
          priority?: number
          updated_at?: string
          worker_api_key: string
          worker_url: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          from_email?: string | null
          from_name?: string | null
          hourly_limit?: number
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          last_used_at?: string | null
          monthly_limit?: number
          name?: string
          notes?: string | null
          priority?: number
          updated_at?: string
          worker_api_key?: string
          worker_url?: string
        }
        Relationships: []
      }
      link_events: {
        Row: {
          browser: string | null
          company_link_id: string | null
          created_at: string
          device: string | null
          event_type: string
          id: string
          os: string | null
          token: string
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          company_link_id?: string | null
          created_at?: string
          device?: string | null
          event_type: string
          id?: string
          os?: string | null
          token: string
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          company_link_id?: string | null
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          os?: string | null
          token?: string
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_events_company_link_id_fkey"
            columns: ["company_link_id"]
            isOneToOne: false
            referencedRelation: "company_links"
            referencedColumns: ["id"]
          },
        ]
      }
      link_generations: {
        Row: {
          arquivo: string
          created_at: string
          id: string
          total_empresas: number
          total_links: number
        }
        Insert: {
          arquivo: string
          created_at?: string
          id?: string
          total_empresas?: number
          total_links?: number
        }
        Update: {
          arquivo?: string
          created_at?: string
          id?: string
          total_empresas?: number
          total_links?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          customer_document: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          email_paid_sent_at: string | null
          email_pix_sent_at: string | null
          email_recovery_count: number
          email_recovery_last_at: string | null
          email_reminder_sent_at: string | null
          external_transaction_id: string | null
          id: string
          paid_at: string | null
          payment_provider: string | null
          pix_code: string | null
          pix_expiration: string | null
          pix_qr_code: string | null
          product_name: string
          public_link_id: string | null
          reference_cnpj: string | null
          reference_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          email_paid_sent_at?: string | null
          email_pix_sent_at?: string | null
          email_recovery_count?: number
          email_recovery_last_at?: string | null
          email_reminder_sent_at?: string | null
          external_transaction_id?: string | null
          id?: string
          paid_at?: string | null
          payment_provider?: string | null
          pix_code?: string | null
          pix_expiration?: string | null
          pix_qr_code?: string | null
          product_name?: string
          public_link_id?: string | null
          reference_cnpj?: string | null
          reference_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          email_paid_sent_at?: string | null
          email_pix_sent_at?: string | null
          email_recovery_count?: number
          email_recovery_last_at?: string | null
          email_reminder_sent_at?: string | null
          external_transaction_id?: string | null
          id?: string
          paid_at?: string | null
          payment_provider?: string | null
          pix_code?: string | null
          pix_expiration?: string | null
          pix_qr_code?: string | null
          product_name?: string
          public_link_id?: string | null
          reference_cnpj?: string | null
          reference_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_public_link_id_fkey"
            columns: ["public_link_id"]
            isOneToOne: false
            referencedRelation: "company_links"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          api_key: string
          base_url: string | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          provider_type: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_key: string
          base_url?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          provider_type: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_key?: string
          base_url?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          provider_type?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      site_display_settings: {
        Row: {
          id: number
          show_cert_landing: boolean
          show_cert_success: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          show_cert_landing?: boolean
          show_cert_success?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          show_cert_landing?: boolean
          show_cert_success?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      site_popup_settings: {
        Row: {
          badge_text: string
          cancel_button_text: string
          continue_button_text: string
          enabled: boolean
          footer_items: Json
          highlight_text: string
          id: number
          law_text: string
          law_title: string
          payment_alert_text: string
          payment_badge_text: string
          payment_cancel_button_text: string
          payment_confirmation_text: string
          payment_continue_button_text: string
          payment_enabled: boolean
          payment_loading_subtitle: string
          payment_loading_title: string
          payment_partner_text: string
          payment_title: string
          payment_validity_text: string
          price_installment: string
          price_installment_label: string
          price_installment_note: string
          price_main: string
          price_main_label: string
          price_main_note: string
          provider_text: string
          risks: Json
          risks_title: string
          title: string
          updated_at: string
          validity_subtitle: string
          validity_title: string
        }
        Insert: {
          badge_text?: string
          cancel_button_text?: string
          continue_button_text?: string
          enabled?: boolean
          footer_items?: Json
          highlight_text?: string
          id?: number
          law_text?: string
          law_title?: string
          payment_alert_text?: string
          payment_badge_text?: string
          payment_cancel_button_text?: string
          payment_confirmation_text?: string
          payment_continue_button_text?: string
          payment_enabled?: boolean
          payment_loading_subtitle?: string
          payment_loading_title?: string
          payment_partner_text?: string
          payment_title?: string
          payment_validity_text?: string
          price_installment?: string
          price_installment_label?: string
          price_installment_note?: string
          price_main?: string
          price_main_label?: string
          price_main_note?: string
          provider_text?: string
          risks?: Json
          risks_title?: string
          title?: string
          updated_at?: string
          validity_subtitle?: string
          validity_title?: string
        }
        Update: {
          badge_text?: string
          cancel_button_text?: string
          continue_button_text?: string
          enabled?: boolean
          footer_items?: Json
          highlight_text?: string
          id?: number
          law_text?: string
          law_title?: string
          payment_alert_text?: string
          payment_badge_text?: string
          payment_cancel_button_text?: string
          payment_confirmation_text?: string
          payment_continue_button_text?: string
          payment_enabled?: boolean
          payment_loading_subtitle?: string
          payment_loading_title?: string
          payment_partner_text?: string
          payment_title?: string
          payment_validity_text?: string
          price_installment?: string
          price_installment_label?: string
          price_installment_note?: string
          price_main?: string
          price_main_label?: string
          price_main_note?: string
          provider_text?: string
          risks?: Json
          risks_title?: string
          title?: string
          updated_at?: string
          validity_subtitle?: string
          validity_title?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          company_name: string | null
          from_email: string | null
          from_name: string | null
          id: string
          logo_url: string | null
          private_service_notice: string | null
          product_amount: number | null
          product_description: string | null
          product_name: string | null
          recovery_discount_amount: number
          recovery_discount_enabled: boolean
          recovery_discount_hours: number
          reply_to: string | null
          support_email: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          logo_url?: string | null
          private_service_notice?: string | null
          product_amount?: number | null
          product_description?: string | null
          product_name?: string | null
          recovery_discount_amount?: number
          recovery_discount_enabled?: boolean
          recovery_discount_hours?: number
          reply_to?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          logo_url?: string | null
          private_service_notice?: string | null
          product_amount?: number | null
          product_description?: string | null
          product_name?: string | null
          recovery_discount_amount?: number
          recovery_discount_enabled?: boolean
          recovery_discount_hours?: number
          reply_to?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppression_list: {
        Row: {
          cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          reason: string | null
          source: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          complete_queries: number | null
          created_at: string
          credits_after: number | null
          credits_before: number | null
          duplicates_ignored: number | null
          duration_ms: number | null
          error_message: string | null
          filters: Json | null
          finished_at: string | null
          id: string
          mode: Database["public"]["Enums"]["monitor_mode"] | null
          new_companies: number | null
          pages_processed: number | null
          started_at: string | null
          status: string | null
          total_returned: number | null
          updated_companies: number | null
        }
        Insert: {
          complete_queries?: number | null
          created_at?: string
          credits_after?: number | null
          credits_before?: number | null
          duplicates_ignored?: number | null
          duration_ms?: number | null
          error_message?: string | null
          filters?: Json | null
          finished_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["monitor_mode"] | null
          new_companies?: number | null
          pages_processed?: number | null
          started_at?: string | null
          status?: string | null
          total_returned?: number | null
          updated_companies?: number | null
        }
        Update: {
          complete_queries?: number | null
          created_at?: string
          credits_after?: number | null
          credits_before?: number | null
          duplicates_ignored?: number | null
          duration_ms?: number | null
          error_message?: string | null
          filters?: Json | null
          finished_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["monitor_mode"] | null
          new_companies?: number | null
          pages_processed?: number | null
          started_at?: string | null
          status?: string | null
          total_returned?: number | null
          updated_companies?: number | null
        }
        Relationships: []
      }
      user_cloud_state: {
        Row: {
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          external_event_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          processing_status: string
          provider: string
        }
        Insert: {
          created_at?: string
          external_event_id?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          processing_status?: string
          provider: string
        }
        Update: {
          created_at?: string
          external_event_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
        }
        Relationships: []
      }
      whatsapp_api_settings: {
        Row: {
          active: boolean
          base_url: string
          batch_size: number
          button_base_url: string
          channel_id: string | null
          daily_limit: number
          id: number
          last_error: string | null
          min_delay_ms: number
          plugin_id: string | null
          provider: string
          template_body: string | null
          template_language: string
          template_name: string | null
          template_status: string
          updated_at: string
          variable_map: Json
          waba_id: string | null
          whatsapp_api_version: string
          whatsapp_phone_number_id: string | null
        }
        Insert: {
          active?: boolean
          base_url?: string
          batch_size?: number
          button_base_url?: string
          channel_id?: string | null
          daily_limit?: number
          id?: number
          last_error?: string | null
          min_delay_ms?: number
          plugin_id?: string | null
          provider?: string
          template_body?: string | null
          template_language?: string
          template_name?: string | null
          template_status?: string
          updated_at?: string
          variable_map?: Json
          waba_id?: string | null
          whatsapp_api_version?: string
          whatsapp_phone_number_id?: string | null
        }
        Update: {
          active?: boolean
          base_url?: string
          batch_size?: number
          button_base_url?: string
          channel_id?: string | null
          daily_limit?: number
          id?: number
          last_error?: string | null
          min_delay_ms?: number
          plugin_id?: string | null
          provider?: string
          template_body?: string | null
          template_language?: string
          template_name?: string | null
          template_status?: string
          updated_at?: string
          variable_map?: Json
          waba_id?: string | null
          whatsapp_api_version?: string
          whatsapp_phone_number_id?: string | null
        }
        Relationships: []
      }
      whatsapp_batch_config: {
        Row: {
          active: boolean
          batch_size: number
          created_at: string
          daily_limit: number
          day_bucket: string
          extension_token: string
          id: string
          last_heartbeat_at: string | null
          long_pause_ms: number
          max_delay_ms: number
          min_delay_ms: number
          owner_user_id: string
          profile: string
          running: boolean
          sent_today: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          batch_size?: number
          created_at?: string
          daily_limit?: number
          day_bucket?: string
          extension_token: string
          id?: string
          last_heartbeat_at?: string | null
          long_pause_ms?: number
          max_delay_ms?: number
          min_delay_ms?: number
          owner_user_id: string
          profile?: string
          running?: boolean
          sent_today?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          batch_size?: number
          created_at?: string
          daily_limit?: number
          day_bucket?: string
          extension_token?: string
          id?: string
          last_heartbeat_at?: string | null
          long_pause_ms?: number
          max_delay_ms?: number
          min_delay_ms?: number
          owner_user_id?: string
          profile?: string
          running?: boolean
          sent_today?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_campaign_items: {
        Row: {
          attempts: number
          campaign_id: string
          cnpj: string | null
          company_id: string | null
          company_link_id: string | null
          company_name: string | null
          created_at: string
          error_message: string | null
          id: string
          lock_token: string | null
          locked_at: string | null
          next_attempt_at: string
          phone: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          template_name: string
          token: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          cnpj?: string | null
          company_id?: string | null
          company_link_id?: string | null
          company_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lock_token?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          phone: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          template_name: string
          token?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          cnpj?: string | null
          company_id?: string | null
          company_link_id?: string | null
          company_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          lock_token?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          phone?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_items_company_link_id_fkey"
            columns: ["company_link_id"]
            isOneToOne: false
            referencedRelation: "company_links"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          continuous_mode: boolean
          created_at: string
          daily_unique_cap: number
          finished_at: string | null
          id: string
          interval_seconds: number
          last_error: string | null
          name: string
          next_send_at: string | null
          owner_user_id: string
          pace_preset: string
          paused_reason: string | null
          started_at: string | null
          status: string
          target_count: number
          template_language: string
          template_name: string
          updated_at: string
        }
        Insert: {
          continuous_mode?: boolean
          created_at?: string
          daily_unique_cap?: number
          finished_at?: string | null
          id?: string
          interval_seconds?: number
          last_error?: string | null
          name: string
          next_send_at?: string | null
          owner_user_id: string
          pace_preset?: string
          paused_reason?: string | null
          started_at?: string | null
          status?: string
          target_count?: number
          template_language?: string
          template_name: string
          updated_at?: string
        }
        Update: {
          continuous_mode?: boolean
          created_at?: string
          daily_unique_cap?: number
          finished_at?: string | null
          id?: string
          interval_seconds?: number
          last_error?: string | null
          name?: string
          next_send_at?: string | null
          owner_user_id?: string
          pace_preset?: string
          paused_reason?: string | null
          started_at?: string | null
          status?: string
          target_count?: number
          template_language?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          attempts: number
          batch_label: string | null
          button_url_token: string | null
          claimed_at: string | null
          cnpj: string | null
          company_id: string | null
          company_link_id: string | null
          company_name: string | null
          created_at: string
          error_message: string | null
          id: string
          message: string
          owner_user_id: string
          phone: string
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          template_name: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          batch_label?: string | null
          button_url_token?: string | null
          claimed_at?: string | null
          cnpj?: string | null
          company_id?: string | null
          company_link_id?: string | null
          company_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          owner_user_id: string
          phone: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          batch_label?: string | null
          button_url_token?: string | null
          claimed_at?: string | null
          cnpj?: string | null
          company_id?: string | null
          company_link_id?: string | null
          company_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          owner_user_id?: string
          phone?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body_text: string | null
          button_label: string | null
          button_url_base: string | null
          category: string | null
          created_at: string
          footer_text: string | null
          header_text: string | null
          id: string
          language: string
          name: string
          raw: Json | null
          status: string
          synced_at: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body_text?: string | null
          button_label?: string | null
          button_url_base?: string | null
          category?: string | null
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          name: string
          raw?: Json | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_text?: string | null
          button_label?: string | null
          button_url_base?: string | null
          category?: string | null
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          name?: string
          raw?: Json | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_cleanup_unpaid_data: { Args: never; Returns: Json }
      claim_automation_by_id: {
        Args: { _id: string }
        Returns: {
          filters: Json
          id: string
          interval_minutes: number
          mode: string
          owner_user_id: string
          quantity_per_run: number
        }[]
      }
      claim_due_automation: {
        Args: never
        Returns: {
          filters: Json
          id: string
          interval_minutes: number
          mode: string
          owner_user_id: string
          quantity_per_run: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recover_stale_automations: {
        Args: { _older_than?: string }
        Returns: number
      }
      resolve_company_link: {
        Args: { _token: string }
        Returns: {
          abertura: string
          amount_cents: number
          cnpj: string
          email: string
          municipio: string
          natureza_juridica: string
          nome: string
          nome_fantasia: string
          razao_social: string
          situacao: string
          telefone: string
          uf: string
        }[]
      }
      wa_campaign_claim_item: {
        Args: { _campaign_id: string }
        Returns: {
          attempts: number
          cnpj: string
          company_id: string
          company_name: string
          id: string
          phone: string
          template_name: string
          token: string
        }[]
      }
      wq_claim_next: {
        Args: { _token: string }
        Returns: {
          cnpj: string
          company_name: string
          id: string
          message: string
          phone: string
        }[]
      }
      wq_heartbeat: {
        Args: { _token: string }
        Returns: {
          batch_size: number
          daily_limit: number
          long_pause_ms: number
          max_delay_ms: number
          min_delay_ms: number
          running: boolean
          sent_today: number
        }[]
      }
      wq_report: {
        Args: { _error: string; _id: string; _status: string; _token: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      company_status:
        | "encontrada"
        | "dados_basicos"
        | "aguardando_aprovacao"
        | "dados_completos"
        | "qualificada"
        | "link_criado"
        | "mensagem_preparada"
        | "mensagem_aprovada"
        | "mensagem_enviada"
        | "link_acessado"
        | "checkout_iniciado"
        | "pagamento_pendente"
        | "pagamento_confirmado"
        | "falhou"
        | "bloqueada"
        | "descadastrada"
      contact_status:
        | "draft"
        | "awaiting_approval"
        | "approved"
        | "sent"
        | "failed"
        | "blocked"
        | "unsubscribed"
      data_level: "simples" | "completo"
      monitor_mode: "MANUAL" | "SEMIAUTOMATIC" | "AUTOMATIC"
      order_status:
        | "pending"
        | "awaiting_payment"
        | "paid"
        | "expired"
        | "cancelled"
        | "refunded"
        | "failed"
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
      company_status: [
        "encontrada",
        "dados_basicos",
        "aguardando_aprovacao",
        "dados_completos",
        "qualificada",
        "link_criado",
        "mensagem_preparada",
        "mensagem_aprovada",
        "mensagem_enviada",
        "link_acessado",
        "checkout_iniciado",
        "pagamento_pendente",
        "pagamento_confirmado",
        "falhou",
        "bloqueada",
        "descadastrada",
      ],
      contact_status: [
        "draft",
        "awaiting_approval",
        "approved",
        "sent",
        "failed",
        "blocked",
        "unsubscribed",
      ],
      data_level: ["simples", "completo"],
      monitor_mode: ["MANUAL", "SEMIAUTOMATIC", "AUTOMATIC"],
      order_status: [
        "pending",
        "awaiting_payment",
        "paid",
        "expired",
        "cancelled",
        "refunded",
        "failed",
      ],
    },
  },
} as const
