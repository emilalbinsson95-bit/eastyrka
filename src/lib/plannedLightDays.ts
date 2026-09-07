// Planned light / deload weeks.
//
// A week plan can be marked as a planned light week (is_deload). Training
// logged in such a week is intentionally lighter, so the autoregulation
// engine treats low numbers there as "planned" instead of fatigue alarms,
// and the individualisation engine excludes those weeks when judging an
// athlete's recent volume.

import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/** Expand a list of week-start dates (yyyy-MM-dd, Monday) into every covered day. */
export function weekStartsToDateSet(weekStarts: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const start of weekStarts) {
    for (let i = 0; i < 7; i++) {
      out.add(format(addDays(parseISO(start), i), "yyyy-MM-dd"));
    }
  }
  return out;
}

/** All dates covered by the athlete's planned light (deload) week plans. */
export async function fetchPlannedLightDates(athleteId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("week_plans")
    .select("week_start_date")
    .eq("athlete_id", athleteId)
    .eq("is_deload", true);
  if (error) throw error;
  return weekStartsToDateSet(
    (data ?? []).map((r) => r.week_start_date).filter((d): d is string => d != null),
  );
}
