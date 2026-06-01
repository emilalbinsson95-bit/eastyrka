import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, parseISO, subDays, startOfWeek } from "date-fns";
import { Flame, Activity, ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  aggregateWeekly, RPE_BANDS, sessionLoad, acwr, polarizedDistribution, polarizationTargetForVolume,
  fitnessFatigueSeries, buildSegmentsFromSteps, type LoadSession,
} from "@/lib/enduranceLoad";
import { formatDuration } from "@/lib/endurance";

type WindowMode = "thisWeek" | "last7d" | "trend8w";

export function EnduranceWeeklyOverview({ athleteId, weeks = 8 }: { athleteId: string; weeks?: number }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<WindowMode>("thisWeek");
  // Fetch 90d so CTL warm-up + 28d ACWR window are both fully populated.
  const sinceIso = format(subDays(new Date(), Math.max(weeks * 7, 90)), "yyyy-MM-dd");

  const q = useQuery({
    queryKey: ["endurance-weekly", athleteId, sinceIso, weeks],
    queryFn: async () => {
      const [endRes, logRes] = await Promise.all([
        supabase
          .from("endurance_sessions")
          .select("id, date, discipline, actual_total_seconds, planned_total_seconds, overall_rpe, peak_rpe, planned_avg_rpe")
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
      const sessionRows = endRes.data ?? [];
      const sessionIds = sessionRows.map((s) => s.id);

      // Pull steps + reps for those sessions so the load model can use per-rep RPE.
      let steps: Array<{ id: string; session_id: string; is_group: boolean; actual_duration_seconds: number | null; actual_avg_rpe: number | null; target_rpe: number | null }> = [];
      let reps: Array<{ step_id: string; actual_duration_seconds: number | null; actual_avg_rpe: number | null }> = [];
      if (sessionIds.length > 0) {
        const stepsRes = await supabase
          .from("endurance_steps")
          .select("id, session_id, is_group, actual_duration_seconds, actual_avg_rpe, target_rpe")
          .in("session_id", sessionIds);
        if (stepsRes.error) throw stepsRes.error;
        steps = stepsRes.data ?? [];
        const stepIds = steps.map((s) => s.id);
        if (stepIds.length > 0) {
          const repsRes = await supabase
            .from("endurance_step_reps")
            .select("step_id, actual_duration_seconds, actual_avg_rpe")
            .in("step_id", stepIds);
          if (repsRes.error) throw repsRes.error;
          reps = repsRes.data ?? [];
        }
      }
      const stepsBySession = new Map<string, typeof steps>();
      for (const st of steps) {
        const arr = stepsBySession.get(st.session_id) ?? [];
        arr.push(st);
        stepsBySession.set(st.session_id, arr);
      }

      const end: LoadSession[] = sessionRows.map((s) => {
        const mySteps = stepsBySession.get(s.id) ?? [];
        const myStepIds = new Set(mySteps.map((x) => x.id));
        const myReps = reps.filter((r) => myStepIds.has(r.step_id));
        const segments = buildSegmentsFromSteps(mySteps, myReps);
        return {
          date: s.date,
          discipline: s.discipline,
          actual_total_seconds: s.actual_total_seconds,
          planned_total_seconds: s.planned_total_seconds,
          overall_rpe: s.overall_rpe,
          peak_rpe: s.peak_rpe,
          planned_avg_rpe: s.planned_avg_rpe,
          segments: segments.length ? segments : undefined,
        };
      });

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
        // Keep the 0.5 precision instead of rounding to int.
        overall_rpe: v.sets ? Math.round((v.rpeSum / v.sets) * 2) / 2 : null,
        peak_rpe: null,
        planned_avg_rpe: null,
      }));
      return [...end, ...strength];
    },
  });

  const data = q.data ?? [];
  const buckets = aggregateWeekly(data, weeks);
  const maxLoad = Math.max(1, ...buckets.map((b) => b.load));
  const thisWeek = buckets[buckets.length - 1];
  const prevWeek = buckets[buckets.length - 2];
  const trendPct = prevWeek && prevWeek.load > 0
    ? Math.round(((thisWeek.load - prevWeek.load) / prevWeek.load) * 100) : null;

  // ACWR, polarized 80/20 split, and Banister fitness/fatigue
  const acwrInfo = useMemo(() => acwr(data), [data]);
  const polarized = useMemo(() => polarizedDistribution(data, new Date(), 28), [data]);
  const ff = useMemo(() => fitnessFatigueSeries(data, 56), [data]);
  const ffLast = ff[ff.length - 1];

  // Window-filtered stats
  const windowStats = useMemo(() => {
    let from: Date;
    const today = new Date();
    if (mode === "thisWeek") from = startOfWeek(today, { weekStartsOn: 1 });
    else if (mode === "last7d") from = subDays(today, 6);
    else return null;
    const fromIso = format(from, "yyyy-MM-dd");
    const filtered = data.filter((s) => s.date >= fromIso);
    let totalMin = 0, load = 0, hardMin = 0, easyMin = 0;
    for (const s of filtered) {
      const min = (s.actual_total_seconds ?? s.planned_total_seconds ?? 0) / 60;
      totalMin += min;
      load += sessionLoad(s);
      const rpe = s.overall_rpe ?? s.planned_avg_rpe;
      if (rpe != null) {
        if (rpe >= 7) hardMin += min;
        else if (rpe <= 4) easyMin += min;
      }
    }
    return { totalMin, load, hardMin, easyMin };
  }, [data, mode]);

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
      <CardContent className="space-y-4">
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

        {/* ACWR — injury risk indicator */}
        <AcwrPanel info={acwrInfo} />

        {/* Polarized 80/20 distribution */}
        <PolarizedPanel split={polarized} />

        {/* Banister fitness/fatigue/form */}
        {ffLast && <FitnessFatiguePanel series={ff} last={ffLast} />}
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

