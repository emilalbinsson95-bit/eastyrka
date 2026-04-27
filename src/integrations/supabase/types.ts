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
      baselines: {
        Row: {
          athlete_id: string
          created_at: string
          exercise: string
          id: string
          one_rm_kg: number
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          exercise: string
          id?: string
          one_rm_kg: number
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          exercise?: string
          id?: string
          one_rm_kg?: number
          updated_at?: string
        }
        Relationships: []
      }
      coach_athletes: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_global: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mesocycles: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          goal: string | null
          id: string
          name: string
          notes: string | null
          start_date: string
          status: Database["public"]["Enums"]["cycle_status"]
          total_weeks: number
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          goal?: string | null
          id?: string
          name: string
          notes?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["cycle_status"]
          total_weeks: number
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          goal?: string | null
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["cycle_status"]
          total_weeks?: number
          updated_at?: string
        }
        Relationships: []
      }
      plan_template_exercises: {
        Row: {
          exercise: string
          exercise_id: string | null
          id: string
          notes: string | null
          order_index: number
          target_reps: number
          target_rpe: number | null
          target_sets: number
          target_weight_kg: number | null
          template_session_id: string
          variation: string | null
        }
        Insert: {
          exercise: string
          exercise_id?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          target_reps: number
          target_rpe?: number | null
          target_sets: number
          target_weight_kg?: number | null
          template_session_id: string
          variation?: string | null
        }
        Update: {
          exercise?: string
          exercise_id?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          target_reps?: number
          target_rpe?: number | null
          target_sets?: number
          target_weight_kg?: number | null
          template_session_id?: string
          variation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_template_exercises_template_session_id_fkey"
            columns: ["template_session_id"]
            isOneToOne: false
            referencedRelation: "plan_template_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_template_sessions: {
        Row: {
          day_of_week: number
          id: string
          notes: string | null
          template_id: string
          title: string | null
        }
        Insert: {
          day_of_week: number
          id?: string
          notes?: string | null
          template_id: string
          title?: string | null
        }
        Update: {
          day_of_week?: number
          id?: string
          notes?: string | null
          template_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_template_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_templates: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      planned_exercises: {
        Row: {
          created_at: string
          exercise: string
          exercise_id: string | null
          id: string
          notes: string | null
          order_index: number
          planned_session_id: string
          target_reps: number
          target_rpe: number | null
          target_sets: number
          target_weight_kg: number | null
          variation: string | null
        }
        Insert: {
          created_at?: string
          exercise: string
          exercise_id?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          planned_session_id: string
          target_reps: number
          target_rpe?: number | null
          target_sets: number
          target_weight_kg?: number | null
          variation?: string | null
        }
        Update: {
          created_at?: string
          exercise?: string
          exercise_id?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          planned_session_id?: string
          target_reps?: number
          target_rpe?: number | null
          target_sets?: number
          target_weight_kg?: number | null
          variation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_exercises_planned_session_id_fkey"
            columns: ["planned_session_id"]
            isOneToOne: false
            referencedRelation: "planned_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_sessions: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          notes: string | null
          title: string | null
          week_plan_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          notes?: string | null
          title?: string | null
          week_plan_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          notes?: string | null
          title?: string | null
          week_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_sessions_week_plan_id_fkey"
            columns: ["week_plan_id"]
            isOneToOne: false
            referencedRelation: "week_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          weight_class: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
          weight_class?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          weight_class?: string | null
        }
        Relationships: []
      }
      training_logs: {
        Row: {
          athlete_id: string
          comment: string | null
          created_at: string
          date: string
          exercise: string
          form_score: number | null
          id: string
          planned_exercise_id: string | null
          reps: number
          rpe: number
          set_number: number
          variation: string | null
          weight_kg: number
        }
        Insert: {
          athlete_id: string
          comment?: string | null
          created_at?: string
          date: string
          exercise: string
          form_score?: number | null
          id?: string
          planned_exercise_id?: string | null
          reps: number
          rpe: number
          set_number: number
          variation?: string | null
          weight_kg: number
        }
        Update: {
          athlete_id?: string
          comment?: string | null
          created_at?: string
          date?: string
          exercise?: string
          form_score?: number | null
          id?: string
          planned_exercise_id?: string | null
          reps?: number
          rpe?: number
          set_number?: number
          variation?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_logs_planned_exercise_fk"
            columns: ["planned_exercise_id"]
            isOneToOne: false
            referencedRelation: "planned_exercises"
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
      week_plans: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
          mesocycle_id: string | null
          notes: string | null
          status: Database["public"]["Enums"]["plan_status"]
          updated_at: string
          week_index: number | null
          week_start_date: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          mesocycle_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          week_index?: number | null
          week_start_date: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          mesocycle_id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          week_index?: number | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_plans_mesocycle_id_fkey"
            columns: ["mesocycle_id"]
            isOneToOne: false
            referencedRelation: "mesocycles"
            referencedColumns: ["id"]
          },
        ]
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
      is_coach_of: {
        Args: { _athlete_id: string; _coach_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "coach" | "athlete"
      cycle_status: "draft" | "active" | "archived"
      plan_status: "draft" | "published"
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
      app_role: ["coach", "athlete"],
      cycle_status: ["draft", "active", "archived"],
      plan_status: ["draft", "published"],
    },
  },
} as const
