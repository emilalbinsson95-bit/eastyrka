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
  eaKoefficient,
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
          "id, date, exercise, variation, set_number, reps, weight_kg, rpe",
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

  const logs = logsQuery.data ?? [];
  const endurance = enduranceQuery.data ?? [];
  const readiness = readinessQuery.data ?? [];
  const mesocycles = mesoQuery.data ?? [];
  const baselines = baselinesQuery.data ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {athleteName ? `Stats — ${athleteName}` : "Stats"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Training dashboard — load status, week-over-week, mesocycle and PRs.
        </p>
      </div>

      <TrainingStatusCard logs={logs} endurance={endurance} />
      <EAkoefficientCard logs={logs} baselines={baselines} readiness={readiness} />
      <WeekInNumbersCard logs={logs} endurance={endurance} />
      <MesoSummaryCard logs={logs} mesocycles={mesocycles} />
      <PRFeedCard logs={logs} />
      <BodyweightCard readiness={readiness} logs={logs} />
    </div>
  );
}

// ============= EAkoefficient (strength-only) vs stiffness =============
function EAkoefficientCard({
  logs,
  baselines,
  readiness,
}: {
  logs: LogRow[];
  baselines: Record<string, number>;
  readiness: ReadinessRow[];
}) {
  const data = useMemo(() => {
    // Per-day EAk: average top-set eak across exercises that have a baseline.
    const byDate = new Map<string, Map<string, number>>(); // date -> exercise -> max eak
    for (const l of logs) {
      const base = baselines[l.exercise];
      if (!base || base <= 0) continue;
      const eak = eaKoefficient(
        { weight_kg: Number(l.weight_kg), reps: l.reps, rpe: Number(l.rpe) },
        base,
      );
      if (!isFinite(eak) || eak <= 0) continue;
      const inner = byDate.get(l.date) ?? new Map<string, number>();
      inner.set(l.exercise, Math.max(inner.get(l.exercise) ?? 0, eak));
      byDate.set(l.date, inner);
    }
    const stiffByDate = new Map<string, number>();
    for (const r of readiness) {
      if (r.stiffness != null) stiffByDate.set(r.date, Number(r.stiffness));
    }

    const dates = Array.from(
      new Set<string>([...byDate.keys(), ...stiffByDate.keys()]),
    ).sort();

    const series = dates.map((d) => {
      const inner = byDate.get(d);
      let eak: number | null = null;
      if (inner && inner.size > 0) {
        const vals = Array.from(inner.values());
        eak = vals.reduce((s, n) => s + n, 0) / vals.length;
      }
      return {
        date: d,
        label: format(parseISO(d), "MMM d"),
        EAk: eak,
        Stiffness: stiffByDate.get(d) ?? null,
      };
    });

    // Last 84 days window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 84);
    const recent = series.filter((p) => parseISO(p.date) >= cutoff);

    // Latest EAk and stiffness
    const lastEak = [...recent].reverse().find((p) => p.EAk != null)?.EAk ?? null;
    const lastStiff =
      [...recent].reverse().find((p) => p.Stiffness != null)?.Stiffness ?? null;

    // Pearson correlation between EAk and stiffness on days where both exist
    const paired = recent.filter(
      (p) => p.EAk != null && p.Stiffness != null,
    ) as { EAk: number; Stiffness: number }[];
    let corr: number | null = null;
    if (paired.length >= 5) {
      const n = paired.length;
      const mx = paired.reduce((s, p) => s + p.EAk, 0) / n;
      const my = paired.reduce((s, p) => s + p.Stiffness, 0) / n;
      let num = 0,
        dx = 0,
        dy = 0;
      for (const p of paired) {
        num += (p.EAk - mx) * (p.Stiffness - my);
        dx += (p.EAk - mx) ** 2;
        dy += (p.Stiffness - my) ** 2;
      }
      const denom = Math.sqrt(dx * dy);
      corr = denom > 0 ? num / denom : null;
    }

    return { recent, lastEak, lastStiff, corr, pairedCount: paired.length };
  }, [logs, baselines, readiness]);

  const status = data.lastEak != null ? readinessFromEAk(data.lastEak) : "unknown";
  const hasAny =
    data.recent.some((p) => p.EAk != null) ||
    data.recent.some((p) => p.Stiffness != null);

  const corrLabel =
    data.corr == null
      ? null
      : data.corr <= -0.4
        ? "Strong inverse — more stiffness, weaker output"
        : data.corr <= -0.15
          ? "Mild inverse — stiffness slightly drags performance"
          : data.corr >= 0.4
            ? "Positive — stiffness coincides with stronger output (unusual)"
            : data.corr >= 0.15
              ? "Weak positive link"
              : "No clear link between stiffness and output";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          EAkoefficient (strength)
        </CardTitle>
        <CardDescription>
          Today's lift performance vs your 1RM baseline — strength only, no
          running. Plotted against self-reported stiffness from the daily
          readiness survey.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAny ? (
          <p className="text-sm text-muted-foreground">
            Log some strength sets (with a 1RM baseline set) and a few daily
            readiness surveys to see your EAkoefficient trend.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
                  readinessClasses(status),
                )}
              >
                {data.lastEak != null
                  ? `${fmtNum(data.lastEak, 0)}% · ${readinessLabel(status)}`
                  : "No recent lifts"}
              </span>
              <span className="text-sm text-muted-foreground">
                Latest stiffness:{" "}
                <span className="font-medium text-foreground">
                  {data.lastStiff != null ? `${data.lastStiff}/10` : "—"}
                </span>
              </span>
              {data.corr != null && (
                <span className="text-sm text-muted-foreground">
                  Correlation (n={data.pairedCount}):{" "}
                  <span className="font-medium text-foreground">
                    r = {fmtNum(data.corr, 2)}
                  </span>
                </span>
              )}
            </div>
            {corrLabel && (
              <p className="text-xs text-muted-foreground">{corrLabel}</p>
            )}

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.recent}
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
                    yAxisId="eak"
                    fontSize={11}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    width={40}
                    domain={[80, 110]}
                  />
                  <YAxis
                    yAxisId="stiff"
                    orientation="right"
                    fontSize={11}
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    width={28}
                    domain={[0, 10]}
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
                  <ReferenceLine
                    yAxisId="eak"
                    y={100}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="2 4"
                  />
                  <Line
                    yAxisId="eak"
                    type="monotone"
                    dataKey="EAk"
                    name="EAk %"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="stiff"
                    type="monotone"
                    dataKey="Stiffness"
                    name="Stiffness /10"
                    stroke="hsl(0 80% 60%)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
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
    help: "Deep fatigue — back off and recover before pushing again.",
  },
  overreaching: {
    label: "Overreaching",
    color:
      "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
    help: "Heavy short-term load. Productive if planned, risky if not.",
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
    help: "Productive sweet spot — sustained load with good recovery.",
  },
  peaking: {
    label: "Peaking",
    color:
      "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
    help: "Fresh and fit — competition-ready window.",
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

function TrainingStatusCard({
  logs,
}: {
  logs: LogRow[];
}) {
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
      const s = strengthLoadSession(date, rows);
      if (s) strengthSessions.push(s);
    }
    const ff = fitnessFatigueSeries(strengthSessions, 60);
    const a = acwr(strengthSessions);
    return { ff, ratio: a, totalCount: strengthSessions.length };
  }, [logs]);

  if (totalCount < TRAINING_STATUS_THRESHOLD) {
    const pct = (totalCount / TRAINING_STATUS_THRESHOLD) * 100;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Training status
          </CardTitle>
          <CardDescription>
            We need at least {TRAINING_STATUS_THRESHOLD} logged sessions
            (strength days + completed endurance) to estimate fatigue, adapting
            and peaking reliably.
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
          Training status
        </CardTitle>
        <CardDescription>
          Banister fitness–fatigue model. Fitness (CTL, 42d), Fatigue (ATL, 7d),
          Form (TSB = CTL − ATL).
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
  const prs = useMemo(() => {
    const best = new Map<string, number>();
    const events: {
      date: string;
      exercise: string;
      e1rm: number;
      prev: number;
      log: LogRow;
    }[] = [];
    for (const l of logs) {
      const key = exerciseKey(l.exercise, l.variation);
      const e1rm = dailyE1RM({
        weight_kg: Number(l.weight_kg),
        reps: l.reps,
        rpe: Number(l.rpe),
      });
      const prev = best.get(key) ?? 0;
      if (prev === 0 || e1rm >= prev + 2.5) {
        events.push({ date: l.date, exercise: key, e1rm, prev, log: l });
        best.set(key, e1rm);
      } else if (e1rm > prev) {
        best.set(key, e1rm);
      }
    }
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
    const weekBW = new Map<string, number[]>();
    for (const r of readiness) {
      if (r.bodyweight_kg == null) continue;
      const d = parseISO(r.date);
      const wk = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const arr = weekBW.get(wk) ?? [];
      arr.push(Number(r.bodyweight_kg));
      weekBW.set(wk, arr);
    }

    const counts = new Map<string, number>();
    for (const l of logs) {
      counts.set(l.exercise, (counts.get(l.exercise) ?? 0) + 1);
    }
    const topEx = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([ex]) => ex);
    const topSet = new Map<string, Map<string, number>>();
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
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value);
                    return [
                      isFinite(n) ? `${fmtNum(n, 1)} kg` : "—",
                      String(name),
                    ];
                  }}
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
