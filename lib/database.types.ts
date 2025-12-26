export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string
          created_at: string
          code: string
          host_id: string
          current_round: number
          status: 'waiting' | 'playing' | 'finished'
          current_event_id: string | null
          phase: 'waiting' | 'showing_image' | 'guessing' | 'revealing'
          phase_started_at: string | null
          used_event_ids: string[]
        }
        Insert: {
          id?: string
          created_at?: string
          code: string
          host_id: string
          current_round?: number
          status?: 'waiting' | 'playing' | 'finished'
          current_event_id?: string | null
          phase?: 'waiting' | 'showing_image' | 'guessing' | 'revealing'
          phase_started_at?: string | null
          used_event_ids?: string[]
        }
        Update: {
          id?: string
          created_at?: string
          code?: string
          host_id?: string
          current_round?: number
          status?: 'waiting' | 'playing' | 'finished'
          current_event_id?: string | null
          phase?: 'waiting' | 'showing_image' | 'guessing' | 'revealing'
          phase_started_at?: string | null
          used_event_ids?: string[]
        }
        Relationships: []
      }
      players: {
        Row: {
          id: string
          created_at: string
          game_id: string
          name: string
          score: number
          color: string
        }
        Insert: {
          id?: string
          created_at?: string
          game_id: string
          name: string
          score?: number
          color?: string
        }
        Update: {
          id?: string
          created_at?: string
          game_id?: string
          name?: string
          score?: number
          color?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          }
        ]
      }
      events: {
        Row: {
          id: string
          created_at: string
          title: string
          description: string
          image_url: string
          latitude: number
          longitude: number
          year: number
          is_ai_generated: boolean | null
        }
        Insert: {
          id?: string
          created_at?: string
          title: string
          description: string
          image_url: string
          latitude: number
          longitude: number
          year: number
          is_ai_generated?: boolean | null
        }
        Update: {
          id?: string
          created_at?: string
          title?: string
          description?: string
          image_url?: string
          latitude?: number
          longitude?: number
          year?: number
          is_ai_generated?: boolean | null
        }
        Relationships: []
      }
      guesses: {
        Row: {
          id: string
          created_at: string
          game_id: string
          player_id: string
          event_id: string
          latitude: number
          longitude: number
          distance_km: number
          round: number
        }
        Insert: {
          id?: string
          created_at?: string
          game_id: string
          player_id: string
          event_id: string
          latitude: number
          longitude: number
          distance_km: number
          round: number
        }
        Update: {
          id?: string
          created_at?: string
          game_id?: string
          player_id?: string
          event_id?: string
          latitude?: number
          longitude?: number
          distance_km?: number
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guesses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guesses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
      Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
      Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never

