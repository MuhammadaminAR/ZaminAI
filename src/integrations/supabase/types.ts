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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          new_plan: Database["public"]["Enums"]["plan_id"] | null
          new_role: Database["public"]["Enums"]["app_role"] | null
          previous_plan: Database["public"]["Enums"]["plan_id"] | null
          previous_role: Database["public"]["Enums"]["app_role"] | null
          reason: string | null
          target_request_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          new_plan?: Database["public"]["Enums"]["plan_id"] | null
          new_role?: Database["public"]["Enums"]["app_role"] | null
          previous_plan?: Database["public"]["Enums"]["plan_id"] | null
          previous_role?: Database["public"]["Enums"]["app_role"] | null
          reason?: string | null
          target_request_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          new_plan?: Database["public"]["Enums"]["plan_id"] | null
          new_role?: Database["public"]["Enums"]["app_role"] | null
          previous_plan?: Database["public"]["Enums"]["plan_id"] | null
          previous_role?: Database["public"]["Enums"]["app_role"] | null
          reason?: string | null
          target_request_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      ai_agronomy_explanations: {
        Row: {
          analysis_request_id: string
          assessment_id: string
          content: Json
          created_at: string
          id: string
          language: string
          model: string
          provider: string
          source_version: string
          user_id: string
        }
        Insert: {
          analysis_request_id: string
          assessment_id: string
          content: Json
          created_at?: string
          id?: string
          language?: string
          model: string
          provider: string
          source_version: string
          user_id: string
        }
        Update: {
          analysis_request_id?: string
          assessment_id?: string
          content?: Json
          created_at?: string
          id?: string
          language?: string
          model?: string
          provider?: string
          source_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agronomy_explanations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "crop_suitability_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_requests: {
        Row: {
          created_at: string
          error_message: string | null
          farm_id: string
          id: string
          soil_status: string | null
          status: string
          user_id: string
          weather_status: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          farm_id: string
          id?: string
          soil_status?: string | null
          status?: string
          user_id: string
          weather_status?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          farm_id?: string
          id?: string
          soil_status?: string | null
          status?: string
          user_id?: string
          weather_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_requests_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_profiles: {
        Row: {
          created_at: string
          crop_name: string
          description: string | null
          id: string
          max_ph: number | null
          min_ph: number | null
          preferred_rainfall_max: number | null
          preferred_rainfall_min: number | null
          preferred_temperature_max: number | null
          preferred_temperature_min: number | null
          slug: string
        }
        Insert: {
          created_at?: string
          crop_name: string
          description?: string | null
          id?: string
          max_ph?: number | null
          min_ph?: number | null
          preferred_rainfall_max?: number | null
          preferred_rainfall_min?: number | null
          preferred_temperature_max?: number | null
          preferred_temperature_min?: number | null
          slug: string
        }
        Update: {
          created_at?: string
          crop_name?: string
          description?: string | null
          id?: string
          max_ph?: number | null
          min_ph?: number | null
          preferred_rainfall_max?: number | null
          preferred_rainfall_min?: number | null
          preferred_temperature_max?: number | null
          preferred_temperature_min?: number | null
          slug?: string
        }
        Relationships: []
      }
      crop_recommendations: {
        Row: {
          analysis_request_id: string | null
          created_at: string
          crop_profile_id: string
          farm_id: string
          id: string
          limitations: string[]
          reasons: string[]
          suitability_level: string
          suitability_score: number
        }
        Insert: {
          analysis_request_id?: string | null
          created_at?: string
          crop_profile_id: string
          farm_id: string
          id?: string
          limitations?: string[]
          reasons?: string[]
          suitability_level: string
          suitability_score: number
        }
        Update: {
          analysis_request_id?: string | null
          created_at?: string
          crop_profile_id?: string
          farm_id?: string
          id?: string
          limitations?: string[]
          reasons?: string[]
          suitability_level?: string
          suitability_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "crop_recommendations_analysis_request_id_fkey"
            columns: ["analysis_request_id"]
            isOneToOne: false
            referencedRelation: "analysis_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_recommendations_crop_profile_id_fkey"
            columns: ["crop_profile_id"]
            isOneToOne: false
            referencedRelation: "crop_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_recommendations_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_suitability_assessments: {
        Row: {
          analysis_request_id: string
          climate_status: string
          climate_summary: Json | null
          created_at: string
          crops: Json
          drainage: string | null
          ec_e_ds_per_m: number | null
          ec_source: string | null
          farm_id: string
          id: string
          irrigation: string
          latitude: number
          longitude: number
          planting_month: number | null
          preliminary: boolean
          profile_version: string
          reclaimed: string | null
          rules_version: string
          salinity_risk: string
          soil_analysis_id: string | null
          user_id: string
          water_quality: string | null
          weights: Json
        }
        Insert: {
          analysis_request_id: string
          climate_status: string
          climate_summary?: Json | null
          created_at?: string
          crops: Json
          drainage?: string | null
          ec_e_ds_per_m?: number | null
          ec_source?: string | null
          farm_id: string
          id?: string
          irrigation: string
          latitude: number
          longitude: number
          planting_month?: number | null
          preliminary?: boolean
          profile_version: string
          reclaimed?: string | null
          rules_version: string
          salinity_risk?: string
          soil_analysis_id?: string | null
          user_id: string
          water_quality?: string | null
          weights: Json
        }
        Update: {
          analysis_request_id?: string
          climate_status?: string
          climate_summary?: Json | null
          created_at?: string
          crops?: Json
          drainage?: string | null
          ec_e_ds_per_m?: number | null
          ec_source?: string | null
          farm_id?: string
          id?: string
          irrigation?: string
          latitude?: number
          longitude?: number
          planting_month?: number | null
          preliminary?: boolean
          profile_version?: string
          reclaimed?: string | null
          rules_version?: string
          salinity_risk?: string
          soil_analysis_id?: string | null
          user_id?: string
          water_quality?: string | null
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "crop_suitability_assessments_analysis_request_id_fkey"
            columns: ["analysis_request_id"]
            isOneToOne: false
            referencedRelation: "analysis_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_suitability_assessments_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_suitability_assessments_soil_analysis_id_fkey"
            columns: ["soil_analysis_id"]
            isOneToOne: false
            referencedRelation: "soil_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_suitability_assessments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      farms: {
        Row: {
          area_hectares: number | null
          country: string | null
          country_code: string | null
          created_at: string
          district: string | null
          formatted_address: string | null
          id: string
          latitude: number
          locality: string | null
          location_name: string | null
          location_source: string
          location_status: string
          longitude: number
          name: string
          region: string | null
          salinity_risk_override: string | null
          user_id: string
        }
        Insert: {
          area_hectares?: number | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          id?: string
          latitude: number
          locality?: string | null
          location_name?: string | null
          location_source?: string
          location_status?: string
          longitude: number
          name: string
          region?: string | null
          salinity_risk_override?: string | null
          user_id: string
        }
        Update: {
          area_hectares?: number | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          district?: string | null
          formatted_address?: string | null
          id?: string
          latitude?: number
          locality?: string | null
          location_name?: string | null
          location_source?: string
          location_status?: string
          longitude?: number
          name?: string
          region?: string | null
          salinity_risk_override?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_climate_summaries: {
        Row: {
          analysis_request_id: string
          created_at: string
          end_date: string
          fetched_at: string
          id: string
          latitude: number
          longitude: number
          payload: Json
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          analysis_request_id: string
          created_at?: string
          end_date: string
          fetched_at: string
          id?: string
          latitude: number
          longitude: number
          payload: Json
          start_date: string
          status: string
          user_id?: string
        }
        Update: {
          analysis_request_id?: string
          created_at?: string
          end_date?: string
          fetched_at?: string
          id?: string
          latitude?: number
          longitude?: number
          payload?: Json
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_climate_summaries_analysis_request_id_fkey"
            columns: ["analysis_request_id"]
            isOneToOne: false
            referencedRelation: "analysis_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_weather_cache: {
        Row: {
          data_version: string
          end_date: string
          fetched_at: string
          id: string
          latitude: number
          longitude: number
          model: string
          payload: Json
          returned_latitude: number | null
          returned_longitude: number | null
          start_date: string
          status: string
        }
        Insert: {
          data_version: string
          end_date: string
          fetched_at?: string
          id?: string
          latitude: number
          longitude: number
          model: string
          payload: Json
          returned_latitude?: number | null
          returned_longitude?: number | null
          start_date: string
          status: string
        }
        Update: {
          data_version?: string
          end_date?: string
          fetched_at?: string
          id?: string
          latitude?: number
          longitude?: number
          model?: string
          payload?: Json
          returned_latitude?: number | null
          returned_longitude?: number | null
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      plan_configs: {
        Row: {
          analysis_batch_size: number | null
          cooldown_hours: number | null
          plan: Database["public"]["Enums"]["plan_id"]
          updated_at: string
        }
        Insert: {
          analysis_batch_size?: number | null
          cooldown_hours?: number | null
          plan: Database["public"]["Enums"]["plan_id"]
          updated_at?: string
        }
        Update: {
          analysis_batch_size?: number | null
          cooldown_hours?: number | null
          plan?: Database["public"]["Enums"]["plan_id"]
          updated_at?: string
        }
        Relationships: []
      }
      prepared_climate_cells: {
        Row: {
          cell_id: string
          center_latitude: number
          center_longitude: number
          dataset: string
          east: number
          end_date: string
          grid_version: string
          imported_at: string
          north: number
          payload: Json
          south: number
          start_date: string
          west: number
        }
        Insert: {
          cell_id: string
          center_latitude: number
          center_longitude: number
          dataset: string
          east: number
          end_date: string
          grid_version: string
          imported_at?: string
          north: number
          payload: Json
          south: number
          start_date: string
          west: number
        }
        Update: {
          cell_id?: string
          center_latitude?: number
          center_longitude?: number
          dataset?: string
          east?: number
          end_date?: string
          grid_version?: string
          imported_at?: string
          north?: number
          payload?: Json
          south?: number
          start_date?: string
          west?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      provider_cooldowns: {
        Row: {
          consecutive_429: number
          cooldown_until: string
          dataset: string | null
          endpoint: string | null
          last_reason: string | null
          last_status: number
          provider: string
          recorded_at: string
        }
        Insert: {
          consecutive_429?: number
          cooldown_until: string
          dataset?: string | null
          endpoint?: string | null
          last_reason?: string | null
          last_status: number
          provider: string
          recorded_at?: string
        }
        Update: {
          consecutive_429?: number
          cooldown_until?: string
          dataset?: string | null
          endpoint?: string | null
          last_reason?: string | null
          last_status?: number
          provider?: string
          recorded_at?: string
        }
        Relationships: []
      }
      quota_batches: {
        Row: {
          batch_size: number
          cooldown_until: string | null
          finalized_count: number
          id: string
          plan: Database["public"]["Enums"]["plan_id"]
          started_at: string
          user_id: string
        }
        Insert: {
          batch_size: number
          cooldown_until?: string | null
          finalized_count?: number
          id?: string
          plan?: Database["public"]["Enums"]["plan_id"]
          started_at?: string
          user_id: string
        }
        Update: {
          batch_size?: number
          cooldown_until?: string | null
          finalized_count?: number
          id?: string
          plan?: Database["public"]["Enums"]["plan_id"]
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quota_reservations: {
        Row: {
          analysis_id: string | null
          batch_id: string | null
          created_at: string
          expires_at: string
          finalized_at: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          batch_id?: string | null
          created_at?: string
          expires_at?: string
          finalized_at?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          batch_id?: string | null
          created_at?: string
          expires_at?: string
          finalized_at?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quota_reservations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "quota_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      soil_analyses: {
        Row: {
          analysis_request_id: string | null
          cec: number | null
          clay: number | null
          confidence: number | null
          created_at: string
          farm_id: string
          id: string
          latitude: number
          longitude: number
          nitrogen: number | null
          organic_carbon: number | null
          ph: number | null
          sand: number | null
          silt: number | null
          source: string
        }
        Insert: {
          analysis_request_id?: string | null
          cec?: number | null
          clay?: number | null
          confidence?: number | null
          created_at?: string
          farm_id: string
          id?: string
          latitude: number
          longitude: number
          nitrogen?: number | null
          organic_carbon?: number | null
          ph?: number | null
          sand?: number | null
          silt?: number | null
          source?: string
        }
        Update: {
          analysis_request_id?: string | null
          cec?: number | null
          clay?: number | null
          confidence?: number | null
          created_at?: string
          farm_id?: string
          id?: string
          latitude?: number
          longitude?: number
          nitrogen?: number | null
          organic_carbon?: number | null
          ph?: number | null
          sand?: number | null
          silt?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "soil_analyses_analysis_request_id_fkey"
            columns: ["analysis_request_id"]
            isOneToOne: false
            referencedRelation: "analysis_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soil_analyses_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
      soilgrids_lookups: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_id"]
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_id"]
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_id"]
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upgrade_requests: {
        Row: {
          admin_note: string | null
          contact_email: string
          created_at: string
          current_plan: Database["public"]["Enums"]["plan_id"]
          id: string
          message: string | null
          phone: string | null
          requested_plan: Database["public"]["Enums"]["plan_id"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          contact_email?: string
          created_at?: string
          current_plan: Database["public"]["Enums"]["plan_id"]
          id?: string
          message?: string | null
          phone?: string | null
          requested_plan: Database["public"]["Enums"]["plan_id"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          contact_email?: string
          created_at?: string
          current_plan?: Database["public"]["Enums"]["plan_id"]
          id?: string
          message?: string | null
          phone?: string | null
          requested_plan?: Database["public"]["Enums"]["plan_id"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
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
      weather_analyses: {
        Row: {
          analysis_request_id: string | null
          created_at: string
          current_precipitation_mm: number | null
          current_rain_mm: number | null
          current_relative_humidity_percent: number | null
          current_temperature_c: number | null
          current_weather_code: number | null
          current_wind_speed_kmh: number | null
          farm_id: string
          fetched_at: string | null
          forecast: Json | null
          humidity: number | null
          id: string
          latitude: number | null
          longitude: number | null
          rainfall: number | null
          source: string
          temperature: number | null
          timezone: string | null
          water_availability: string | null
        }
        Insert: {
          analysis_request_id?: string | null
          created_at?: string
          current_precipitation_mm?: number | null
          current_rain_mm?: number | null
          current_relative_humidity_percent?: number | null
          current_temperature_c?: number | null
          current_weather_code?: number | null
          current_wind_speed_kmh?: number | null
          farm_id: string
          fetched_at?: string | null
          forecast?: Json | null
          humidity?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          rainfall?: number | null
          source?: string
          temperature?: number | null
          timezone?: string | null
          water_availability?: string | null
        }
        Update: {
          analysis_request_id?: string | null
          created_at?: string
          current_precipitation_mm?: number | null
          current_rain_mm?: number | null
          current_relative_humidity_percent?: number | null
          current_temperature_c?: number | null
          current_weather_code?: number | null
          current_wind_speed_kmh?: number | null
          farm_id?: string
          fetched_at?: string | null
          forecast?: Json | null
          humidity?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          rainfall?: number | null
          source?: string
          temperature?: number | null
          timezone?: string | null
          water_availability?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_analyses_analysis_request_id_fkey"
            columns: ["analysis_request_id"]
            isOneToOne: false
            referencedRelation: "analysis_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_analyses_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "farms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_review_upgrade_request: {
        Args: {
          _action: string
          _expires_at?: string
          _note?: string
          _request_id: string
        }
        Returns: undefined
      }
      admin_set_user_plan: {
        Args: {
          _expires_at?: string
          _plan: Database["public"]["Enums"]["plan_id"]
          _reason?: string
          _user_id: string
        }
        Returns: undefined
      }
      current_plan: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["plan_id"]
      }
      ensure_my_profile: { Args: never; Returns: undefined }
      finalize_analysis_quota: {
        Args: { _analysis_id: string; _reservation_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_farm: { Args: { _farm_id: string }; Returns: boolean }
      provision_user: {
        Args: { _email: string; _full_name: string; _id: string }
        Returns: undefined
      }
      quota_status: { Args: never; Returns: Json }
      release_analysis_quota: {
        Args: { _reservation_id: string }
        Returns: undefined
      }
      release_expired_reservations: {
        Args: { _user_id: string }
        Returns: undefined
      }
      reserve_analysis_quota: { Args: never; Returns: string }
      submit_upgrade_request: {
        Args: {
          _message: string
          _phone: string
          _plan: Database["public"]["Enums"]["plan_id"]
        }
        Returns: string
      }
      superadmin_set_role: {
        Args: {
          _grant: boolean
          _reason?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "consultant" | "farmer" | "super_admin"
      plan_id: "free" | "professional" | "premium"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "consultant", "farmer", "super_admin"],
      plan_id: ["free", "professional", "premium"],
    },
  },
} as const
