import { isReadinessLift, lookupBaseline } from "@/lib/eakoefficient";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { latestChartStrength, personalRecords, chartMeasurements, chartStrengthSeries, dotsScore } from "@/lib/chartMetrics";
import { compLiftKey, isCompLift } from "@/lib/liftIdentity";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Dumbbell,
  Flame,
  Gauge,
  Scale,
  Trophy,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  dailyE1RM,
  rollingE1RMBySession,
  eaKoefficient,
  isBig3Lift,
  readinessFromEAk,
  readinessLabel,
  readinessClasses,
} from "@/lib/eakoefficient";
import {
  fitnessFatigueSeries,
  acwr,
  type LoadSession,
} from "@/lib/enduranceLoad";
import { cn } from "@/lib/utils";

// ---------- Types ----------
interface LogRow {
  id: string;
  date: string;
  exercise: string;
  variation: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number;
  is_warmup_reference?: boolean;
  is_technique?: boolean;
}

interface EnduranceRow {
  id: string;
  date: string;
  discipline: string;
  status: string;
  actual_total_seconds: number | null;
  actual_distance_m: number | null;
  overall_rpe: number | null;
  peak_rpe: number | null;
  planned_avg_rpe: number | null;
  planned_total_seconds: number | null;
}

interface ReadinessRow {
  date: string;
  bodyweight_kg: number | null;
  daily_form: number | null;
  stiffness: number | null;
}

interface MesocycleRow {
  id: string;
  name: string;
  start_date: string;
  total_weeks: number;
  status: string;
  goal: string | null;
}

