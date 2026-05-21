import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, parseISO, subDays, startOfWeek } from "date-fns";
import { Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  aggregateWeekly, RPE_BANDS, sessionLoad, type LoadSession,
} from "@/lib/enduranceLoad";
import { formatDuration } from "@/lib/endurance";

type WindowMode = "thisWeek" | "last7d" | "trend8w";

export function EnduranceWeeklyOverview({ athleteId, weeks = 8 }: { athleteId: string; weeks?: number }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<WindowMode>("thisWeek");
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
        supabase
          .from("training_logs")
          .select("date, rpe")
          .eq("athlete_id", athleteId)
          .is("planned_exercise_id", null)
          .gte("date", sinceIso),
      ]);
      if (endRes.error) throw endRes.error;
      const end = (endRes.data ?? []) as LoadSession[];
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
        actual_total_seconds: v.sets * 180,
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

  // Window-filtered stats
  const windowStats = useMemo(() => {
    const all = q.data ?? [];
    let from: Date;
    const today = new Date();
    if (mode === "thisWeek") from = startOfWeek(today, { weekStartsOn: 1 });
    else if (mode === "last7d") from = subDays(today, 6);
    else return null; // trend uses bucket data directly
    const fromIso = format(from, "yyyy-MM-dd");
    const filtered = all.filter((s) => s.date >= fromIso);
    let totalMin = 0, load = 0, hardMin = 0, easyMin = 0;
    for (const s of filtered) {
      const min = (s.actual_total_seconds ?? s.planned_total_seconds ?? 0) / 60;
      totalMin += min;
      load += sessionLoad(s);
      const rpe = s.overall_rpe ?? s.peak_rpe ?? s.planned_avg_rpe;
      if (rpe != null) {
        if (rpe >= 7) hardMin += min;
        else if (rpe <= 4) easyMin += min;
      }
    }
    return { totalMin, load, hardMin, easyMin };
  }, [q.data, mode]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="h-4 w-4 text-primary" /> {t("endurance.weeklyLoad")}
          </CardTitle>
          {trendPct != null && (
            <Badge variant={Math.abs(trendPct) > 30 ? "destructive" : "secondary"}>
              {trendPct >= 0 ? "+" : ""}{t("endurance.vsLastWeek", { n: trendPct })}
            </Badge>
          )}
        </div>
        <CardDescription>{t("endurance.weeklyLoadDesc")}</CardDescription>
        <div className="flex flex-wrap gap-1 pt-2">
          {(["thisWeek", "last7d", "trend8w"] as WindowMode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setMode(m)}
            >
              {t(`endurance.${m === "trend8w" ? "trend8w" : m}`)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bar chart */}
        <div className="flex h-40 items-end gap-1">
          {buckets.map((b) => {
            const h = maxLoad > 0 ? (b.load / maxLoad) * 100 : 0;
            const totalMin = Math.round(b.totalMinutes);
            return (
              <div key={b.weekStart} className="group relative flex h-full flex-1 flex-col items-center gap-1">
                <div className="relative w-full flex-1 overflow-hidden rounded-sm bg-muted/40">
                  <div
                    className="absolute inset-x-0 bottom-0 flex flex-col-reverse"
                    style={{ height: `${Math.max(h, b.load > 0 ? 4 : 0)}%` }}
                  >
                    {b.totalMinutes > 0
                      ? RPE_BANDS.map((band) => {
                          const bm = b.perBand[band.id];
                          if (!bm) return null;
                          const segH = (bm / b.totalMinutes) * 100;
                          return <div key={band.id} className={cn(band.color, "w-full")} style={{ height: `${segH}%` }} />;
                        })
                      : b.load > 0 && <div className={cn(RPE_BANDS[1].color, "h-full w-full")} />}
                  </div>
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

        {/* Filtered stats */}
        {windowStats && windowStats.totalMin > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t(`endurance.${mode}`)} value={formatDuration(windowStats.totalMin * 60)} />
            <Stat label={t("endurance.loadScore")} value={String(Math.round(windowStats.load))} />
            <Stat label={t("endurance.hardPlusMin")} value={String(Math.round(windowStats.hardMin))} />
            <Stat label={t("endurance.easyPct")} value={
              `${Math.round((windowStats.easyMin / windowStats.totalMin) * 100)}%`
            } />
          </div>
        )}
        {mode === "trend8w" && thisWeek && thisWeek.totalMinutes > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t("endurance.thisWeek")} value={formatDuration(thisWeek.totalMinutes * 60)} />
            <Stat label={t("endurance.loadScore")} value={String(Math.round(thisWeek.load))} />
            <Stat label={t("endurance.hardPlusMin")}
              value={String(Math.round(thisWeek.perBand.hard + thisWeek.perBand.max))} />
            <Stat label={t("endurance.easyPct")} value={
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
