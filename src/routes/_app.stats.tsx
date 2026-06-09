import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Footprints,
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
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dailyE1RM } from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/stats")({
  head: () => ({
    meta: [
      { title: "Stats — EA Training System" },
      {
        name: "description",
        content:
          "Your training dashboard: week-over-week numbers, mesocycle summary, PRs and bodyweight vs strength.",
      },
    ],
  }),
  component: StatsPage,
});

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
}

interface EnduranceRow {
  id: string;
  date: string;
  discipline: string;
  status: string;
  actual_total_seconds: number | null;
  actual_distance_m: number | null;
  overall_rpe: number | null;
}

interface ReadinessRow {
  date: string;
  bodyweight_kg: number | null;
  daily_form: number | null;
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

// ============= Page =============
function StatsPage() {
  const { user } = useAuth();
  const userId = user!.id;

  // Logs (last ~365 days). Used by Week-in-numbers, Meso summary, PR feed, BW chart.
  const logsQuery = useQuery({
    queryKey: ["stats-logs", userId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data, error } = await supabase
        .from("training_logs")
        .select(
          "id, date, exercise, variation, set_number, reps, weight_kg, rpe",
        )
        .eq("athlete_id", userId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  // Endurance sessions (last 60 days for week-in-numbers)
  const enduranceQuery = useQuery({
    queryKey: ["stats-endurance", userId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 60);
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select(
          "id, date, discipline, status, actual_total_seconds, actual_distance_m, overall_rpe",
        )
        .eq("athlete_id", userId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EnduranceRow[];
    },
  });

  // Readiness (for bodyweight + form)
  const readinessQuery = useQuery({
    queryKey: ["stats-readiness", userId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data, error } = await supabase
        .from("readiness_surveys")
        .select("date, bodyweight_kg, daily_form")
        .eq("athlete_id", userId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReadinessRow[];
    },
  });

  // Mesocycles for summary
  const mesoQuery = useQuery({
    queryKey: ["stats-mesocycles", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mesocycles")
        .select("id, name, start_date, total_weeks, status, goal")
        .eq("athlete_id", userId)
        .order("start_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as MesocycleRow[];
    },
  });

  const logs = logsQuery.data ?? [];
  const endurance = enduranceQuery.data ?? [];
  const readiness = readinessQuery.data ?? [];
  const mesocycles = mesoQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="text-sm text-muted-foreground">
          Your training dashboard — week-over-week, mesocycles, PRs and body
          weight.
        </p>
      </div>

      <WeekInNumbersCard logs={logs} endurance={endurance} />
      <MesoSummaryCard logs={logs} mesocycles={mesocycles} />
      <PRFeedCard logs={logs} />
      <BodyweightCard readiness={readiness} logs={logs} />
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
  const meso = mesocycles[0]; // most recent

  const analysis = useMemo(() => {
    if (!meso) return null;
    const start = parseISO(meso.start_date);
    const end = new Date(start);
    end.setDate(end.getDate() + meso.total_weeks * 7 - 1);

    const inMeso = logs.filter((l) => {
      const d = parseISO(l.date);
      return d >= start && d <= end;
    });

    // Baseline = first week of meso. Recent = last 7 days within meso (or last
    // week before end).
    const firstWeekEnd = new Date(start);
    firstWeekEnd.setDate(firstWeekEnd.getDate() + 6);

    // "now" capped at meso end
    const today = new Date();
    const cap = today < end ? today : end;
    const recentStart = new Date(cap);
    recentStart.setDate(recentStart.getDate() - 6);

    const byExFirst = new Map<string, number>(); // ex -> max e1RM week 1
    const byExRecent = new Map<string, number>(); // ex -> max e1RM last 7 days

    for (const l of inMeso) {
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
          {format(parseISO(meso.start_date), "MMM d, yyyy")} → {" "}
          {format(a.endDate, "MMM d, yyyy")} · week {a.weeksElapsed} of {" "}
          {meso.total_weeks}
          {meso.status === "completed" && (
            <Badge variant="secondary" className="ml-2">Completed</Badge>
          )}
          {meso.status === "active" && (
            <Badge className="ml-2">Active</Badge>
          )}
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
  const prs = useMemo(() => {
    // Track running max e1RM per exercise; emit a PR whenever a new max is set.
    const best = new Map<string, number>();
    const events: {
      date: string;
      exercise: string;
      e1rm: number;
      prev: number;
      log: LogRow;
    }[] = [];
    // logs already sorted ascending by date
    for (const l of logs) {
      const key = exerciseKey(l.exercise, l.variation);
      const e1rm = dailyE1RM({
        weight_kg: Number(l.weight_kg),
        reps: l.reps,
        rpe: Number(l.rpe),
      });
      const prev = best.get(key) ?? 0;
      // Need at least 2.5kg above previous best to count as PR (avoids noise);
      // first ever set per exercise is also a PR.
      if (prev === 0 || e1rm >= prev + 2.5) {
        events.push({ date: l.date, exercise: key, e1rm, prev, log: l });
        best.set(key, e1rm);
      } else if (e1rm > prev) {
        // silently update best without emitting
        best.set(key, e1rm);
      }
    }
    // newest first
    return events.reverse().slice(0, 12);
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          PR feed
        </CardTitle>
        <CardDescription>
          Automatic personal bests on estimated 1RM (per exercise & variation).
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

// ============= Bodyweight + performance =============
function BodyweightCard({
  readiness,
  logs,
}: {
  readiness: ReadinessRow[];
  logs: LogRow[];
}) {
  const data = useMemo(() => {
    // Group bodyweight by week (median of readings).
    const weekBW = new Map<string, number[]>();
    for (const r of readiness) {
      if (r.bodyweight_kg == null) continue;
      const d = parseISO(r.date);
      const wk = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const arr = weekBW.get(wk) ?? [];
      arr.push(Number(r.bodyweight_kg));
      weekBW.set(wk, arr);
    }

    // Strength index per week: average e1RM of top-set across the most-used
    // exercises. We use the top 4 exercises by set count over the loaded
    // period to keep the index stable.
    const counts = new Map<string, number>();
    for (const l of logs) {
      counts.set(l.exercise, (counts.get(l.exercise) ?? 0) + 1);
    }
    const topEx = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([ex]) => ex);
    const topSet = new Map<string, Map<string, number>>(); // week -> ex -> max e1RM
    for (const l of logs) {
      if (!topEx.includes(l.exercise)) continue;
      const d = parseISO(l.date);
      const wk = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const e1rm = dailyE1RM({
        weight_kg: Number(l.weight_kg),
        reps: l.reps,
        rpe: Number(l.rpe),
      });
      const inner = topSet.get(wk) ?? new Map<string, number>();
      inner.set(l.exercise, Math.max(inner.get(l.exercise) ?? 0, e1rm));
      topSet.set(wk, inner);
    }

    const allWeeks = new Set<string>([
      ...Array.from(weekBW.keys()),
      ...Array.from(topSet.keys()),
    ]);
    const weeks = Array.from(allWeeks).sort();

    return weeks.map((wk) => {
      const bwArr = weekBW.get(wk) ?? [];
      const bw =
        bwArr.length > 0
          ? bwArr.reduce((s, n) => s + n, 0) / bwArr.length
          : null;
      const inner = topSet.get(wk);
      let strength: number | null = null;
      if (inner && inner.size > 0) {
        const vals = Array.from(inner.values());
        strength = vals.reduce((s, n) => s + n, 0) / vals.length;
      }
      return {
        week: wk,
        label: format(parseISO(wk), "MMM d"),
        bodyweight: bw,
        strength,
      };
    });
  }, [readiness, logs]);

  const hasBW = data.some((d) => d.bodyweight != null);
  const hasStrength = data.some((d) => d.strength != null);

  // Headline numbers
  const bwSeries = data
    .filter((d) => d.bodyweight != null)
    .map((d) => d.bodyweight as number);
  const strSeries = data
    .filter((d) => d.strength != null)
    .map((d) => d.strength as number);
  const bwDelta =
    bwSeries.length >= 2
      ? pctDelta(bwSeries[bwSeries.length - 1], bwSeries[0])
      : null;
  const strDelta =
    strSeries.length >= 2
      ? pctDelta(strSeries[strSeries.length - 1], strSeries[0])
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          Bodyweight vs strength
        </CardTitle>
        <CardDescription>
          Weekly bodyweight (from your daily readiness check-ins) against your
          strength index (avg top-set e1RM across your most-trained lifts).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Bodyweight change"
            value={
              bwSeries.length >= 2
                ? `${fmtNum(bwSeries[bwSeries.length - 1] - bwSeries[0], 1)} kg`
                : "—"
            }
            delta={bwDelta}
          />
          <Metric
            label="Strength change"
            value={
              strSeries.length >= 2
                ? `${fmtNum(strSeries[strSeries.length - 1] - strSeries[0], 1)} kg`
                : "—"
            }
            delta={strDelta}
          />
        </div>

        {!hasBW && !hasStrength ? (
          <p className="text-sm text-muted-foreground">
            Log your bodyweight in the daily readiness check-in and a few
            strength sets — the chart will start filling in.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
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
                />
                <YAxis
                  yAxisId="bw"
                  orientation="left"
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  width={40}
                  domain={["auto", "auto"]}
                />
                <YAxis
                  yAxisId="str"
                  orientation="right"
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  width={40}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number | null, name: string) =>
                    value == null
                      ? ["—", name]
                      : [`${fmtNum(value, 1)} kg`, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="bw"
                  type="monotone"
                  dataKey="bodyweight"
                  name="Bodyweight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
                <Line
                  yAxisId="str"
                  type="monotone"
                  dataKey="strength"
                  name="Strength index"
                  stroke="hsl(var(--chart-2, 200 90% 55%))"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