// ---------- Helpers ----------
function fmtNum(n: number, digits = 0) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function exerciseKey(ex: string, variation?: string | null) {
  return variation ? `${ex} (${variation})` : ex;
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

function DeltaPill({
  delta,
  invert = false,
  suffix = "%",
}: {
  delta: number | null;
  invert?: boolean;
  suffix?: string;
}) {
  if (delta === null || !isFinite(delta)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const positive = delta > 0.5;
  const negative = delta < -0.5;
  const good = invert ? negative : positive;
  const bad = invert ? positive : negative;
  const Icon = positive ? ArrowUp : negative ? ArrowDown : ArrowRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
        good && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        bad && "bg-rose-500/15 text-rose-600 dark:text-rose-400",
        !good && !bad && "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}
      {fmtNum(delta, 1)}
      {suffix}
    </span>
  );
}

// ============= Dashboard =============
export const TRAINING_STATUS_THRESHOLD = 20;

export function StatsDashboard({
  athleteId,
  athleteName,
}: {
  athleteId: string;
  athleteName?: string;
}) {
  const logsQuery = useQuery({
    queryKey: ["stats-logs", athleteId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data, error } = await supabase
        .from("training_logs")
        .select(
          "id, date, exercise, variation, set_number, reps, weight_kg, rpe, is_warmup_reference, is_technique",
        )
        .eq("athlete_id", athleteId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const enduranceQuery = useQuery({
    queryKey: ["stats-endurance", athleteId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 180);
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select(
          "id, date, discipline, status, actual_total_seconds, actual_distance_m, overall_rpe, peak_rpe, planned_avg_rpe, planned_total_seconds",
        )
        .eq("athlete_id", athleteId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EnduranceRow[];
    },
  });

  const readinessQuery = useQuery({
    queryKey: ["stats-readiness", athleteId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data, error } = await supabase
        .from("readiness_surveys")
        .select("date, bodyweight_kg, daily_form, stiffness")
        .eq("athlete_id", athleteId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
  });

  const mesoQuery = useQuery({
    queryKey: ["stats-mesocycles", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mesocycles")
        .select("id, name, start_date, total_weeks, status, goal")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as MesocycleRow[];
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["stats-baselines", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", athleteId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.exercise] = Number(r.one_rm_kg);
      return map;
    },
  });

  const feedbackQuery = useQuery({ queryKey: ["stats-session-feedback", athleteId], queryFn: async () => {
    const { data, error } = await supabase.from("strength_session_feedback").select("date, session_rpe, duration_min").eq("athlete_id", athleteId); if(error) throw error; return data ?? [];
  }});
  const profileQuery = useQuery({ queryKey: ["stats-scoring-profile", athleteId], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("scoring_sex, weight_class").eq("id", athleteId).maybeSingle(); if(error) throw error; return data;
  }});
  const logs = (logsQuery.data ?? []).filter(l => !l.is_warmup_reference && !l.is_technique);
  const endurance = enduranceQuery.data ?? [];
  const readiness = readinessQuery.data ?? [];
  const mesocycles = mesoQuery.data ?? [];
  const baselines = baselinesQuery.data ?? {};

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
          Setpoint · Athlete telemetry
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {athleteName ? `Stats — ${athleteName}` : "Stats"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Training dashboard — load status, week-over-week, mesocycle and PRs.
        </p>
      </div>

      <TrainingStatusCard logs={logs} endurance={endurance} feedback={feedbackQuery.data ?? []} />
      <EAkoefficientCard logs={logs} baselines={baselines} readiness={readiness} />
      <WeekInNumbersCard logs={logs} endurance={endurance} />
      <MesoSummaryCard logs={logs} mesocycles={mesocycles} />
      <PRFeedCard logs={logs} />
      <BodyweightCard readiness={readiness} logs={logs} profile={profileQuery.data ?? null} athleteId={athleteId} />
    </div>
  );
}

// ============= EAkoefficient (strength-only) vs stiffness =============
function EAkoefficientCard({ logs, baselines }: { logs: LogRow[]; baselines: Record<string, number>; readiness: ReadinessRow[] }) {
  const latest = useMemo(() => latestChartStrength(logs, baselines).filter(p => isReadinessLift(p.exercise)), [logs, baselines]);
  return <Card><CardHeader><CardTitle>EAk per lyft</CardTitle><CardDescription>Snitt av de tre senaste mätpassen mot coachens baslinje.</CardDescription></CardHeader><CardContent className="space-y-3">
    {latest.length === 0 ? <p className="text-sm text-muted-foreground">Inga kvalificerade mätpass ännu.</p> : latest.map(p => <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0">
      <div><p className="font-medium text-sm">{exerciseKey(p.exercise, p.variation)}</p><p className="text-xs text-muted-foreground">{p.date} · {p.samples} mätpass · baslinje {p.baseline > 0 ? `${p.baseline} kg` : "saknas"}</p></div>
      <Badge className={readinessClasses(p.status)}>{p.eak == null ? "Baslinje saknas" : `${p.eak.toFixed(1)} % · ${readinessLabel(p.status)}`}</Badge>
    </div>)}
  </CardContent></Card>;
}

// ============= Training status (fatigue / adapting / peaking) =============
type StatusKey =
  | "fatigued"
  | "overreaching"
  | "building"
  | "adapting"
  | "peaking"
  | "detraining";

const STATUS_META: Record<
  StatusKey,
  { label: string; color: string; help: string }
> = {
  fatigued: {
    label: "Fatigued",
    color: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
    help: "High fatigue. Reduce training load to allow recovery.",
  },
  overreaching: {
    label: "Overreaching",
    color:
      "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
    help: "High short-term load. Check whether it matches the training plan.",
  },
  building: {
    label: "Building",
    color:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    help: "Loading phase — fitness rising, fatigue elevated.",
  },
  adapting: {
    label: "Adapting",
    color:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    help: "Stable training load with signs of recovery.",
  },
  peaking: {
    label: "Peaking",
    color:
      "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
    help: "Lower fatigue relative to recent training load.",
  },
  detraining: {
    label: "Detraining",
    color: "bg-muted text-muted-foreground border-border",
    help: "Very fresh — fitness will drift down if load stays low.",
  },
};

function classifyStatus(tsb: number, ctlSlope: number): StatusKey {
  if (tsb <= -25) return "fatigued";
  if (tsb <= -10) return ctlSlope > 0 ? "building" : "overreaching";
  if (tsb <= 5) return "adapting";
  if (tsb <= 20) return "peaking";
  return "detraining";
}

function strengthLoadSession(
  date: string,
  rows: LogRow[],
): LoadSession | null {
  if (rows.length === 0) return null;
  // Approximation: each working set ≈ 3 minutes of training time. Load uses
  // session average RPE (Foster sRPE). Keeps strength sessions on the same
  // CTL/ATL/TSB scale as endurance.
  const minutes = rows.length * 3;
  const avgRpe =
    rows.reduce((s, r) => s + Number(r.rpe), 0) / rows.length;
  return {
    date,
    discipline: "strength",
    actual_total_seconds: minutes * 60,
    planned_total_seconds: null,
    overall_rpe: avgRpe,
    peak_rpe: null,
    planned_avg_rpe: null,
  };
}

function TrainingStatusCard({ logs, endurance, feedback }: { logs: LogRow[]; endurance: EnduranceRow[]; feedback: Array<{date: string; session_rpe: number | null; duration_min: number | null}> }) {
  const { ff, ratio, totalCount } = useMemo(() => {
    // Strength-only: group sets by date.
    const byDate = new Map<string, LogRow[]>();
    for (const l of logs) {
      const arr = byDate.get(l.date) ?? [];
      arr.push(l);
      byDate.set(l.date, arr);
    }
    const strengthSessions: LoadSession[] = [];
    for (const [date, rows] of byDate) {
      const logged = feedback.find(f => f.date === date && f.session_rpe != null && f.duration_min != null);
      const s = logged ? { date, discipline: "strength", actual_total_seconds: Number(logged.duration_min) * 60, overall_rpe: Number(logged.session_rpe), planned_total_seconds: null, peak_rpe: null, planned_avg_rpe: null } : strengthLoadSession(date, rows);
      if (s) strengthSessions.push(s);
    }
    for (const f of feedback) {
      if (!byDate.has(f.date) && f.session_rpe != null && f.duration_min != null) strengthSessions.push({ date: f.date, discipline: "strength", actual_total_seconds: Number(f.duration_min)*60, overall_rpe: Number(f.session_rpe), peak_rpe: null, planned_total_seconds: null, planned_avg_rpe: null });
    }
    const combined: LoadSession[] = [...strengthSessions, ...endurance.filter(s => s.status === "completed" && Number(s.actual_total_seconds) > 0 && s.overall_rpe != null).map(s => ({ ...s, peak_rpe: null, planned_avg_rpe: null, planned_total_seconds: null }))];
    const ff = fitnessFatigueSeries(combined, 60);
    const a = acwr(combined);
    return { ff, ratio: a, totalCount: combined.length };
  }, [logs, endurance, feedback]);

  if (totalCount < TRAINING_STATUS_THRESHOLD) {
    const pct = (totalCount / TRAINING_STATUS_THRESHOLD) * 100;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Belastning
          </CardTitle>
          <CardDescription>
            We need at least {TRAINING_STATUS_THRESHOLD} logged sessions
            med passbelastning från styrka och kondition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">{totalCount}</span>
            <span className="text-sm text-muted-foreground">
              of {TRAINING_STATUS_THRESHOLD} sessions
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Keep logging — {TRAINING_STATUS_THRESHOLD - totalCount} more to
            unlock load status, CTL/ATL/TSB trend and ACWR.
          </p>
        </CardContent>
      </Card>
    );
  }

  const last = ff[ff.length - 1];
  const ctlNow = last?.ctl ?? 0;
  const ctl7Ago = ff[ff.length - 8]?.ctl ?? ctlNow;
  const ctlSlope = ctlNow - ctl7Ago;
  const status = classifyStatus(last?.tsb ?? 0, ctlSlope);
  const meta = STATUS_META[status];

  const chartData = ff.slice(-42).map((p) => ({
    date: p.date,
    label: format(parseISO(p.date), "MMM d"),
    Fitness: p.ctl,
    Fatigue: p.atl,
    Form: p.tsb,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          Belastning
        </CardTitle>
        <CardDescription>
          Belastning: sRPE × minuter från styrka och kondition. CTL (42 dagar), ATL (7 dagar), TSB = CTL − ATL. Saknad styrkepasstid uppskattas till tre minuter per arbetsset; saknad konditionstid eller pass-RPE räknas inte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
              meta.color,
            )}
          >
            <Flame className="h-4 w-4" />
            {meta.label}
          </div>
          <p className="text-sm text-muted-foreground">{meta.help}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Fitness (CTL)"
            value={fmtNum(ctlNow, 0)}
            delta={ctl7Ago > 0 ? pctDelta(ctlNow, ctl7Ago) : null}
          />
          <Metric
            label="Fatigue (ATL)"
            value={fmtNum(last?.atl ?? 0, 0)}
            delta={null}
          />
          <Metric
            label="Form (TSB)"
            value={fmtNum(last?.tsb ?? 0, 0)}
            delta={null}
          />
          <Metric
            label="ACWR (7d/28d)"
            value={ratio.ratio != null ? fmtNum(ratio.ratio, 2) : "—"}
            delta={null}
          />
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="label"
                fontSize={11}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                minTickGap={20}
              />
              <YAxis
                fontSize={11}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 4" />
              <Line
                type="monotone"
                dataKey="Fitness"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Fatigue"
                stroke="hsl(0 80% 60%)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Form"
                stroke="hsl(160 70% 45%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <StatusLegend k="fatigued" />
          <StatusLegend k="overreaching" />
          <StatusLegend k="building" />
          <StatusLegend k="adapting" />
          <StatusLegend k="peaking" />
          <StatusLegend k="detraining" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusLegend({ k }: { k: StatusKey }) {
  const m = STATUS_META[k];
  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
          m.color.split(" ")[0],
        )}
      />
      <div>
        <div className="font-medium text-foreground">{m.label}</div>
        <div>{m.help}</div>
      </div>
    </div>
  );
}

// ============= Week in numbers =============
function WeekInNumbersCard({
  logs,
  endurance,
}: {
  logs: LogRow[];
  endurance: EnduranceRow[];
}) {
  const stats = useMemo(() => {
    const now = new Date();
    const thisStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    function strengthIn(start: Date, end: Date) {
      const rows = logs.filter((l) => {
        const d = parseISO(l.date);
        return d >= start && d <= end;
      });
      const volume = rows.reduce(
        (s, r) => s + Number(r.weight_kg) * r.reps,
        0,
      );
      const sets = rows.length;
      const rpeAvg =
        sets > 0 ? rows.reduce((s, r) => s + Number(r.rpe), 0) / sets : 0;
      const days = new Set(rows.map((r) => r.date)).size;
      return { volume, sets, rpeAvg, days };
    }
    function enduranceIn(start: Date, end: Date) {
      const rows = endurance.filter((e) => {
        if (e.status !== "completed") return false;
        const d = parseISO(e.date);
        return d >= start && d <= end;
      });
      const km = rows.reduce(
        (s, r) => s + (r.actual_distance_m ?? 0) / 1000,
        0,
      );
      const seconds = rows.reduce(
        (s, r) => s + (r.actual_total_seconds ?? 0),
        0,
      );
      const rpeRows = rows.filter((r) => r.overall_rpe != null);
      const rpeAvg =
        rpeRows.length > 0
          ? rpeRows.reduce((s, r) => s + Number(r.overall_rpe), 0) /
            rpeRows.length
          : 0;
      return { km, hours: seconds / 3600, sessions: rows.length, rpeAvg };
    }

    return {
      thisStrength: strengthIn(thisStart, thisEnd),
      lastStrength: strengthIn(lastStart, lastEnd),
      thisEndurance: enduranceIn(thisStart, thisEnd),
      lastEndurance: enduranceIn(lastStart, lastEnd),
      thisStart,
      thisEnd,
    };
  }, [logs, endurance]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          The week in numbers
        </CardTitle>
        <CardDescription>
          {format(stats.thisStart, "MMM d")} – {format(stats.thisEnd, "MMM d")} ·
          compared to last week
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Strength volume"
          value={`${fmtNum(stats.thisStrength.volume)} kg`}
          delta={pctDelta(stats.thisStrength.volume, stats.lastStrength.volume)}
        />
        <Metric
          label="Sets"
          value={fmtNum(stats.thisStrength.sets)}
          delta={pctDelta(stats.thisStrength.sets, stats.lastStrength.sets)}
        />
        <Metric
          label="Strength days"
          value={fmtNum(stats.thisStrength.days)}
          delta={pctDelta(stats.thisStrength.days, stats.lastStrength.days)}
        />
        <Metric
          label="Avg RPE (lifts)"
          value={
            stats.thisStrength.rpeAvg > 0
              ? fmtNum(stats.thisStrength.rpeAvg, 1)
              : "—"
          }
          delta={pctDelta(stats.thisStrength.rpeAvg, stats.lastStrength.rpeAvg)}
        />
        <Metric
          label="Endurance km"
          value={fmtNum(stats.thisEndurance.km, 1)}
          delta={pctDelta(stats.thisEndurance.km, stats.lastEndurance.km)}
        />
        <Metric
          label="Endurance hours"
          value={fmtNum(stats.thisEndurance.hours, 1)}
          delta={pctDelta(stats.thisEndurance.hours, stats.lastEndurance.hours)}
        />
        <Metric
          label="Endurance sessions"
          value={fmtNum(stats.thisEndurance.sessions)}
          delta={pctDelta(
            stats.thisEndurance.sessions,
            stats.lastEndurance.sessions,
          )}
        />
        <Metric
          label="Avg RPE (endurance)"
          value={
            stats.thisEndurance.rpeAvg > 0
              ? fmtNum(stats.thisEndurance.rpeAvg, 1)
              : "—"
          }
          delta={pctDelta(
            stats.thisEndurance.rpeAvg,
            stats.lastEndurance.rpeAvg,
          )}
        />
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1">
        <DeltaPill delta={delta} />
      </div>
    </div>
  );
}

// ============= Mesocycle summary =============
function MesoSummaryCard({
  logs,
  mesocycles,
}: {
  logs: LogRow[];
  mesocycles: MesocycleRow[];
}) {
  const meso = mesocycles[0];

  const analysis = useMemo(() => {
    if (!meso) return null;
    const start = parseISO(meso.start_date);
    const end = new Date(start);
    end.setDate(end.getDate() + meso.total_weeks * 7 - 1);

    const inMeso = logs.filter((l) => {
      const d = parseISO(l.date);
      return d >= start && d <= end;
    });

    const firstWeekEnd = new Date(start);
    firstWeekEnd.setDate(firstWeekEnd.getDate() + 6);

    const today = new Date();
    const cap = today < end ? today : end;
    const recentStart = new Date(cap);
    recentStart.setDate(recentStart.getDate() - 6);

    const byExFirst = new Map<string, number>();
    const byExRecent = new Map<string, number>();

    for (const l of chartMeasurements(inMeso)) {
      const key = exerciseKey(l.exercise, l.variation);
      const e1rm = dailyE1RM({
        weight_kg: Number(l.weight_kg),
        reps: l.reps,
        rpe: Number(l.rpe),
      });
      const d = parseISO(l.date);
      if (d <= firstWeekEnd) {
        byExFirst.set(key, Math.max(byExFirst.get(key) ?? 0, e1rm));
      }
      if (d >= recentStart && d <= cap) {
        byExRecent.set(key, Math.max(byExRecent.get(key) ?? 0, e1rm));
      }
    }

    const rows = Array.from(byExFirst.entries())
      .map(([ex, first]) => {
        const recent = byExRecent.get(ex);
        return {
          exercise: ex,
          first,
          recent: recent ?? null,
          delta: recent != null ? pctDelta(recent, first) : null,
        };
      })
      .filter((r) => r.recent != null)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));

    const totalVolume = inMeso.reduce(
      (s, l) => s + Number(l.weight_kg) * l.reps,
      0,
    );
    const totalSets = inMeso.length;
    const weeksElapsed = Math.max(
      1,
      Math.ceil((differenceInCalendarDays(cap, start) + 1) / 7),
    );

    return {
      meso,
      rows,
      totalVolume,
      totalSets,
      weeksElapsed,
      capDate: cap,
      endDate: end,
    };
  }, [meso, logs]);

  if (!meso) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            Mesocycle summary
          </CardTitle>
          <CardDescription>
            No mesocycles yet. Your coach will create one for you.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const a = analysis!;
  const ups = a.rows.filter((r) => (r.delta ?? 0) > 0.5);
  const downs = a.rows.filter((r) => (r.delta ?? 0) < -0.5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          Mesocycle: {meso.name}
        </CardTitle>
        <CardDescription>
          {format(parseISO(meso.start_date), "MMM d, yyyy")} →{" "}
          {format(a.endDate, "MMM d, yyyy")} · week {a.weeksElapsed} of{" "}
          {meso.total_weeks}
          {meso.status === "completed" && (
            <Badge variant="secondary" className="ml-2">Completed</Badge>
          )}
          {meso.status === "active" && <Badge className="ml-2">Active</Badge>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric
            label="Total volume"
            value={`${fmtNum(a.totalVolume)} kg`}
            delta={null}
          />
          <Metric label="Total sets" value={fmtNum(a.totalSets)} delta={null} />
          <Metric
            label="Exercises tracked"
            value={fmtNum(a.rows.length)}
            delta={null}
          />
        </div>

        {a.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough data yet — log at least one set in week 1 and a recent
            week to see comparisons.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Moving up ({ups.length})
              </div>
              {ups.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet.</p>
              ) : (
                <ExerciseDeltaList rows={ups} />
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
                Moving down ({downs.length})
              </div>
              {downs.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                <ExerciseDeltaList rows={downs} />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExerciseDeltaList({
  rows,
}: {
  rows: {
    exercise: string;
    first: number;
    recent: number | null;
    delta: number | null;
  }[];
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((r) => (
        <li
          key={r.exercise}
          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
        >
          <span className="truncate font-medium">{r.exercise}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              e1RM {fmtNum(r.first, 0)} → {fmtNum(r.recent ?? 0, 0)} kg
            </span>
            <DeltaPill delta={r.delta} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// ============= PR Feed =============
function PRFeedCard({ logs }: { logs: LogRow[] }) {
  const prs = useMemo(() => personalRecords(logs).slice(0, 12).map(p => ({ ...p, date: p.log.date, exercise: exerciseKey(p.log.exercise, p.log.variation), e1rm: p.value, prev: p.previous })), [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          PR feed
        </CardTitle>
        <CardDescription>
          Faktiska rep-PR och uppskattade max från mätsetet, per övning och variant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {prs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Log some sets — your first PRs will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {prs.map((p, i) => (
              <li
                key={`${p.exercise}-${p.date}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.exercise}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(parseISO(p.date), "MMM d, yyyy")} ·{" "}
                    {fmtNum(Number(p.log.weight_kg), 1)}kg × {p.log.reps} @ RPE{" "}
                    {fmtNum(Number(p.log.rpe), 1)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {fmtNum(p.e1rm, 1)} kg
                    <Badge variant="secondary" className="ml-2">{p.kind === "actual" ? `${p.log.reps} reps · Faktiskt PR` : "Uppskattat"}</Badge>
                  </div>
                  {p.prev > 0 && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400">
                      +{fmtNum(p.e1rm - p.prev, 1)} kg
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BodyweightCard({ readiness, logs, profile, athleteId }: { readiness: ReadinessRow[]; logs: LogRow[]; athleteId: string; profile: { scoring_sex: string | null; weight_class: string | null } | null }) {
  const qc = useQueryClient();
  const [sex, setSex] = useState("");
  const { user } = useAuth();
  const saveSex = useMutation({ mutationFn: async () => {
    if (user?.id !== athleteId || !["male", "female"].includes(sex)) throw new Error("Välj poängklass för ditt eget konto.");
    const { error } = await supabase.from("profiles").update({ scoring_sex: sex }).eq("id", athleteId);
    if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["stats-scoring-profile", athleteId] }); toast.success("Poängklass sparad"); }, onError: (e: Error) => toast.error(e.message) });
  const data = useMemo(() => {
    const points = chartStrengthSeries(logs.filter(l => isCompLift(l.exercise, l.variation)), {});
    const weights = readiness.filter(r => r.bodyweight_kg != null && Number(r.bodyweight_kg) > 0).sort((a,b) => a.date.localeCompare(b.date));
    const dates = [...new Set([...points.map(p => p.date), ...weights.map(w => w.date)])].sort();
    return dates.map(date => {
      const bw = weights.filter(w => w.date <= date).at(-1);
      const lifts = ["squat", "bench", "deadlift"].map(lift => points.filter(p => p.date <= date && compLiftKey(p.exercise) === lift).at(-1));
      const valid = lifts.every(p => p && differenceInCalendarDays(parseISO(date), parseISO(p.date)) <= 28);
      const total = valid ? lifts.reduce((sum,p) => sum + (p?.rolling ?? 0),0) : 0;
      const freshWeight = bw && differenceInCalendarDays(parseISO(date),parseISO(bw.date)) <= 28;
      return { date, bodyweight: weights.find(w => w.date === date)?.bodyweight_kg ?? null, dots: freshWeight && bw ? dotsScore(total, Number(bw.bodyweight_kg), profile?.scoring_sex) : null };
    });
  }, [logs, readiness, profile]);
  const weightClass = profile?.weight_class?.includes("+") ? null : Number(profile?.weight_class?.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0]?.replace(",",".")) || null;
  return <Card><CardHeader><CardTitle>Kroppsvikt och DOTS</CardTitle><CardDescription>Uppskattad styrkelyftstotal från tre mätpass per tävlingslyft. Alla lyft och kroppsvikten måste vara högst 28 dagar gamla.</CardDescription></CardHeader><CardContent className="space-y-4">
    {!profile?.scoring_sex && <div className="space-y-2"><p className="text-sm text-muted-foreground">Poängklass saknas; inga DOTS-poäng räknas utan den.</p>{user?.id === athleteId && <div className="flex gap-2"><Select value={sex} onValueChange={setSex}><SelectTrigger className="w-44" aria-label="Poängklass"><SelectValue placeholder="Poängklass" /></SelectTrigger><SelectContent><SelectItem value="male">Herrar</SelectItem><SelectItem value="female">Damer</SelectItem></SelectContent></Select><Button disabled={!sex || saveSex.isPending} onClick={() => saveSex.mutate()}>Spara</Button></div>}</div>}
    <h3 className="text-sm font-medium">DOTS · uppskattad total</h3><div className="h-44"><ResponsiveContainer><LineChart data={data}><CartesianGrid stroke="var(--border)"/><XAxis dataKey="date" fontSize={10}/><YAxis domain={["auto","auto"]} fontSize={10}/><Tooltip/><Line dataKey="dots" name="DOTS (uppskattat)" stroke="var(--chart-1)" dot={{r:3}} connectNulls={false}/></LineChart></ResponsiveContainer></div>
    <h3 className="text-sm font-medium">Kroppsvikt {weightClass ? `· viktklass ${weightClass} kg` : "· viktklass saknas"}</h3><div className="h-40"><ResponsiveContainer><LineChart data={data.filter(p => p.bodyweight != null)}><CartesianGrid stroke="var(--border)"/><XAxis dataKey="date" fontSize={10}/><YAxis domain={["auto","auto"]} fontSize={10}/><Tooltip/>{weightClass && <ReferenceLine y={weightClass} label={`${weightClass} kg`} stroke="var(--chart-3)"/>}<Line dataKey="bodyweight" name="Kroppsvikt (kg)" stroke="var(--chart-2)" dot={{r:3}}/></LineChart></ResponsiveContainer></div>
  </CardContent></Card>;
}
