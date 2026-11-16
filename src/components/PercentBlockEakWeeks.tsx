import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { countsForEAk } from "@/lib/eakoefficient";
import { isCompLift } from "@/lib/liftIdentity";
import { VOLUME_BENCH_ID } from "@/lib/volumeBench";

/** Volymblock bänk: weeks without a measurement set read "Ingen mätning (procentblock)", not missing data. EAk itself is unchanged. */
export function PercentBlockEakWeeks({ athleteId }: { athleteId: string }) {
  const q = useQuery({
    queryKey: ["percent-block-eak-weeks", athleteId],
    queryFn: async () => {
      const { data: meso, error } = await supabase.from("mesocycles").select("id, name").eq("athlete_id", athleteId).eq("template_id", VOLUME_BENCH_ID).order("start_date", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!meso) return null;
      const { data: weeks, error: wErr } = await supabase.from("week_plans").select("week_index, week_start_date").eq("mesocycle_id", meso.id).order("week_index");
      if (wErr) throw wErr;
      if (!weeks?.length) return null;
      const from = weeks[0].week_start_date;
      const to = format(addDays(parseISO(weeks[weeks.length - 1].week_start_date), 6), "yyyy-MM-dd");
      const { data: logs, error: lErr } = await supabase.from("training_logs").select("date, exercise, variation, reps, weight_kg, rpe, is_warmup_reference, is_technique").eq("athlete_id", athleteId).gte("date", from).lte("date", to);
      if (lErr) throw lErr;
      const today = format(new Date(), "yyyy-MM-dd");
      return {
        name: meso.name,
        weeks: weeks.filter((w) => w.week_start_date <= today).map((w) => {
          const end = format(addDays(parseISO(w.week_start_date), 6), "yyyy-MM-dd");
          const measured = (logs ?? []).some((l) => l.date >= w.week_start_date && l.date <= end && !l.is_warmup_reference && !l.is_technique && isCompLift(l.exercise, l.variation) && countsForEAk({ weight_kg: Number(l.weight_kg), reps: l.reps, rpe: l.rpe == null ? 0 : Number(l.rpe) }));
          return { index: w.week_index, measured };
        }),
      };
    },
  });
  if (!q.data?.weeks.length) return null;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{q.data.name}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        {q.data.weeks.map((w) => (
          <li key={w.index}>V{w.index}: {w.measured ? "mätset finns" : "Ingen mätning (procentblock)"}</li>
        ))}
      </ul>
    </div>
  );
}
