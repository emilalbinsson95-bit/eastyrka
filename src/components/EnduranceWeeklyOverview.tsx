import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Activity, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  aggregateWeekly, RPE_BANDS, sessionLoad, type LoadSession,
} from "@/lib/enduranceLoad";
import { formatDuration } from "@/lib/endurance";

export function EnduranceWeeklyOverview({ athleteId, weeks = 8 }: { athleteId: string; weeks?: number }) {
  const sinceIso = format(subDays(new Date(), weeks * 7), "yyyy-MM-dd");
  const q = useQuery({
    queryKey: ["endurance-weekly", athleteId, sinceIso, weeks],
    queryFn: async () => {
      const [endRes, logRes] = await Promise.all([
        supabase
          .from("endurance_sessions")
          .select("date, discipline, actual_total_seconds, planned_total_seconds, overall_rpe, peak_rpe, planned_avg_rpe")
          .eq("athlete_id", athleteId)
          .gte("date", sinceIso)
          .order("date", { ascending: true }),
        // Ad-hoc strength logs → synthesize a session: ~3min per set, RPE from log
        supabase
          .from("training_logs")
          .select("date, rpe")
          .eq("athlete_id", athleteId)
          .is("planned_exercise_id", null)
          .gte("date", sinceIso),
      ]);
      if (endRes.error) throw endRes.error;
      const end = (endRes.data ?? []) as LoadSession[];
      // Group strength logs by date → 1 synthesized session/day
      const byDate = new Map<string, { sets: number; rpeSum: number }>();
      for (const r of logRes.data ?? []) {
        const d = String(r.date);
        const b = byDate.get(d) ?? { sets: 0, rpeSum: 0 };
        b.sets += 1;
        b.rpeSum += Number(r.rpe) || 0;
        byDate.set(d, b);
      }
      const strength: LoadSession[] = Array.from(byDate.entries()).map(([date, v]) => ({
        date,
        discipline: "strength",
        actual_total_seconds: v.sets * 180, // ~3min/set incl. rest
        planned_total_seconds: null,
        overall_rpe: v.sets ? Math.round(v.rpeSum / v.sets) : null,
        peak_rpe: null,
        planned_avg_rpe: null,
      }));
      return [...end, ...strength];
    },
  });

  const buckets = aggregateWeekly(q.data ?? [], weeks);
  const maxLoad = Math.max(1, ...buckets.map((b) => b.load));
  const thisWeek = buckets[buckets.length - 1];
  const prevWeek = buckets[buckets.length - 2];
  const trendPct = prevWeek && prevWeek.load > 0
    ? Math.round(((thisWeek.load - prevWeek.load) / prevWeek.load) * 100) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="h-4 w-4 text-primary" /> Weekly load
          </CardTitle>
          {trendPct != null && (
            <Badge variant={Math.abs(trendPct) > 30 ? "destructive" : "secondary"}>
              {trendPct >= 0 ? "+" : ""}{trendPct}% vs last week
            </Badge>
          )}
        </div>
        <CardDescription>
          Time-under-load weighted by RPE — higher RPE counts more. Numbers are arbitrary load units (sRPE).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bar chart */}
        <div className="flex h-32 items-end gap-1">
          {buckets.map((b) => {
            const h = (b.load / maxLoad) * 100;
            const totalMin = Math.round(b.totalMinutes);
            return (
              <div key={b.weekStart} className="group relative flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full flex-col-reverse overflow-hidden rounded-sm bg-muted/40">
                  {RPE_BANDS.map((band) => {
                    const bm = b.perBand[band.id];
                    if (!bm || b.totalMinutes === 0) return null;
                    const segH = (bm / b.totalMinutes) * h;
                    return <div key={band.id} className={cn(band.color, "w-full")} style={{ height: `${segH}%` }} />;
                  })}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {format(parseISO(b.weekStart), "MMM d")}
                </div>
                <div className="absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-md group-hover:block">
                  <div className="font-semibold">{Math.round(b.load)} load · {totalMin} min</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-[11px]">
          {RPE_BANDS.map((band) => (
            <div key={band.id} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", band.color)} />
              <span className="text-muted-foreground">{band.label}</span>
            </div>
          ))}
        </div>

        {/* This week breakdown */}
        {thisWeek && thisWeek.totalMinutes > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="This week" value={formatDuration(thisWeek.totalMinutes * 60)} />
            <Stat label="Load score" value={String(Math.round(thisWeek.load))} />
            <Stat label="Hard+ min"
              value={String(Math.round(thisWeek.perBand.hard + thisWeek.perBand.max))} />
            <Stat label="Easy %" value={
              `${Math.round((thisWeek.perBand.easy / thisWeek.totalMinutes) * 100)}%`
            } />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export { sessionLoad };
