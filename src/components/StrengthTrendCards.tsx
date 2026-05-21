import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dailyE1RM } from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";

interface LogRow {
  date: string;
  exercise: string;
  reps: number;
  weight_kg: number;
  rpe: number;
}

/**
 * Per-exercise estimated 1RM personal record + 30d trend.
 *  - PB column = best e1RM ever (Epley RPE-adjusted)
 *  - Recent column = best e1RM in last 30d
 *  - Δ% with green up / red down arrow
 */
export function E1rmPrCard({ athleteId }: { athleteId: string }) {
  const logsQuery = useQuery({
    queryKey: ["e1rm-pr-logs", athleteId],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("date, exercise, reps, weight_kg, rpe")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((l) => ({
        date: l.date,
        exercise: l.exercise,
        reps: l.reps,
        weight_kg: Number(l.weight_kg),
        rpe: Number(l.rpe),
      }));
    },
  });

  const rows = useMemo(() => {
    const logs = logsQuery.data ?? [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const cutoffPrev = new Date();
    cutoffPrev.setDate(cutoffPrev.getDate() - 60);
    const cutoffPrevIso = cutoffPrev.toISOString().slice(0, 10);

    const byEx = new Map<
      string,
      { pb: number; pbDate: string; recent: number; prev: number }
    >();
    for (const l of logs) {
      const e1 = dailyE1RM(l);
      const cur = byEx.get(l.exercise) ?? {
        pb: 0,
        pbDate: "",
        recent: 0,
        prev: 0,
      };
      if (e1 > cur.pb) {
        cur.pb = e1;
        cur.pbDate = l.date;
      }
      if (l.date >= cutoffIso && e1 > cur.recent) cur.recent = e1;
      else if (l.date >= cutoffPrevIso && l.date < cutoffIso && e1 > cur.prev)
        cur.prev = e1;
      byEx.set(l.exercise, cur);
    }
    return Array.from(byEx.entries())
      .map(([exercise, v]) => ({ exercise, ...v }))
      .sort((a, b) => b.pb - a.pb);
  }, [logsQuery.data]);

  if (logsQuery.isLoading) return null;
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" /> Estimated 1RM PRs
        </CardTitle>
        <CardDescription className="text-xs">
          RPE-adjusted Epley e1RM. Δ compares best of last 30d vs prior 30d.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Exercise</th>
              <th className="px-4 py-2 text-right">PB</th>
              <th className="px-4 py-2 text-right">Last 30d</th>
              <th className="px-4 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta =
                r.prev > 0 && r.recent > 0
                  ? ((r.recent - r.prev) / r.prev) * 100
                  : 0;
              const trendCls =
                delta > 1
                  ? "text-status-adapting-foreground bg-status-adapting"
                  : delta < -1
                    ? "text-status-exhausted-foreground bg-status-exhausted"
                    : "text-muted-foreground bg-muted";
              const Icon =
                delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus;
              return (
                <tr
                  key={r.exercise}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.exercise}</div>
                    {r.pbDate && (
                      <div className="text-[10px] text-muted-foreground">
                        PB {r.pbDate}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {r.pb.toFixed(1)} kg
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {r.recent > 0 ? `${r.recent.toFixed(1)} kg` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.prev > 0 && r.recent > 0 ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          trendCls,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

interface StepActualRow {
  session_id: string;
  discipline: "run" | "bike" | "swim" | null;
  actual_duration_seconds: number | null;
  actual_distance_m: number | null;
  actual_avg_rpe: number | null;
  session_date: string;
}

/**
 * Pace-per-RPE trend across endurance sessions.
 * For each RPE bucket (rounded), compute avg pace (s/km for run, s/100m for swim).
 * Compare last 30d vs prior 30d — lower seconds = faster = green.
 */
export function RpePaceTrendCard({ athleteId }: { athleteId: string }) {
  const [disc, setDisc] = useState<"run" | "bike" | "swim">("run");

  const stepsQuery = useQuery({
    queryKey: ["rpe-pace-trend", athleteId],
    queryFn: async (): Promise<StepActualRow[]> => {
      const { data, error } = await supabase
        .from("endurance_steps")
        .select(
          "session_id, discipline, actual_duration_seconds, actual_distance_m, actual_avg_rpe, endurance_sessions!inner(date, athlete_id, discipline)",
        )
        .eq("endurance_sessions.athlete_id", athleteId)
        .not("actual_avg_rpe", "is", null)
        .not("actual_duration_seconds", "is", null)
        .not("actual_distance_m", "is", null)
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const s = (r as { endurance_sessions: { date: string; discipline: string } })
          .endurance_sessions;
        return {
          session_id: r.session_id,
          discipline: (r.discipline ?? s.discipline) as
            | "run"
            | "bike"
            | "swim"
            | null,
          actual_duration_seconds: r.actual_duration_seconds,
          actual_distance_m: r.actual_distance_m,
          actual_avg_rpe: r.actual_avg_rpe ? Number(r.actual_avg_rpe) : null,
          session_date: s.date,
        } as StepActualRow;
      });
    },
  });

  const buckets = useMemo(() => {
    const rows = (stepsQuery.data ?? []).filter((r) => r.discipline === disc);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const cutoffPrev = new Date();
    cutoffPrev.setDate(cutoffPrev.getDate() - 60);
    const cutoffPrevIso = cutoffPrev.toISOString().slice(0, 10);

    // pace in seconds per unit: run=km, bike=km, swim=100m
    const unit = disc === "swim" ? 100 : 1000;

    type Acc = { sum: number; n: number };
    const recent = new Map<number, Acc>();
    const prev = new Map<number, Acc>();
    for (const r of rows) {
      if (!r.actual_duration_seconds || !r.actual_distance_m || !r.actual_avg_rpe)
        continue;
      const pace = (r.actual_duration_seconds / r.actual_distance_m) * unit;
      const rpe = Math.round(r.actual_avg_rpe);
      const target =
        r.session_date >= cutoffIso
          ? recent
          : r.session_date >= cutoffPrevIso
            ? prev
            : null;
      if (!target) continue;
      const cur = target.get(rpe) ?? { sum: 0, n: 0 };
      cur.sum += pace;
      cur.n += 1;
      target.set(rpe, cur);
    }
    const allRpes = Array.from(
      new Set([...recent.keys(), ...prev.keys()]),
    ).sort((a, b) => a - b);
    return allRpes.map((rpe) => {
      const r = recent.get(rpe);
      const p = prev.get(rpe);
      return {
        rpe,
        recent: r ? r.sum / r.n : null,
        prev: p ? p.sum / p.n : null,
      };
    });
  }, [stepsQuery.data, disc]);

  if (stepsQuery.isLoading) return null;
  const fmtPace = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const unitLabel = disc === "swim" ? "/100m" : "/km";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Pace per RPE — trend</CardTitle>
            <CardDescription className="text-xs">
              Lower seconds = faster. Green = faster than prior 30d.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(["run", "bike", "swim"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDisc(d)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs capitalize",
                  disc === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {buckets.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No logged {disc} steps with pace + RPE yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">RPE</th>
                <th className="px-4 py-2 text-right">Last 30d</th>
                <th className="px-4 py-2 text-right">Prior 30d</th>
                <th className="px-4 py-2 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => {
                const delta =
                  b.recent != null && b.prev != null && b.prev > 0
                    ? ((b.recent - b.prev) / b.prev) * 100
                    : null;
                // Negative delta (lower pace seconds) = faster = green
                const cls =
                  delta == null
                    ? "text-muted-foreground bg-muted"
                    : delta < -1
                      ? "text-status-adapting-foreground bg-status-adapting"
                      : delta > 1
                        ? "text-status-exhausted-foreground bg-status-exhausted"
                        : "text-muted-foreground bg-muted";
                const Icon =
                  delta == null
                    ? Minus
                    : delta < -1
                      ? TrendingUp
                      : delta > 1
                        ? TrendingDown
                        : Minus;
                return (
                  <tr key={b.rpe} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-semibold">RPE {b.rpe}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {b.recent != null ? `${fmtPace(b.recent)} ${unitLabel}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      {b.prev != null ? `${fmtPace(b.prev)} ${unitLabel}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {delta != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            cls,
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
