import type { SupabaseClient } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CoachingAvailability = {
  id: boolean;
  coaching_places: number;
  overview_places: number;
};

type AvailabilityDatabase = {
  public: {
    Tables: {
      coaching_availability: {
        Row: CoachingAvailability;
        Insert: CoachingAvailability;
        Update: Partial<CoachingAvailability>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

const client = supabase as unknown as SupabaseClient<AvailabilityDatabase>;

export const coachingAvailabilityOptions = queryOptions({
  queryKey: ["coaching-availability"],
  queryFn: async () => {
    const { data, error } = await client.from("coaching_availability")
      .select("id, coaching_places, overview_places").eq("id", true).single();
    if (error) throw error;
    return data;
  },
  refetchInterval: 60_000,
});

export async function saveCoachingAvailability(coachingPlaces: number, overviewPlaces: number) {
  for (const value of [coachingPlaces, overviewPlaces]) {
    if (!Number.isInteger(value) || value < 0 || value > 10000) {
      throw new Error("Ange ett heltal mellan 0 och 10 000.");
    }
  }
  const { data, error } = await client.from("coaching_availability")
    .upsert({ id: true, coaching_places: coachingPlaces, overview_places: overviewPlaces })
    .select("id, coaching_places, overview_places").single();
  if (error) throw error;
  return data;
}