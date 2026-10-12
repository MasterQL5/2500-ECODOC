export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      commodities: {
        Row: {
          base_price: number | null;
          category: string;
          created_at: string;
          current_price: number | null;
          description: string | null;
          id: string;
          name: string;
          notes: string | null;
          previous_price: number | null;
          quantity: number;
          sort_order: number;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          base_price?: number | null;
          category: string;
          created_at?: string;
          current_price?: number | null;
          description?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          previous_price?: number | null;
          quantity?: number;
          sort_order?: number;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          base_price?: number | null;
          category?: string;
          created_at?: string;
          current_price?: number | null;
          description?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          previous_price?: number | null;
          quantity?: number;
          sort_order?: number;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      currencies: {
        Row: {
          anchor_acronym: string | null;
          code: string;
          name: string;
          sort_order: number;
          symbol: string;
        };
        Insert: {
          anchor_acronym?: string | null;
          code: string;
          name: string;
          sort_order?: number;
          symbol: string;
        };
        Update: {
          anchor_acronym?: string | null;
          code?: string;
          name?: string;
          sort_order?: number;
          symbol?: string;
        };
        Relationships: [];
      };
      formula_settings: {
        Row: {
          id: number;
          params: Json;
          updated_at: string;
        };
        Insert: {
          id?: number;
          params?: Json;
          updated_at?: string;
        };
        Update: {
          id?: number;
          params?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_state: {
        Row: {
          base_year: number;
          bureau_name: string;
          currency_code: string;
          current_year: number;
          id: number;
          updated_at: string;
        };
        Insert: {
          base_year?: number;
          bureau_name?: string;
          currency_code?: string;
          current_year?: number;
          id?: number;
          updated_at?: string;
        };
        Update: {
          base_year?: number;
          bureau_name?: string;
          currency_code?: string;
          current_year?: number;
          id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      nation_secrets: {
        Row: {
          access_code: string;
          nation_id: string;
          updated_at: string;
        };
        Insert: {
          access_code: string;
          nation_id: string;
          updated_at?: string;
        };
        Update: {
          access_code?: string;
          nation_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nation_secrets_nation_id_fkey";
            columns: ["nation_id"];
            isOneToOne: true;
            referencedRelation: "nations";
            referencedColumns: ["id"];
          },
        ];
      };
      nations: {
        Row: {
          acronym: string;
          body: string;
          created_at: string;
          credit_rating: string | null;
          credit_score_tri: number | null;
          currency_group: string | null;
          currency_name: string | null;
          currency_symbol: string | null;
          debt: number | null;
          debt_treasury_ratio: number | null;
          expenditure_items: Json;
          expenditures: number | null;
          fiscal: Json;
          flag_emoji: string | null;
          flag_url: string | null;
          gdp_nominal: number | null;
          gdp_per_capita: number | null;
          gdp_ppp: number | null;
          gdp_real: number | null;
          growth_rate: number | null;
          id: string;
          inflation_rate: number | null;
          inflation_ratio: number | null;
          info_rows: Json;
          map_x: number | null;
          map_y: number | null;
          migration: number | null;
          name: string;
          net_income: number | null;
          notes: string | null;
          parent_acronym: string | null;
          pop_growth: number | null;
          population: number | null;
          ppp_conversion: number | null;
          revenue: number | null;
          revenue_gdp_ratio: number | null;
          sort_order: number;
          summary: string | null;
          text_color: string | null;
          treasury: number | null;
          updated_at: string;
        };
        Insert: {
          acronym: string;
          body?: string;
          created_at?: string;
          credit_rating?: string | null;
          credit_score_tri?: number | null;
          currency_group?: string | null;
          currency_name?: string | null;
          currency_symbol?: string | null;
          debt?: number | null;
          debt_treasury_ratio?: number | null;
          expenditure_items?: Json;
          expenditures?: number | null;
          fiscal?: Json;
          flag_emoji?: string | null;
          flag_url?: string | null;
          gdp_nominal?: number | null;
          gdp_per_capita?: number | null;
          gdp_ppp?: number | null;
          gdp_real?: number | null;
          growth_rate?: number | null;
          id?: string;
          inflation_rate?: number | null;
          inflation_ratio?: number | null;
          info_rows?: Json;
          map_x?: number | null;
          map_y?: number | null;
          migration?: number | null;
          name: string;
          net_income?: number | null;
          notes?: string | null;
          parent_acronym?: string | null;
          pop_growth?: number | null;
          population?: number | null;
          ppp_conversion?: number | null;
          revenue?: number | null;
          revenue_gdp_ratio?: number | null;
          sort_order?: number;
          summary?: string | null;
          text_color?: string | null;
          treasury?: number | null;
          updated_at?: string;
        };
        Update: {
          acronym?: string;
          body?: string;
          created_at?: string;
          credit_rating?: string | null;
          credit_score_tri?: number | null;
          currency_group?: string | null;
          currency_name?: string | null;
          currency_symbol?: string | null;
          debt?: number | null;
          debt_treasury_ratio?: number | null;
          expenditure_items?: Json;
          expenditures?: number | null;
          fiscal?: Json;
          flag_emoji?: string | null;
          flag_url?: string | null;
          gdp_nominal?: number | null;
          gdp_per_capita?: number | null;
          gdp_ppp?: number | null;
          gdp_real?: number | null;
          growth_rate?: number | null;
          id?: string;
          inflation_rate?: number | null;
          inflation_ratio?: number | null;
          info_rows?: Json;
          map_x?: number | null;
          map_y?: number | null;
          migration?: number | null;
          name?: string;
          net_income?: number | null;
          notes?: string | null;
          parent_acronym?: string | null;
          pop_growth?: number | null;
          population?: number | null;
          ppp_conversion?: number | null;
          revenue?: number | null;
          revenue_gdp_ratio?: number | null;
          sort_order?: number;
          summary?: string | null;
          text_color?: string | null;
          treasury?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rulings: {
        Row: {
          applied_at: string | null;
          body: string | null;
          created_at: string;
          created_by: string | null;
          effects: Json;
          id: string;
          status: string;
          title: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          applied_at?: string | null;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          effects?: Json;
          id?: string;
          status?: string;
          title: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          applied_at?: string | null;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          effects?: Json;
          id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [];
      };
      tax_formulas: {
        Row: {
          created_at: string;
          group_name: string | null;
          id: string;
          name: string;
          nation_id: string;
          sort_order: number;
          source: string;
          tokens: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          group_name?: string | null;
          id?: string;
          name: string;
          nation_id: string;
          sort_order?: number;
          source?: string;
          tokens?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          group_name?: string | null;
          id?: string;
          name?: string;
          nation_id?: string;
          sort_order?: number;
          source?: string;
          tokens?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tax_formulas_nation_id_fkey";
            columns: ["nation_id"];
            isOneToOne: false;
            referencedRelation: "nations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      year_snapshots: {
        Row: {
          created_at: string;
          data: Json;
          id: string;
          kind: string;
          ref_id: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          data: Json;
          id?: string;
          kind: string;
          ref_id: string;
          year: number;
        };
        Update: {
          created_at?: string;
          data?: Json;
          id?: string;
          kind?: string;
          ref_id?: string;
          year?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "gm" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["gm", "viewer"],
    },
  },
} as const;
