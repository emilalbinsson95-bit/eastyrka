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
      baseline_history: {
        Row: {
          athlete_id: string
          exercise: string
          id: string
          note: string | null
          one_rm_kg: number
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          athlete_id: string
          exercise: string
          id?: string
          note?: string | null
          one_rm_kg: number
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          athlete_id?: string
          exercise?: string
          id?: string
          note?: string | null
          one_rm_kg?: number
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: []
      }
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
          tag: string | null
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          tag?: string | null
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          tag?: string | null
        }
        Relationships: []
      }
      endurance_sessions: {
        Row: {
          actual_total_seconds: number | null
          athlete_id: string
          coach_id: string | null
          created_at: string
          date: string
          discipline: Database["public"]["Enums"]["endurance_discipline"]
          id: string
          mode: Database["public"]["Enums"]["endurance_mode"]
          notes: string | null
          overall_rpe: number | null
          peak_rpe: number | null
          planned_avg_rpe: number | null
          planned_total_seconds: number | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          actual_total_seconds?: number | null
          athlete_id: string
          coach_id?: string | null
          created_at?: string
          date?: string
          discipline?: Database["public"]["Enums"]["endurance_discipline"]
          id?: string
          mode?: Database["public"]["Enums"]["endurance_mode"]
          notes?: string | null
          overall_rpe?: number | null
          peak_rpe?: number | null
          planned_avg_rpe?: number | null
          planned_total_seconds?: number | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          actual_total_seconds?: number | null
          athlete_id?: string
          coach_id?: string | null
          created_at?: string
          date?: string
          discipline?: Database["public"]["Enums"]["endurance_discipline"]
          id?: string
          mode?: Database["public"]["Enums"]["endurance_mode"]
          notes?: string | null
          overall_rpe?: number | null
          peak_rpe?: number | null
          planned_avg_rpe?: number | null
          planned_total_seconds?: number | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      endurance_steps: {
        Row: {
          created_at: string
          discipline: Database["public"]["Enums"]["endurance_discipline"] | null
          duration_seconds: number | null
          id: string
          is_group: boolean
          notes: string | null
          order_index: number
          parent_id: string | null
          repeat_count: number
          session_id: string
          target_rpe: number | null
        }
        Insert: {
          created_at?: string
          discipline?:
            | Database["public"]["Enums"]["endurance_discipline"]
            | null
          duration_seconds?: number | null
          id?: string
          is_group?: boolean
          notes?: string | null
          order_index?: number
          parent_id?: string | null
          repeat_count?: number
          session_id: string
          target_rpe?: number | null
        }
        Update: {
          created_at?: string
          discipline?:
            | Database["public"]["Enums"]["endurance_discipline"]
            | null
          duration_seconds?: number | null
          id?: string
          is_group?: boolean
          notes?: string | null
          order_index?: number
          parent_id?: string | null
          repeat_count?: number
          session_id?: string
          target_rpe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "endurance_steps_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "endurance_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endurance_steps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "endurance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          default_intensity_metric: Database["public"]["Enums"]["intensity_metric"]
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
          default_intensity_metric?: Database["public"]["Enums"]["intensity_metric"]
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
          default_intensity_metric?: Database["public"]["Enums"]["intensity_metric"]
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
          days_per_week: number
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
          days_per_week?: number
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
          days_per_week?: number
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
      message_threads: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
          last_message_at: string
          planned_session_id: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          planned_session_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          planned_session_id?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_planned_session_id_fkey"
            columns: ["planned_session_id"]
            isOneToOne: false
            referencedRelation: "planned_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_session_feedback: {
        Row: {
          comments: string | null
          created_at: string
          id: string
          pain_after: number | null
          patient_id: string
          session_id: string
          sleep_quality: number | null
          stiffness: number | null
          swelling: number | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          id?: string
          pain_after?: number | null
          patient_id: string
          session_id: string
          sleep_quality?: number | null
          stiffness?: number | null
          swelling?: number | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          id?: string
          pain_after?: number | null
          patient_id?: string
          session_id?: string
          sleep_quality?: number | null
          stiffness?: number | null
          swelling?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_session_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "rehab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      physio_patients: {
        Row: {
          created_at: string
          id: string
          patient_id: string
          physio_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id: string
          physio_id: string
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: string
          physio_id?: string
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
          intensity_metric: Database["public"]["Enums"]["intensity_metric"]
          last_set_to_failure: boolean
          lengthened_partials: boolean
          notes: string | null
          order_index: number
          planned_session_id: string
          target_reps: number
          target_rir: number | null
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
          intensity_metric?: Database["public"]["Enums"]["intensity_metric"]
          last_set_to_failure?: boolean
          lengthened_partials?: boolean
          notes?: string | null
          order_index?: number
          planned_session_id: string
          target_reps: number
          target_rir?: number | null
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
          intensity_metric?: Database["public"]["Enums"]["intensity_metric"]
          last_set_to_failure?: boolean
          lengthened_partials?: boolean
          notes?: string | null
          order_index?: number
          planned_session_id?: string
          target_reps?: number
          target_rir?: number | null
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
      readiness_surveys: {
        Row: {
          athlete_id: string
          bodyweight_kg: number | null
          created_at: string
          daily_form: number
          date: string
          fatigue: number
          id: string
          life_stress: number
          notes: string | null
          nutrition: number | null
          sleep_hours: number | null
          sleep_quality: number | null
          stiffness: number | null
          updated_at: string
          work_stress: number
        }
        Insert: {
          athlete_id: string
          bodyweight_kg?: number | null
          created_at?: string
          daily_form: number
          date: string
          fatigue: number
          id?: string
          life_stress: number
          notes?: string | null
          nutrition?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          stiffness?: number | null
          updated_at?: string
          work_stress: number
        }
        Update: {
          athlete_id?: string
          bodyweight_kg?: number | null
          created_at?: string
          daily_form?: number
          date?: string
          fatigue?: number
          id?: string
          life_stress?: number
          notes?: string | null
          nutrition?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          stiffness?: number | null
          updated_at?: string
          work_stress?: number
        }
        Relationships: []
      }
      rehab_exercises: {
        Row: {
          created_at: string
          hold_seconds: number | null
          id: string
          load_kg: number | null
          name: string
          notes: string | null
          order_index: number
          pain_rating: number | null
          perceived_exertion: number | null
          reps: number | null
          resistance_band: string | null
          rom_notes: string | null
          session_id: string
          sets: number | null
          tolerance: string | null
        }
        Insert: {
          created_at?: string
          hold_seconds?: number | null
          id?: string
          load_kg?: number | null
          name: string
          notes?: string | null
          order_index?: number
          pain_rating?: number | null
          perceived_exertion?: number | null
          reps?: number | null
          resistance_band?: string | null
          rom_notes?: string | null
          session_id: string
          sets?: number | null
          tolerance?: string | null
        }
        Update: {
          created_at?: string
          hold_seconds?: number | null
          id?: string
          load_kg?: number | null
          name?: string
          notes?: string | null
          order_index?: number
          pain_rating?: number | null
          perceived_exertion?: number | null
          reps?: number | null
          resistance_band?: string | null
          rom_notes?: string | null
          session_id?: string
          sets?: number | null
          tolerance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rehab_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "rehab_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_sessions: {
        Row: {
          created_at: string
          id: string
          objective_notes: string | null
          overall_pain: number | null
          patient_id: string
          physio_id: string
          session_date: string
          status: string
          subjective_notes: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          objective_notes?: string | null
          overall_pain?: number | null
          patient_id: string
          physio_id: string
          session_date?: string
          status?: string
          subjective_notes?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          objective_notes?: string | null
          overall_pain?: number | null
          patient_id?: string
          physio_id?: string
          session_date?: string
          status?: string
          subjective_notes?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_logs: {
        Row: {
          athlete_id: string
          comment: string | null
          created_at: string
          date: string
          edited_by_athlete_at: string | null
          exercise: string
          form_score: number | null
          id: string
          lengthened_partials: boolean
          original_reps: number | null
          original_rpe: number | null
          planned_exercise_id: string | null
          reps: number
          rir: number | null
          rpe: number
          set_number: number
          to_failure: boolean
          variation: string | null
          weight_kg: number
        }
        Insert: {
          athlete_id: string
          comment?: string | null
          created_at?: string
          date: string
          edited_by_athlete_at?: string | null
          exercise: string
          form_score?: number | null
          id?: string
          lengthened_partials?: boolean
          original_reps?: number | null
          original_rpe?: number | null
          planned_exercise_id?: string | null
          reps: number
          rir?: number | null
          rpe: number
          set_number: number
          to_failure?: boolean
          variation?: string | null
          weight_kg: number
        }
        Update: {
          athlete_id?: string
          comment?: string | null
          created_at?: string
          date?: string
          edited_by_athlete_at?: string | null
          exercise?: string
          form_score?: number | null
          id?: string
          lengthened_partials?: boolean
          original_reps?: number | null
          original_rpe?: number | null
          planned_exercise_id?: string | null
          reps?: number
          rir?: number | null
          rpe?: number
          set_number?: number
          to_failure?: boolean
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
      is_physio_of: {
        Args: { _patient_id: string; _physio_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "coach" | "athlete" | "physio" | "patient"
      cycle_status: "draft" | "active" | "archived"
      endurance_discipline: "run" | "bike" | "swim" | "other"
      endurance_mode: "quick" | "structured"
      intensity_metric: "rpe" | "rir"
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
      app_role: ["coach", "athlete", "physio", "patient"],
      cycle_status: ["draft", "active", "archived"],
      endurance_discipline: ["run", "bike", "swim", "other"],
      endurance_mode: ["quick", "structured"],
      intensity_metric: ["rpe", "rir"],
      plan_status: ["draft", "published"],
    },
  },
} as const
