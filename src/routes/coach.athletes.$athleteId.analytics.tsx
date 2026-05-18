import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfWeek, addDays } from "date-fns";
import { ArrowLeft, TrendingUp, Activity, Dumbbell, Gauge, Target, CalendarCheck, Heart, Download, Footprints } from "lucide-react";
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
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { dailyE1RM } from "@/lib/eakoefficient";
import { z } from "zod";
import { cn } from "@/lib/utils";

const analyticsSearchSchema = z.object({
  exercise: z.string().optional(),
  days: z.coerce.number().int().min(7).max(365).optional(),
  tab: z.enum(["exercise", "volume", "endurance", "adherence", "readiness"]).optional(),
});

export const Route = createFileRoute("/coach/athletes/$athleteId/analytics")({
  validateSearch: (search) => analyticsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Athlete analytics — EA Training System" },
      {
        name: "description",
        content: "Volume, E1RM, adherence and readiness correlation over time.",
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

const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(var(--status-peaking))",
  "hsl(var(--status-adapting))",
  "hsl(var(--status-undertrained))",
];

function AnalyticsPage() {
  const { athleteId } = useParams({
    from: "/coach/athletes/$athleteId/analytics",
  });
  const { exercise: selectedExercise, days = 90, tab = "exercise" } = Route.useSearch();
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
        .select("date, daily_form, fatigue, work_stress, life_stress, sleep_quality, nutrition, stiffness, sleep_hours, bodyweight_kg, notes")
        .eq("athlete_id", athleteId)
        .gte("date", format(since, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const enduranceQuery = useQuery({
    queryKey: ["analytics-endurance", athleteId, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data: sessions, error } = await supabase
        .from("endurance_sessions")
        .select("id, date, discipline, status, title, planned_total_seconds, planned_avg_rpe, actual_total_seconds, actual_distance_m, overall_rpe, peak_rpe")
        .eq("athlete_id", athleteId)
        .gte("date", format(since, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      const sList = sessions ?? [];
      const ids = sList.map((s) => s.id);
      let steps: Array<{ session_id: string; actual_duration_seconds: number | null; actual_distance_m: number | null; actual_avg_hr: number | null; actual_avg_rpe: number | null }> = [];
      if (ids.length) {
        const { data: stepData, error: sErr } = await supabase
          .from("endurance_steps")
          .select("session_id, actual_duration_seconds, actual_distance_m, actual_avg_hr, actual_avg_rpe")
          .in("session_id", ids);
        if (sErr) throw sErr;
        steps = stepData ?? [];
      }
      // Aggregate step-derived totals per session as fallback
      const stepAgg = new Map<string, { dur: number; dist: number; hrSum: number; hrCount: number; rpeSum: number; rpeCount: number }>();
      for (const st of steps) {
        const cur = stepAgg.get(st.session_id) ?? { dur: 0, dist: 0, hrSum: 0, hrCount: 0, rpeSum: 0, rpeCount: 0 };
        if (st.actual_duration_seconds) cur.dur += st.actual_duration_seconds;
        if (st.actual_distance_m) cur.dist += st.actual_distance_m;
        if (st.actual_avg_hr) { cur.hrSum += st.actual_avg_hr; cur.hrCount += 1; }
        if (st.actual_avg_rpe) { cur.rpeSum += Number(st.actual_avg_rpe); cur.rpeCount += 1; }
        stepAgg.set(st.session_id, cur);
      }
      return sList.map((s) => {
        const agg = stepAgg.get(s.id);
        const dur = s.actual_total_seconds ?? agg?.dur ?? 0;
        const dist = s.actual_distance_m ?? agg?.dist ?? 0;
        const rpe = s.overall_rpe ?? s.peak_rpe ?? (agg && agg.rpeCount ? agg.rpeSum / agg.rpeCount : null);
        const hr = agg && agg.hrCount ? Math.round(agg.hrSum / agg.hrCount) : null;
        return {
          id: s.id,
          date: s.date,
          discipline: s.discipline as string,
          status: s.status as string,
          title: s.title as string | null,
          duration_s: dur,
          distance_m: dist,
          rpe: rpe != null ? Number(rpe) : null,
          hr,
          planned_s: s.planned_total_seconds ?? 0,
          planned_rpe: s.planned_avg_rpe != null ? Number(s.planned_avg_rpe) : null,
        };
      });
    },
  });
  const exerciseLibQuery = useQuery({
    queryKey: ["analytics-exercise-lib"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("name, category");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const e of data ?? []) {
        map.set(e.name.toLowerCase(), e.category ?? "Uncategorized");
      }
      return map;
    },
  });

  // Planned sessions in window — for adherence
  const plannedQuery = useQuery({
    queryKey: ["analytics-planned", athleteId, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data: weeks, error: wErr } = await supabase
        .from("week_plans")
        .select("id, week_start_date, status")
        .eq("athlete_id", athleteId)
        .eq("status", "published")
        .gte("week_start_date", format(since, "yyyy-MM-dd"));
      if (wErr) throw wErr;
      const weekIds = (weeks ?? []).map((w) => w.id);
      if (weekIds.length === 0) {
        return {
          plannedDays: [] as string[],
          plannedTargets: [] as Array<{ date: string; target_rpe: number | null }>,
        };
      }
      const weekById = new Map((weeks ?? []).map((w) => [w.id, w]));

      const { data: sessions, error: sErr } = await supabase
        .from("planned_sessions")
        .select("id, day_of_week, week_plan_id")
        .in("week_plan_id", weekIds);
      if (sErr) throw sErr;

      const sessionIds = (sessions ?? []).map((s) => s.id);
      const targetsRes = sessionIds.length
        ? await supabase
            .from("planned_exercises")
            .select("planned_session_id, target_rpe")
            .in("planned_session_id", sessionIds)
        : { data: [], error: null };
      if (targetsRes.error) throw targetsRes.error;
      const targets = targetsRes.data ?? [];

      const plannedDays: string[] = [];
      const plannedTargets: Array<{ date: string; target_rpe: number | null }> = [];
      const today = new Date();

      for (const s of sessions ?? []) {
        const week = weekById.get(s.week_plan_id);
        if (!week) continue;
        const weekStart = parseISO(week.week_start_date);
        // day_of_week: 1 = Monday ... 7 = Sunday
        const sessionDate = addDays(weekStart, s.day_of_week - 1);
        const dateStr = format(sessionDate, "yyyy-MM-dd");
        if (sessionDate >= since && sessionDate <= today) {
          plannedDays.push(dateStr);
          const sessTargets = targets.filter(
            (t) => t.planned_session_id === s.id,
          );
          for (const t of sessTargets) {
            plannedTargets.push({ date: dateStr, target_rpe: t.target_rpe });
          }
        }
      }
      return { plannedDays, plannedTargets };
    },
  });

  const allLogs = logsQuery.data ?? [];
  const baselines = baselinesQuery.data ?? {};
  const exerciseLib = exerciseLibQuery.data ?? new Map<string, string>();

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

  // Per-day stats for selected exercise
  const dailyStats = useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: string;
        volume: number;
        maxWeight: number;
        bestE1RM: number;
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
    const maxWeight = dailyStats.reduce((acc, d) => Math.max(acc, d.maxWeight), 0);
    const peakE1RM = dailyStats.reduce((acc, d) => Math.max(acc, d.bestE1RM), 0);
    const peakEAk = dailyStats.reduce((acc, d) => Math.max(acc, d.eaKoefficient), 0);
    return { volume, maxWeight, peakE1RM, peakEAk, sessions: dailyStats.length };
  }, [dailyStats]);

  const formSeries = useMemo(
    () =>
      (surveysQuery.data ?? []).map((s) => ({
        date: s.date,
        label: format(parseISO(s.date), "MMM d"),
        daily_form: s.daily_form,
        fatigue: s.fatigue,
        work_stress: s.work_stress,
        life_stress: s.life_stress,
        sleep_quality: s.sleep_quality,
        nutrition: s.nutrition,
        stiffness: s.stiffness,
        sleep_hours: s.sleep_hours ? Number(s.sleep_hours) : null,
        bodyweight: s.bodyweight_kg ? Number(s.bodyweight_kg) : null,
        notes: s.notes,
      })),
    [surveysQuery.data],
  );

  // ---- Volume by category, weekly ----
  const volumeByCategory = useMemo(() => {
    // Map: weekStart(yyyy-MM-dd) -> { category -> tonnage }
    const weeks = new Map<string, Record<string, number>>();
    const categories = new Set<string>();
    for (const l of allLogs) {
      const cat = exerciseLib.get(l.exercise.toLowerCase()) ?? "Uncategorized";
      categories.add(cat);
      const wk = format(startOfWeek(parseISO(l.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const row = weeks.get(wk) ?? {};
      row[cat] = (row[cat] ?? 0) + l.reps * l.weight_kg;
      weeks.set(wk, row);
    }
    const data = Array.from(weeks.entries())
      .map(([wk, row]) => ({
        week: wk,
        label: format(parseISO(wk), "MMM d"),
        ...Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, Math.round(v)]),
        ),
      }))
      .sort((a, b) => a.week.localeCompare(b.week));
    return { data, categories: Array.from(categories).sort() };
  }, [allLogs, exerciseLib]);

  // ---- Multi-lift e1RM overlay (top 4 by frequency) ----
  const multiLiftSeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of allLogs) counts.set(l.exercise, (counts.get(l.exercise) ?? 0) + 1);
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    // Build date -> { exercise: bestE1RM }
    const byDate = new Map<string, Record<string, number>>();
    for (const l of allLogs) {
      if (!top.includes(l.exercise)) continue;
      const e1 = dailyE1RM(l);
      const row = byDate.get(l.date) ?? {};
      row[l.exercise] = Math.max(row[l.exercise] ?? 0, e1);
      byDate.set(l.date, row);
    }
    const data = Array.from(byDate.entries())
      .map(([date, row]) => ({
        date,
        label: format(parseISO(date), "MMM d"),
        ...Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, Number(v.toFixed(1))]),
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { data, lifts: top };
  }, [allLogs]);

  // ---- Adherence ----
  const adherence = useMemo(() => {
    const planned = plannedQuery.data?.plannedDays ?? [];
    const plannedTargets = plannedQuery.data?.plannedTargets ?? [];
    const completedDays = new Set(allLogs.map((l) => l.date));
    const plannedSet = new Set(planned);
    const completedPlanned = planned.filter((d) => completedDays.has(d));
    const missed = planned.filter((d) => !completedDays.has(d));

    // Avg target RPE vs avg actual RPE per day
    const targetAvgByDate = new Map<string, { sum: number; count: number }>();
    for (const t of plannedTargets) {
      if (t.target_rpe == null) continue;
      const cur = targetAvgByDate.get(t.date) ?? { sum: 0, count: 0 };
      cur.sum += Number(t.target_rpe);
      cur.count += 1;
      targetAvgByDate.set(t.date, cur);
    }
    const actualAvgByDate = new Map<string, { sum: number; count: number }>();
    for (const l of allLogs) {
      const cur = actualAvgByDate.get(l.date) ?? { sum: 0, count: 0 };
      cur.sum += l.rpe;
      cur.count += 1;
      actualAvgByDate.set(l.date, cur);
    }
    const rpeSeries: Array<{ date: string; label: string; target: number | null; actual: number | null }> = [];
    const allDates = Array.from(new Set([...targetAvgByDate.keys(), ...actualAvgByDate.keys()])).sort();
    for (const d of allDates) {
      const t = targetAvgByDate.get(d);
      const a = actualAvgByDate.get(d);
      rpeSeries.push({
        date: d,
        label: format(parseISO(d), "MMM d"),
        target: t ? Number((t.sum / t.count).toFixed(2)) : null,
        actual: a ? Number((a.sum / a.count).toFixed(2)) : null,
      });
    }

    const adherencePct = planned.length > 0
      ? Math.round((completedPlanned.length / planned.length) * 100)
      : null;

    // Streak: consecutive days from today backwards with no missed planned session
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = format(addDays(today, -i), "yyyy-MM-dd");
      if (plannedSet.has(d) && !completedDays.has(d)) break;
      if (plannedSet.has(d) && completedDays.has(d)) streak += 1;
    }

    return {
      planned: planned.length,
      completed: completedPlanned.length,
      missed: missed.length,
      adherencePct,
      streak,
      rpeSeries,
      missedDates: missed.slice(-10).reverse(),
    };
  }, [plannedQuery.data, allLogs]);

  // ---- Readiness vs performance ----
  const readinessScatter = useMemo(() => {
    // For each date with a survey, compute that day's average EAk% across all logged exercises
    const formByDate = new Map<string, { form: number; fatigue: number }>();
    for (const s of surveysQuery.data ?? []) {
      formByDate.set(s.date, { form: s.daily_form, fatigue: s.fatigue });
    }
    const eakByDate = new Map<string, { sum: number; count: number }>();
    for (const l of allLogs) {
      const baseline = baselines[l.exercise];
      if (!baseline || baseline <= 0) continue;
      const eak = (dailyE1RM(l) / baseline) * 100;
      const cur = eakByDate.get(l.date) ?? { sum: 0, count: 0 };
      cur.sum += eak;
      cur.count += 1;
      eakByDate.set(l.date, cur);
    }
    const points: Array<{ form: number; eak: number; date: string; fatigue: number }> = [];
    for (const [date, eak] of eakByDate.entries()) {
      const f = formByDate.get(date);
      if (!f) continue;
      points.push({
        form: f.form,
        fatigue: f.fatigue,
        eak: Number((eak.sum / eak.count).toFixed(1)),
        date,
      });
    }

    // Pearson correlation between form and EAk
    let correlation: number | null = null;
    if (points.length >= 3) {
      const n = points.length;
      const mx = points.reduce((a, p) => a + p.form, 0) / n;
      const my = points.reduce((a, p) => a + p.eak, 0) / n;
      let num = 0, dx = 0, dy = 0;
      for (const p of points) {
        num += (p.form - mx) * (p.eak - my);
        dx += (p.form - mx) ** 2;
        dy += (p.eak - my) ** 2;
      }
      correlation = dx > 0 && dy > 0 ? Number((num / Math.sqrt(dx * dy)).toFixed(2)) : null;
    }
    return { points, correlation };
  }, [surveysQuery.data, allLogs, baselines]);

  // ---- Endurance ----
  const enduranceData = enduranceQuery.data ?? [];
  const enduranceStats = useMemo(() => {
    const completed = enduranceData.filter((s) => s.status === "completed" || s.duration_s > 0 || s.distance_m > 0);
    // Per-session series (sorted by date)
    const series = completed.map((s) => {
      const km = s.distance_m / 1000;
      const min = s.duration_s / 60;
      const paceSecPerKm = km > 0 && s.duration_s > 0 ? s.duration_s / km : null;
      return {
        date: s.date,
        label: format(parseISO(s.date), "MMM d"),
        discipline: s.discipline,
        title: s.title,
        km: Number(km.toFixed(2)),
        minutes: Number(min.toFixed(1)),
        rpe: s.rpe,
        hr: s.hr,
        pace_s_per_km: paceSecPerKm,
        pace_label: paceSecPerKm ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, "0")}/km` : null,
      };
    });

    // Weekly aggregates (per discipline)
    const weekMap = new Map<string, { week: string; label: string; distance: Record<string, number>; minutes: Record<string, number>; rpeSum: number; rpeCount: number; sessions: number }>();
    const disciplines = new Set<string>();
    for (const s of completed) {
      const wk = format(startOfWeek(parseISO(s.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      disciplines.add(s.discipline);
      const row = weekMap.get(wk) ?? { week: wk, label: format(parseISO(wk), "MMM d"), distance: {}, minutes: {}, rpeSum: 0, rpeCount: 0, sessions: 0 };
      row.distance[s.discipline] = (row.distance[s.discipline] ?? 0) + s.distance_m / 1000;
      row.minutes[s.discipline] = (row.minutes[s.discipline] ?? 0) + s.duration_s / 60;
      if (s.rpe != null) { row.rpeSum += s.rpe; row.rpeCount += 1; }
      row.sessions += 1;
      weekMap.set(wk, row);
    }
    const weekly = Array.from(weekMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => {
        const flat: Record<string, number | string> = { week: w.week, label: w.label, sessions: w.sessions, avgRPE: w.rpeCount > 0 ? Number((w.rpeSum / w.rpeCount).toFixed(2)) : 0 };
        for (const d of disciplines) {
          flat[`km_${d}`] = Number((w.distance[d] ?? 0).toFixed(2));
          flat[`min_${d}`] = Number((w.minutes[d] ?? 0).toFixed(0));
        }
        flat.totalKm = Number(Object.values(w.distance).reduce((a, b) => a + b, 0).toFixed(2));
        flat.totalMin = Number(Object.values(w.minutes).reduce((a, b) => a + b, 0).toFixed(0));
        return flat;
      });

    // Totals
    const totalKm = completed.reduce((a, s) => a + s.distance_m / 1000, 0);
    const totalMin = completed.reduce((a, s) => a + s.duration_s / 60, 0);
    const rpeVals = completed.map((s) => s.rpe).filter((v): v is number => v != null);
    const avgRPE = rpeVals.length ? rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length : null;
    const runs = completed.filter((s) => s.discipline === "run" && s.distance_m > 0 && s.duration_s > 0);
    const avgRunPace = runs.length
      ? runs.reduce((a, s) => a + s.duration_s / (s.distance_m / 1000), 0) / runs.length
      : null;
    return {
      series,
      weekly,
      disciplines: Array.from(disciplines).sort(),
      totals: {
        sessions: completed.length,
        totalKm,
        totalMin,
        avgRPE,
        avgRunPace,
      },
    };
  }, [enduranceData]);

  const isLoading =
    logsQuery.isLoading || baselinesQuery.isLoading || surveysQuery.isLoading || enduranceQuery.isLoading;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/coach/athletes/$athleteId" params={{ athleteId }}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to athlete
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {profileQuery.data?.full_name ?? "Athlete"} — Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Performance, volume, adherence and readiness over time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportHistoryCsv({
                athleteName: profileQuery.data?.full_name ?? "athlete",
                logs: allLogs,
                surveys: surveysQuery.data ?? [],
              })
            }
            disabled={allLogs.length === 0 && (surveysQuery.data ?? []).length === 0}
          >
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!isLoading && (
        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ search: (prev) => ({ ...prev, tab: v as typeof tab }) })
          }
        >
          <TabsList className="grid w-full grid-cols-3 md:w-auto md:grid-cols-5">
            <TabsTrigger value="exercise">Exercise</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="endurance">Endurance</TabsTrigger>
            <TabsTrigger value="adherence">Adherence</TabsTrigger>
            <TabsTrigger value="readiness">Readiness</TabsTrigger>
          </TabsList>

          {/* === EXERCISE TAB === */}
          <TabsContent value="exercise" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Select
                value={exercise ?? ""}
                onValueChange={(v) =>
                  navigate({ search: (prev) => ({ ...prev, exercise: v }) })
                }
              >
                <SelectTrigger className="w-[240px]">
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
            </div>

            {exercises.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No training logs in the selected window.
                </CardContent>
              </Card>
            )}

            {exercise && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard icon={<Dumbbell className="h-4 w-4" />} label="Total volume" value={`${(totals.volume / 1000).toFixed(1)}t`} hint={`${totals.sessions} sessions`} />
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Max weight" value={`${totals.maxWeight} kg`} />
                  <KpiCard icon={<Activity className="h-4 w-4" />} label="Peak E1RM" value={`${totals.peakE1RM.toFixed(1)} kg`} />
                  <KpiCard icon={<Gauge className="h-4 w-4" />} label="Peak EAkoeff" value={totals.peakEAk > 0 ? `${totals.peakEAk.toFixed(0)}%` : "—"} hint={baselines[exercise] ? `Base: ${baselines[exercise]} kg` : "No baseline"} />
                </div>

                <ChartCard
                  title="E1RM & EAkoefficient over time"
                  description={baselines[exercise] ? "Best daily E1RM and EAkoefficient % vs. baseline." : "Best daily E1RM. Set a baseline to see EAkoefficient %."}
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

                <ChartCard title="Volume per session" description="Total tonnage (reps × weight) for each training day.">
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

                {multiLiftSeries.lifts.length > 1 && (
                  <ChartCard title="Top lifts — E1RM overlay" description="Best daily E1RM for the most-trained lifts in this window.">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={multiLiftSeries.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                        <Legend />
                        {multiLiftSeries.lifts.map((lift, i) => (
                          <Line
                            key={lift}
                            type="monotone"
                            dataKey={lift}
                            stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </>
            )}
          </TabsContent>

          {/* === VOLUME TAB === */}
          <TabsContent value="volume" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Weekly tonnage by category</CardTitle>
                <CardDescription>
                  Sum of reps × weight per week, grouped by exercise category. Categorize exercises in the library to see meaningful splits.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {volumeByCategory.data.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No data in window.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={volumeByCategory.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      {volumeByCategory.categories.map((cat, i) => (
                        <Bar
                          key={cat}
                          dataKey={cat}
                          stackId="vol"
                          fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                          name={cat}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-3">
              {volumeByCategory.categories.slice(0, 6).map((cat, i) => {
                const total = volumeByCategory.data.reduce(
                  (acc, w) => acc + ((w as Record<string, unknown>)[cat] as number ?? 0),
                  0,
                );
                return (
                  <Card key={cat}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        <span className="text-muted-foreground">{cat}</span>
                      </div>
                      <div className="mt-1 text-2xl font-bold">{(total / 1000).toFixed(1)}t</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* === ENDURANCE TAB === */}
          <TabsContent value="endurance" className="mt-4 space-y-4">
            {enduranceStats.totals.sessions === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No completed endurance sessions in this window.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard icon={<Footprints className="h-4 w-4" />} label="Sessions" value={String(enduranceStats.totals.sessions)} hint={enduranceStats.disciplines.join(", ")} />
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Total distance" value={`${enduranceStats.totals.totalKm.toFixed(1)} km`} />
                  <KpiCard icon={<Activity className="h-4 w-4" />} label="Total time" value={`${Math.floor(enduranceStats.totals.totalMin / 60)}h ${Math.round(enduranceStats.totals.totalMin % 60)}m`} />
                  <KpiCard
                    icon={<Gauge className="h-4 w-4" />}
                    label="Avg run pace"
                    value={
                      enduranceStats.totals.avgRunPace
                        ? `${Math.floor(enduranceStats.totals.avgRunPace / 60)}:${String(Math.round(enduranceStats.totals.avgRunPace % 60)).padStart(2, "0")}/km`
                        : "—"
                    }
                    hint={enduranceStats.totals.avgRPE != null ? `Avg RPE ${enduranceStats.totals.avgRPE.toFixed(1)}` : undefined}
                  />
                </div>

                <ChartCard title="Weekly distance by discipline" description="Total km per ISO week, split by run / bike / swim.">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={enduranceStats.weekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit=" km" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      {enduranceStats.disciplines.map((d, i) => (
                        <Bar key={d} dataKey={`km_${d}`} stackId="km" name={d} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Weekly time & average RPE" description="Total minutes per week with average session RPE overlay.">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={enduranceStats.weekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} unit=" min" />
                      <YAxis yAxisId="right" orientation="right" domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="totalMin" name="Minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="avgRPE" name="Avg RPE" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Per-session RPE & distance" description="Each point is one session — track intensity trend over time.">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={enduranceStats.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis yAxisId="left" domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} unit=" km" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="rpe" name="Session RPE" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line yAxisId="right" type="monotone" dataKey="km" name="Distance (km)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Recent sessions</CardTitle>
                    <CardDescription>Latest 15 completed endurance sessions with pace and HR.</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-2 py-2 text-left">Type</th>
                          <th className="px-2 py-2 text-left">Title</th>
                          <th className="px-2 py-2 text-right">Distance</th>
                          <th className="px-2 py-2 text-right">Time</th>
                          <th className="px-2 py-2 text-right">Pace</th>
                          <th className="px-2 py-2 text-right">RPE</th>
                          <th className="px-2 py-2 text-right">Avg HR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...enduranceStats.series].reverse().slice(0, 15).map((s, idx) => (
                          <tr key={`${s.date}-${idx}`} className="border-t border-border">
                            <td className="px-3 py-2 font-medium">{format(parseISO(s.date), "EEE MMM d")}</td>
                            <td className="px-2 py-2 capitalize">{s.discipline}</td>
                            <td className="px-2 py-2 text-muted-foreground">{s.title ?? "—"}</td>
                            <td className="px-2 py-2 text-right">{s.km > 0 ? `${s.km.toFixed(2)} km` : "—"}</td>
                            <td className="px-2 py-2 text-right">{s.minutes > 0 ? `${s.minutes.toFixed(0)} min` : "—"}</td>
                            <td className="px-2 py-2 text-right">{s.pace_label ?? "—"}</td>
                            <td className="px-2 py-2 text-right">{s.rpe != null ? s.rpe.toFixed(1) : "—"}</td>
                            <td className="px-2 py-2 text-right">{s.hr ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* === ADHERENCE TAB === */}
          <TabsContent value="adherence" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard icon={<Target className="h-4 w-4" />} label="Adherence" value={adherence.adherencePct != null ? `${adherence.adherencePct}%` : "—"} hint={`${adherence.completed}/${adherence.planned} planned sessions`} />
              <KpiCard icon={<CalendarCheck className="h-4 w-4" />} label="Completed" value={String(adherence.completed)} />
              <KpiCard icon={<Activity className="h-4 w-4" />} label="Missed" value={String(adherence.missed)} hint={adherence.missed > 0 ? "See list below" : "Clean record"} />
              <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Streak" value={`${adherence.streak} days`} hint="Consecutive completed planned days" />
            </div>

            {adherence.planned === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No published planned sessions in this window. Publish a week in a mesocycle to track adherence.
                </CardContent>
              </Card>
            ) : (
              <>
                <ChartCard title="Target vs actual RPE" description="Average prescribed RPE per day vs the athlete's logged RPE.">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={adherence.rpeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Line type="monotone" dataKey="target" name="Target RPE" stroke="hsl(var(--accent-foreground))" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="actual" name="Actual RPE" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {adherence.missedDates.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Recently missed sessions</CardTitle>
                      <CardDescription>Planned days with no logged training.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {adherence.missedDates.map((d) => (
                          <Badge key={d} variant="destructive">
                            {format(parseISO(d), "EEE MMM d")}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* === READINESS TAB === */}
          <TabsContent value="readiness" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <KpiCard
                icon={<Heart className="h-4 w-4" />}
                label="Form ↔ Performance correlation"
                value={readinessScatter.correlation != null ? readinessScatter.correlation.toFixed(2) : "—"}
                hint={
                  readinessScatter.correlation == null
                    ? "Need ≥3 paired days"
                    : readinessScatter.correlation > 0.3
                      ? "Form predicts performance"
                      : readinessScatter.correlation < -0.3
                        ? "Inverse relationship"
                        : "Weak / no relationship"
                }
              />
              <KpiCard icon={<Activity className="h-4 w-4" />} label="Surveys logged" value={String(formSeries.length)} />
              <KpiCard icon={<Gauge className="h-4 w-4" />} label="Paired data points" value={String(readinessScatter.points.length)} hint="Days with both survey and lift" />
            </div>

            {readinessScatter.points.length < 3 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Need at least 3 days where the athlete logged both a readiness survey and training (with a baseline 1RM set) to compute correlation.
                </CardContent>
              </Card>
            ) : (
              <ChartCard
                title="Daily form vs session EAkoefficient"
                description="Each dot is one day. X = self-reported form (1–10), Y = average EAk% across logged exercises that day."
              >
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" dataKey="form" name="Daily form" domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis type="number" dataKey="eak" name="EAk %" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      formatter={(value, name) => [value, name]}
                    />
                    <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Baseline", fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                    <Scatter data={readinessScatter.points} fill="hsl(var(--primary))" />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {formSeries.length > 0 && (
              <ChartCard title="Daily check-in trends" description="All self-reported metrics from the athlete's pre-training survey (1–10).">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={formSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis domain={[1, 10]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Legend />
                    <Line type="monotone" dataKey="daily_form" name="Daily form" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="sleep_quality" name="Sleep quality" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="nutrition" name="Nutrition" stroke="hsl(var(--chart-3))" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="stiffness" name="Stiffness" stroke="hsl(var(--chart-4))" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="work_stress" name="Work stress" stroke="hsl(var(--chart-5))" strokeWidth={1} strokeDasharray="4 3" dot={false} />
                    <Line type="monotone" dataKey="life_stress" name="Life stress" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {formSeries.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Day-by-day check-in</CardTitle>
                  <CardDescription>Color cells flag low metrics — quick scan for trends across days.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-center">Form</th>
                        <th className="px-2 py-2 text-center">Sleep q.</th>
                        <th className="px-2 py-2 text-center">Sleep h</th>
                        <th className="px-2 py-2 text-center">Nutrition</th>
                        <th className="px-2 py-2 text-center">Stiffness</th>
                        <th className="px-2 py-2 text-center">Fatigue</th>
                        <th className="px-2 py-2 text-center">Work</th>
                        <th className="px-2 py-2 text-center">Life</th>
                        <th className="px-2 py-2 text-center">BW kg</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...formSeries].reverse().map((s) => (
                        <tr key={s.date} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{format(parseISO(s.date), "EEE MMM d")}</td>
                          <ScoreCell value={s.daily_form} highIsGood />
                          <ScoreCell value={s.sleep_quality} highIsGood />
                          <td className="px-2 py-2 text-center text-muted-foreground">{s.sleep_hours ?? "—"}</td>
                          <ScoreCell value={s.nutrition} highIsGood />
                          <ScoreCell value={s.stiffness} highIsGood={false} />
                          <ScoreCell value={s.fatigue} highIsGood={false} />
                          <ScoreCell value={s.work_stress} highIsGood={false} muted />
                          <ScoreCell value={s.life_stress} highIsGood={false} muted />
                          <td className="px-2 py-2 text-center text-muted-foreground">{s.bodyweight ?? "—"}</td>
                          <td className="max-w-[260px] px-3 py-2 text-xs text-muted-foreground">{s.notes ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
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

function ScoreCell({
  value,
  highIsGood,
  muted,
}: {
  value: number | null;
  highIsGood: boolean;
  muted?: boolean;
}) {
  if (value == null) return <td className="px-2 py-2 text-center text-muted-foreground">—</td>;
  // Normalize so higher = "better" for tone
  const good = highIsGood ? value >= 7 : value <= 4;
  const bad = highIsGood ? value <= 4 : value >= 7;
  const tone = bad
    ? "bg-status-exhausted/25 text-status-exhausted-foreground font-semibold"
    : good
      ? "bg-status-peaking/25 text-status-peaking-foreground font-semibold"
      : muted
        ? "text-muted-foreground"
        : "";
  return <td className={cn("px-2 py-2 text-center", tone)}>{value}</td>;
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

// ===== CSV export =====
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ExportArgs {
  athleteName: string;
  logs: LogRow[];
  surveys: Array<{
    date: string;
    daily_form: number;
    fatigue: number;
    work_stress: number;
    life_stress: number;
    sleep_quality: number | null;
    nutrition: number | null;
    stiffness: number | null;
    sleep_hours: number | null;
    bodyweight_kg: number | null;
    notes: string | null;
  }>;
}

function exportHistoryCsv({ athleteName, logs, surveys }: ExportArgs) {
  const safeName = athleteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const today = format(new Date(), "yyyy-MM-dd");

  // Training logs
  const logRows: (string | number | null)[][] = [
    ["date", "exercise", "variation", "set_number", "reps", "weight_kg", "rpe"],
    ...logs.map((l) => [
      l.date,
      l.exercise,
      l.variation ?? "",
      l.set_number,
      l.reps,
      l.weight_kg,
      l.rpe,
    ]),
  ];
  downloadCsv(`${safeName}-training-${today}.csv`, logRows);

  // Readiness surveys (separate file)
  if (surveys.length > 0) {
    const surveyRows: (string | number | null)[][] = [
      ["date", "daily_form", "sleep_quality", "sleep_hours", "nutrition", "stiffness", "fatigue", "work_stress", "life_stress", "bodyweight_kg", "notes"],
      ...surveys.map((s) => [
        s.date,
        s.daily_form,
        s.sleep_quality,
        s.sleep_hours,
        s.nutrition,
        s.stiffness,
        s.fatigue,
        s.work_stress,
        s.life_stress,
        s.bodyweight_kg,
        s.notes,
      ]),
    ];
    downloadCsv(`${safeName}-readiness-${today}.csv`, surveyRows);
  }
}