function AcwrPanel({ info }: { info: ReturnType<typeof acwr> }) {
  const zoneCopy: Record<string, { label: string; tone: string; Icon: typeof ShieldCheck }> = {
    insufficient: { label: "För lite data", tone: "bg-muted text-muted-foreground", Icon: Activity },
    low: { label: "Lågt (avtränings­risk)", tone: "bg-status-peaking/20 text-status-peaking-foreground", Icon: TrendingUp },
    optimal: { label: "Optimalt", tone: "bg-status-adapting/20 text-status-adapting-foreground", Icon: ShieldCheck },
    high: { label: "Högt (varning)", tone: "bg-primary/20 text-primary", Icon: TrendingUp },
    danger: { label: "Skaderiskzon", tone: "bg-status-exhausted/30 text-status-exhausted-foreground", Icon: ShieldAlert },
  };
  const z = zoneCopy[info.zone];
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <z.Icon className="h-4 w-4" />
          <div className="text-sm font-medium">ACWR (akut ÷ kronisk last)</div>
        </div>
        <Badge className={z.tone}>
          {info.ratio != null ? info.ratio.toFixed(2) : "—"} · {z.label}
        </Badge>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        7d: <span className="font-semibold text-foreground">{info.acute}</span> · 28d-snitt × 7: <span className="font-semibold text-foreground">{info.chronic}</span>
        {" · "}sweet spot 0.8–1.3, &gt;1.5 = skadezon.
      </div>
    </div>
  );
}

function PolarizedPanel({ split }: { split: ReturnType<typeof polarizedDistribution> }) {
  if (split.totalMin <= 0) {
    return null;
  }
  // Seiler 80/20 target line at 80% easy.
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Intensitetsfördelning (senaste 28d)</div>
        <div className="text-[11px] text-muted-foreground">
          Mål: ~80% lätt / ~20% hård (Seiler polarized)
        </div>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 flex h-full" style={{ width: "100%" }}>
          <div className={cn(RPE_BANDS[0].color)} style={{ width: `${split.easyPct}%` }} />
          <div className={cn(RPE_BANDS[1].color)} style={{ width: `${split.modPct}%` }} />
          <div className={cn(RPE_BANDS[2].color)} style={{ width: `${split.hardPct}%` }} />
          <div className={cn(RPE_BANDS[3].color)} style={{ width: `${split.maxPct}%` }} />
        </div>
        {/* 80% mark */}
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: "80%" }} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
        <Mini label="Lätt" pct={split.easyPct} min={split.easyMin} />
        <Mini label="Moderat" pct={split.modPct} min={split.modMin} />
        <Mini label="Hård" pct={split.hardPct} min={split.hardMin} />
        <Mini label="Max" pct={split.maxPct} min={split.maxMin} />
      </div>
    </div>
  );
}

function Mini({ label, pct, min }: { label: string; pct: number; min: number }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{Math.round(pct)}% · {min}m</div>
    </div>
  );
}

function FitnessFatiguePanel({
  series, last,
}: {
  series: ReturnType<typeof fitnessFatigueSeries>;
  last: ReturnType<typeof fitnessFatigueSeries>[number];
}) {
  const maxVal = Math.max(1, ...series.map((p) => Math.max(p.ctl, p.atl)));
  const minTsb = Math.min(0, ...series.map((p) => p.tsb));
  const tsbRange = Math.max(20, maxVal - minTsb);
  const formTone =
    last.tsb > 5 ? "bg-status-peaking/30 text-status-peaking-foreground" :
    last.tsb < -20 ? "bg-status-exhausted/30 text-status-exhausted-foreground" :
    last.tsb < -10 ? "bg-primary/20 text-primary" :
    "bg-status-adapting/20 text-status-adapting-foreground";
  const formLabel =
    last.tsb > 5 ? "Fräsch (peakning)" :
    last.tsb < -20 ? "Mycket trött" :
    last.tsb < -10 ? "Tränings­period" :
    "Neutral";

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Form (Banister CTL / ATL / TSB)</div>
        <Badge className={formTone}>TSB {last.tsb >= 0 ? "+" : ""}{last.tsb.toFixed(1)} · {formLabel}</Badge>
      </div>
      {/* Simple inline SVG line chart */}
      <svg viewBox={`0 0 ${series.length} 60`} className="h-24 w-full" preserveAspectRatio="none">
        {/* Zero line for TSB */}
        <line x1={0} x2={series.length} y1={60 - ((-minTsb) / tsbRange) * 60} y2={60 - ((-minTsb) / tsbRange) * 60}
              stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
        {/* CTL (fitness) */}
        <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth={1.2} points={series.map((p, i) =>
          `${i},${60 - ((p.ctl - minTsb) / tsbRange) * 60}`,
        ).join(" ")} />
        {/* ATL (fatigue) */}
        <polyline fill="none" stroke="hsl(var(--destructive))" strokeWidth={1} strokeDasharray="2 2" points={series.map((p, i) =>
          `${i},${60 - ((p.atl - minTsb) / tsbRange) * 60}`,
        ).join(" ")} />
        {/* TSB area */}
        <polyline fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={0.8} points={series.map((p, i) =>
          `${i},${60 - ((p.tsb - minTsb) / tsbRange) * 60}`,
        ).join(" ")} />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="CTL · fitness (42d)" value={last.ctl.toFixed(1)} />
        <Stat label="ATL · fatigue (7d)" value={last.atl.toFixed(1)} />
        <Stat label="TSB · form" value={`${last.tsb >= 0 ? "+" : ""}${last.tsb.toFixed(1)}`} />
      </div>
    </div>
  );
}

export { sessionLoad };
