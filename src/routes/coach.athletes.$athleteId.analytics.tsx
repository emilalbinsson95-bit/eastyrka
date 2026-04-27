import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft, TrendingUp, Activity, Dumbbell, Gauge } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dailyE1RM } from "@/lib/eakoefficient";
import { z } from "zod";

const analyticsSearchSchema = z.object({
  exercise: z.string().optional(),
  days: z.coerce.number().int().min(7).max(365).optional(),
});

export const Route = createFileRoute("/coach/athletes/$athleteId/analytics")({
  validateSearch: (search) => analyticsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Athlete analytics — EA Training System" },
      {
        name: "description",
        content: "Volume, E1RM, intensity and EAkoefficient over time.",
      },
    ],
  }),
  component: AnalyticsPage,
});

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

function AnalyticsPage() {
  const { athleteId } = useParams({
    from: "/coach/athletes/$athleteId/analytics",
  });
  const { exercise: selectedExercise, days = 90 } = Route.useSearch();
  const navigate = Route.useNavigate();

  const profileQuery = useQuery({
    queryKey: ["athlete-profile", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const logsQuery = useQuery({
    queryKey: ["analytics-logs", athleteId, days],
    queryFn: async (): Promise<LogRow[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("training_logs")
        .select(
          "id, date, exercise, variation, set_number, reps, weight_kg, rpe",
        )
        .eq("athlete_id", athleteId)
        .gte("date", format(since, "yyyy-MM-dd"))
        .order("date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((l) => ({
        ...l,
        weight_kg: Number(l.weight_kg),
        rpe: Number(l.rpe),
      })) as LogRow[];
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["analytics-baselines", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", athleteId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const b of data ?? []) map[b.exercise] = Number(b.one_rm_kg);
      return map;
    },
  });

  const surveysQuery = useQuery({
    queryKey: ["analytics-surveys", athleteId, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("readiness_surveys")
        .select("date, daily_form, fatigue, work_stress, life_stress, bodyweight_kg")
        .eq("athlete_id", athleteId)
        .gte("date", format(since, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const allLogs = logsQuery.data ?? [];
  const baselines = baselinesQuery.data ?? {};

  const exercises = useMemo(() => {
    const set = new Set<string>();
    allLogs.forEach((l) => set.add(l.exercise));
    return Array.from(set).sort();
  }, [allLogs]);

  const exercise = selectedExercise ?? exercises[0];

  const filtered = useMemo(
    () => (exercise ? allLogs.filter((l) => l.exercise === exercise) : []),
    [allLogs, exercise],
  );

  // Aggregate per-day stats for the selected exercise
  const dailyStats = useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: string;
        volume: number; // sum of reps × weight
        maxWeight: number;
        bestE1RM: number;
        avgRPE: number;
        sets: number;
        rpeSum: number;
      }
    >();
    for (const l of filtered) {
      const cur =
        byDate.get(l.date) ?? {
          date: l.date,
          volume: 0,
          maxWeight: 0,
          bestE1RM: 0,
          avgRPE: 0,
          sets: 0,
          rpeSum: 0,
        };
      cur.volume += l.reps * l.weight_kg;
      cur.maxWeight = Math.max(cur.maxWeight, l.weight_kg);
      cur.bestE1RM = Math.max(
        cur.bestE1RM,
        dailyE1RM({ reps: l.reps, weight_kg: l.weight_kg, rpe: l.rpe }),
      );
      cur.sets += 1;
      cur.rpeSum += l.rpe;
      byDate.set(l.date, cur);
    }
    const baseline = baselines[exercise ?? ""] ?? 0;
    return Array.from(byDate.values())
      .map((s) => ({
        date: s.date,
        label: format(parseISO(s.date), "MMM d"),
        volume: Math.round(s.volume),
        maxWeight: Number(s.maxWeight.toFixed(1)),
        bestE1RM: Number(s.bestE1RM.toFixed(1)),
        eaKoefficient:
          baseline > 0 ? Number(((s.bestE1RM / baseline) * 100).toFixed(1)) : 0,
        avgRPE: Number((s.rpeSum / s.sets).toFixed(2)),
        intensity:
          baseline > 0
            ? Number(((s.maxWeight / baseline) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered, baselines, exercise]);

  const totals = useMemo(() => {
    const volume = dailyStats.reduce((acc, d) => acc + d.volume, 0);
    const maxWeight = dailyStats.reduce(
      (acc, d) => Math.max(acc, d.maxWeight),
      0,
    );
    const peakE1RM = dailyStats.reduce(
      (acc, d) => Math.max(acc, d.bestE1RM),
      0,
    );
    const peakEAk = dailyStats.reduce(
      (acc, d) => Math.max(acc, d.eaKoefficient),
      0,
    );
    return { volume, maxWeight, peakE1RM, peakEAk, sessions: dailyStats.length };
  }, [dailyStats]);

  const formSeries = useMemo(
    () =>
      (surveysQuery.data ?? []).map((s) => ({
        date: s.date,
        label: format(parseISO(s.date), "MMM d"),
        daily_form: s.daily_form,
        fatigue: s.fatigue,
        bodyweight: s.bodyweight_kg ? Number(s.bodyweight_kg) : null,
      })),
    [surveysQuery.data],
  );

  const isLoading =
    logsQuery.isLoading || baselinesQuery.isLoading || surveysQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link
              to="/coach/athletes/$athleteId"
              params={{ athleteId }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to athlete
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {profileQuery.data?.full_name ?? "Athlete"} — Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Trends in volume, E1RM, max weight and intensity over time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={exercise ?? ""}
            onValueChange={(v) =>
              navigate({ search: (prev) => ({ ...prev, exercise: v }) })
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select exercise" />
            </SelectTrigger>
            <SelectContent>
              {exercises.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(days)}
            onValueChange={(v) =>
              navigate({ search: (prev) => ({ ...prev, days: Number(v) }) })
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last 365 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!isLoading && exercises.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No training logs in the selected window.
          </CardContent>
        </Card>
      )}

      {!isLoading && exercise && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              icon={<Dumbbell className="h-4 w-4" />}
              label="Total volume"
              value={`${(totals.volume / 1000).toFixed(1)}t`}
              hint={`${totals.sessions} sessions`}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Max weight"
              value={`${totals.maxWeight} kg`}
            />
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Peak E1RM"
              value={`${totals.peakE1RM.toFixed(1)} kg`}
            />
            <KpiCard
              icon={<Gauge className="h-4 w-4" />}
              label="Peak EAkoeff"
              value={
                totals.peakEAk > 0 ? `${totals.peakEAk.toFixed(0)}%` : "—"
              }
              hint={
                baselines[exercise]
                  ? `Base: ${baselines[exercise]} kg`
                  : "No baseline"
              }
            />
          </div>

          <ChartCard
            title="E1RM & EAkoefficient over time"
            description={
              baselines[exercise]
                ? "Best daily E1RM (bars) and EAkoefficient % vs. baseline (line)."
                : "Best daily E1RM (bars). Set a baseline 1RM to see EAkoefficient %."
            }
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="bestE1RM" name="Best E1RM (kg)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                {baselines[exercise] && (
                  <Line yAxisId="right" type="monotone" dataKey="eaKoefficient" name="EAkoeff %" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={{ r: 3 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Volume per session"
            description="Total tonnage (reps × weight) for each training day."
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="volume" name="Volume (kg)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Max weight & intensity"
              description={
                baselines[exercise]
                  ? "Top single (kg) and intensity (% of baseline 1RM)."
                  : "Top single (kg) per session."
              }
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  {baselines[exercise] && (
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  )}
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="maxWeight" name="Max weight (kg)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  {baselines[exercise] && (
                    <Line yAxisId="right" type="monotone" dataKey="intensity" name="Intensity (%1RM)" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Average RPE"
              description="Mean RPE across sets per session — proxy for perceived intensity."
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="avgRPE" name="Avg RPE" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {formSeries.length > 0 && (
            <ChartCard
              title="Daily form & fatigue"
              description="From the athlete's daily readiness surveys."
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={formSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Line type="monotone" dataKey="daily_form" name="Daily form" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
