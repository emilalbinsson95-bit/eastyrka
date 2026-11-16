import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Coach's chosen weight step for an athlete (saved generator choice, default 2.5 kg). */
export function useRoundingStep(athleteId: string | null | undefined): number {
  const q = useQuery({
    queryKey: ["rounding-step", athleteId],
    enabled: Boolean(athleteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_generator_preferences")
        .select("settings")
        .eq("athlete_id", athleteId!)
        .maybeSingle();
      if (error) throw error;
      const step = Number((data?.settings as { roundingKg?: number } | null)?.roundingKg);
      return step === 1 || step === 1.25 || step === 2.5 ? step : 2.5;
    },
  });
  return q.data ?? 2.5;
}
