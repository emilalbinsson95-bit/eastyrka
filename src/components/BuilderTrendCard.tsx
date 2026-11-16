import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BUILDER_LIFT_LABEL, BUILDER_STALL_SUGGESTION, BUILDER_STATUS_LABEL, builderTrend, type BuilderLift, type BuilderSession } from "@/lib/builderExercises";
import { cn } from "@/lib/utils";

const kg = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Coach view: every build exercise the athlete has been prescribed, best set per session over the last six sessions. */
export function BuilderTrendCard({ athleteId }: { athleteId: string }) {
  const q = useQuery({
    queryKey: ["builder-trend", athleteId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("planned_exercises")
        .select("exercise, builder_lift, planned_sessions!inner(week_plans!inner(athlete_id))")
        .not("builder_lift", "is", null)
        .eq("planned_sessions.week_plans.athlete_id", athleteId);
      if (error) throw error;
      const lifts = new Map<string, BuilderLift>();
      for (const r of rows ?? []) lifts.set(r.exercise, r.builder_lift as BuilderLift);
      if (!lifts.size) return [];
      const { data: logs, error: logErr } = await supabase.from("training_logs")
        .select("date, exercise, reps, weight_kg, is_warmup_reference")
        .eq("athlete_id", athleteId).in("exercise", [...lifts.keys()])
        .order("date", { ascending: false }).limit(600);
      if (logErr) throw logErr;
      return [...lifts.entries()].map(([exercise, lift]) => {
        const byDate = new Map<string, BuilderSession>();
        for (const l of logs ?? []) {
          if (l.exercise !== exercise || l.is_warmup_reference) continue;
          const s = byDate.get(l.date) ?? { date: l.date, sets: [] };
          s.sets.push({ weight_kg: Number(l.weight_kg), reps: l.reps });
          byDate.set(l.date, s);
        }
        return { exercise, lift, trend: builderTrend([...byDate.values()]) };
      });
    },
  });
  if (q.isLoading || (q.isSuccess && q.data.length === 0)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Byggövningar</CardTitle>
        <CardDescription>Bästa set per pass, de sex senaste passen. Status jämför med tre pass tidigare. Inget ändras automatiskt.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError && <p role="alert" className="text-sm text-destructive">Kunde inte hämta byggövningarna.</p>}
        {(q.data ?? []).map(({ exercise, lift, trend }) => (
          <div key={exercise} className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{exercise} <span className="text-xs text-muted-foreground">· bygger {BUILDER_LIFT_LABEL[lift].toLowerCase()}</span></p>
              {trend.status && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold",
                  trend.status === "up" ? "bg-primary/15 text-primary" : trend.status === "down" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
                  {BUILDER_STATUS_LABEL[trend.status]}
                </span>
              )}
            </div>
            {trend.sessions.length === 0 ? <p className="text-xs text-muted-foreground">Inga loggade pass än.</p> : (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <tbody>
                    <tr>{trend.sessions.map((s) => <td key={s.date} className="pr-3 text-muted-foreground">{s.date.slice(5)}</td>)}</tr>
                    <tr>{trend.sessions.map((s) => <td key={s.date} className="pr-3 font-medium">{kg(s.best.weight_kg)} × {s.best.reps}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
            {trend.changePct != null && <p className="text-xs text-muted-foreground">Förändring sedan {trend.sessions[0].date}: {trend.changePct > 0 ? "+" : ""}{String(trend.changePct).replace(".", ",")} %</p>}
            {trend.status == null && trend.sessions.length > 0 && <p className="text-xs text-muted-foreground">Status visas efter fyra pass.</p>}
            {trend.stalled && <p className="text-xs font-medium text-destructive">Tre pass i rad utan ökning. Förslag: {BUILDER_STALL_SUGGESTION.charAt(0).toLowerCase() + BUILDER_STALL_SUGGESTION.slice(1)}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
