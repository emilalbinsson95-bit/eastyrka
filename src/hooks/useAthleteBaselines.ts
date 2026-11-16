import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Athlete's 1RMs for coach editors — derived from recent set-1 logs, with the
 * coach's saved baselines overriding. Shared so every editor computes the same kg.
 */
export function useAthleteBaselines(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ["athlete-baselines", athleteId],
    enabled: Boolean(athleteId),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", athleteId!);
      if (error) throw error;
      const map: Record<string, number> = {};
      try {
        const { deriveBaselinesFromLogs } = await import("@/lib/baselineFromLogs");
        for (const d of await deriveBaselinesFromLogs(athleteId!)) map[d.exercise] = d.oneRmKg;
      } catch {
        /* ignore */
      }
      for (const row of data ?? []) {
        if (Number(row.one_rm_kg) > 0) map[row.exercise] = Number(row.one_rm_kg);
      }
      return map;
    },
  });
}
