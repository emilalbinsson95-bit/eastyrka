import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format, parseISO, startOfWeek, addDays } from "date-fns";
import { sv } from "date-fns/locale";
import { ArrowLeft, TrendingUp, Activity, Dumbbell, Gauge, Target, CalendarCheck, Heart, Download, Footprints, Bike, Waves, ChevronLeft, ChevronRight, Wand2, Loader2 } from "lucide-react";
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
import { plannedSessionDate } from "@/lib/planned-session-dates";
import { dailyE1RM, rollingE1RMBySession, countsForEAk } from "@/lib/eakoefficient";
import { autoFloatBaselines, type BaselineAutoResult } from "@/lib/baselineAutofloat.functions";
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
      { title: "Atletanalys — SETPOINT" },
      {
        name: "description",
        content: "Volym, E1RM, följsamhet och dagsformens samband över tid.",
      },
      { property: "og:title", content: "Atletanalys — SETPOINT" },
      { property: "og:description", content: "Volym, E1RM, följsamhet och dagsformens samband över tid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  "var(--status-peaking)",
  "var(--status-adapting)",
  "var(--status-undertrained)",
];

// RPE band colors — use raw oklch tokens (not wrapped in hsl()) since
// the design tokens are defined as oklch(...). Wrapping in hsl() would
// produce invalid CSS and the bars/dots would render as black.
const BAND_COLORS = {
  easy: "var(--chart-2)", // green
  mod: "var(--chart-4)",  // amber
  hard: "var(--chart-1)", // blue
  max: "var(--chart-3)",  // red/orange
} as const;
const BAND_ACCENT = "var(--chart-5)"; // purple accent for the avg-RPE line


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
        exercise: (l.exercise ?? "").trim(),
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
      for (const b of data ?? []) {
        const key = (b.exercise ?? "").trim();
        const val = Number(b.one_rm_kg);
        // Keep highest baseline if duplicates (case/whitespace variants)
        if (!map[key] || val > map[key]) map[key] = val;
        // Also store lowercase alias for case-insensitive lookup
        const lower = key.toLowerCase();
        if (lower !== key && (!map[lower] || val > map[lower])) map[lower] = val;
      }
      return map;
    },
  });

  const baselineHistoryQuery = useQuery({
    queryKey: ["analytics-baseline-history", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_history")
        .select("exercise, one_rm_kg, recorded_at, note")
        .eq("athlete_id", athleteId)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        exercise: r.exercise,
        one_rm_kg: Number(r.one_rm_kg),
        recorded_at: r.recorded_at as string,
        note: r.note as string | null,
      }));
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
      let steps: Array<{ session_id: string; discipline: string | null; actual_duration_seconds: number | null; actual_distance_m: number | null; actual_avg_hr: number | null; actual_avg_rpe: number | null }> = [];
      if (ids.length) {
        const { data: stepData, error: sErr } = await supabase
          .from("endurance_steps")
          .select("session_id, discipline, actual_duration_seconds, actual_distance_m, actual_avg_hr, actual_avg_rpe")
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
      const sessionInfo = new Map(sList.map((s) => [s.id, { date: s.date as string, discipline: s.discipline as string }]));
      // Per-step samples for run pace-by-intensity (sampled, not session avg)
      const runSteps = steps
        .map((st) => {
          const info = sessionInfo.get(st.session_id);
          if (!info) return null;
          const disc = (st.discipline ?? info.discipline) as string;
          if (disc !== "run") return null;
          const sec = Number(st.actual_duration_seconds ?? 0);
          const m = Number(st.actual_distance_m ?? 0);
          const rpe = st.actual_avg_rpe != null ? Number(st.actual_avg_rpe) : null;
          if (sec <= 0 || m <= 0 || rpe == null) return null;
          return { date: info.date, sec, m, rpe };
        })
        .filter((x): x is { date: string; sec: number; m: number; rpe: number } => x !== null);
      const sessionsOut = sList.map((s) => {
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
      return { sessions: sessionsOut, runSteps };

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
      // Widen lower bound by 7 days: a week_plan starting up to 6 days before
      // `since` still has sessions inside the window.
      const lowerBound = new Date(since);
      lowerBound.setDate(lowerBound.getDate() - 7);
      const todayDate = new Date();
      const { data: weeks, error: wErr } = await supabase
        .from("week_plans")
        .select("id, week_start_date, status")
        .eq("athlete_id", athleteId)
        .eq("status", "published")
        .gte("week_start_date", format(lowerBound, "yyyy-MM-dd"))
        .lte("week_start_date", format(todayDate, "yyyy-MM-dd"));
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
        .select("id, day_of_week, week_plan_id, title")
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
        const dateStr = plannedSessionDate(
          week.week_start_date,
          s,
          (sessions ?? []).filter((candidate) => candidate.week_plan_id === s.week_plan_id),
        );
        const sessionDate = parseISO(dateStr);
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

  // Case-/whitespace-insensitive baseline lookup so "Bench Press" and
  // "bench press " resolve to the same baseline.
  const lookupBaseline = (name: string | undefined | null): number => {
    if (!name) return 0;
    const key = name.trim();
    return baselines[key] ?? baselines[key.toLowerCase()] ?? 0;
  };

  // Baseline that was in force on a given date (from baseline_history),
  // so a baseline raise shows as a step instead of an unexplained EAk dip.
  const baselineAt = (name: string, date: string): number => {
    const rows = (baselineHistoryQuery.data ?? []).filter(
      (r) => r.exercise.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (rows.length === 0) return lookupBaseline(name);
    let val = rows[0].one_rm_kg;
    for (const r of rows) if (r.recorded_at.slice(0, 10) <= date) val = r.one_rm_kg;
    return val;
  };

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
        qualifying: number;
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
          qualifying: 0,
        };
      if (countsForEAk(l)) cur.qualifying += 1;
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
    const rolling = rollingE1RMBySession(filtered);
    let cumQual = 0;
    return Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => {
        const baseline = baselineAt(exercise!, s.date);
        const roll = rolling.get(`${s.date}::${exercise}`) ?? 0;
        cumQual += s.qualifying;
        return {
        date: s.date,
        label: format(parseISO(s.date), "MMM d", { locale: sv }),
        volume: Math.round(s.volume),
        maxWeight: Number(s.maxWeight.toFixed(1)),
        bestE1RM: Number(s.bestE1RM.toFixed(1)),
        baseline: baseline > 0 ? baseline : null,
        qualifying: s.qualifying,
        eaKoefficient:
          baseline > 0 && roll > 0 ? Number(((roll / baseline) * 100).toFixed(1)) : null,
        avgRPE: Number((s.rpeSum / s.sets).toFixed(2)),
        intensity:
          baseline > 0
            ? Number(((s.maxWeight / baseline) * 100).toFixed(1))
            : 0,
        };
      });
  }, [filtered, baselines, exercise, baselineHistoryQuery.data]);

  // Data coverage: qualifying sets (RPE ≥ 7) behind the latest 3-session average
  const coverage = useMemo(() => {
    const q = dailyStats.filter((d) => d.qualifying > 0).slice(-3);
    if (q.length === 0) return null;
    const sets = q.reduce((a, d) => a + d.qualifying, 0);
    const spanDays = Math.round(
      (parseISO(q[q.length - 1].date).getTime() - parseISO(q[0].date).getTime()) / 86400000,
    );
    return { sets, sessions: q.length, spanDays };
  }, [dailyStats]);

  const baselineChangeDates = useMemo(
    () =>
      (baselineHistoryQuery.data ?? [])
        .filter((r) => exercise && r.exercise.trim().toLowerCase() === exercise.toLowerCase())
        .map((r) => format(parseISO(r.recorded_at), "MMM d", { locale: sv }))
        .filter((lbl) => dailyStats.some((d) => d.label === lbl)),
    [baselineHistoryQuery.data, exercise, dailyStats],
  );

  const totals = useMemo(() => {
    const volume = dailyStats.reduce((acc, d) => acc + d.volume, 0);
    const maxWeight = dailyStats.reduce((acc, d) => Math.max(acc, d.maxWeight), 0);
    const peakE1RM = dailyStats.reduce((acc, d) => Math.max(acc, d.bestE1RM), 0);
    const peakEAk = dailyStats.reduce((acc, d) => Math.max(acc, d.eaKoefficient ?? 0), 0);
    return { volume, maxWeight, peakE1RM, peakEAk, sessions: dailyStats.length };
  }, [dailyStats]);

  // Baseline history series for selected exercise — shows coach-recorded
  // 1RM baseline changes over time (progression / regression).
  const baselineSeries = useMemo(() => {
    const rows = (baselineHistoryQuery.data ?? []).filter(
      (r) => exercise && r.exercise === exercise,
    );
    return rows.map((r) => ({
      date: r.recorded_at,
      label: format(parseISO(r.recorded_at), "MMM d, yyyy", { locale: sv }),
      one_rm_kg: r.one_rm_kg,
      note: r.note,
    }));
  }, [baselineHistoryQuery.data, exercise]);

  const baselineDelta = useMemo(() => {
    if (baselineSeries.length < 2) return null;
    const first = baselineSeries[0].one_rm_kg;
    const last = baselineSeries[baselineSeries.length - 1].one_rm_kg;
    return { abs: last - first, pct: ((last - first) / first) * 100 };
  }, [baselineSeries]);

  // Auto-flytande baseline: trögt — kräver minst 12 peak-pass (EAk ≥ 103 %)
  // sedan senaste baseline-ändringen innan den höjs.
  const queryClient = useQueryClient();
  const autoFloat = useServerFn(autoFloatBaselines);
  const [autoFloatPending, setAutoFloatPending] = useState(false);
  const [autoFloatResult, setAutoFloatResult] = useState<BaselineAutoResult | null>(null);

  async function handleAutoFloat() {
    setAutoFloatPending(true);
    try {
      const res = await autoFloat({ data: { athleteId } });
      setAutoFloatResult(res);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["analytics-baselines", athleteId] }),
        queryClient.invalidateQueries({ queryKey: ["analytics-baseline-history", athleteId] }),
      ]);
      if (res.updated.length === 0) {
        toast.info("Inga baslinjer behövde flyttas än.");
      } else {
        toast.success(
          `Flyttade ${res.updated.length} baseline${res.updated.length === 1 ? "" : "s"} (${res.updated.map((u) => `${u.exercise} ${u.oldBaseline}→${u.newBaseline} kg`).join(", ")})`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-uppdatering misslyckades");
    } finally {
      setAutoFloatPending(false);
    }
  }

  const formSeries = useMemo(
    () =>
      (surveysQuery.data ?? []).map((s) => ({
        date: s.date,
        label: format(parseISO(s.date), "MMM d", { locale: sv }),
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
      if (countsForEAk(l)) row[cat] = (row[cat] ?? 0) + 1;
      weeks.set(wk, row);
    }
    const data = Array.from(weeks.entries())
      .map(([wk, row]) => ({
        week: wk,
        label: format(parseISO(wk), "MMM d", { locale: sv }),
        ...Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, v]),
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
    const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const first: Record<string, number> = {};
    for (const [, row] of sorted)
      for (const [k, v] of Object.entries(row)) if (first[k] == null) first[k] = v;
    const data = sorted.map(([date, row]) => ({
      date,
      label: format(parseISO(date), "MMM d", { locale: sv }),
      ...Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, Number(((v / first[k]) * 100).toFixed(1))]),
      ),
    }));
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
    const rpeSeries: Array<{ date: string; label: string; target: number | null; actual: number | null; diff: number | null; diffAvg: number | null }> = [];
    const diffs: number[] = [];
    const allDates = Array.from(new Set([...targetAvgByDate.keys(), ...actualAvgByDate.keys()])).sort();
    for (const d of allDates) {
      const t = targetAvgByDate.get(d);
      const a = actualAvgByDate.get(d);
      rpeSeries.push({
        date: d,
        label: format(parseISO(d), "MMM d", { locale: sv }),
        target: t ? Number((t.sum / t.count).toFixed(2)) : null,
        actual: a ? Number((a.sum / a.count).toFixed(2)) : null,
        diff: null,
        diffAvg: null,
      });
      const row = rpeSeries[rpeSeries.length - 1];
      if (row.target != null && row.actual != null) {
        row.diff = Number((row.actual - row.target).toFixed(2));
        diffs.push(row.diff);
        const w = diffs.slice(-3);
        row.diffAvg = Number((w.reduce((x, y) => x + y, 0) / w.length).toFixed(2));
      }
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

  // ---- Rule-based deload flag ----
  const deloadFlag = useMemo(() => {
    // 1) EAk < 95 % two sessions in a row on any lift with a baseline
    const byEx = new Map<string, typeof allLogs>();
    for (const l of allLogs) {
      if (!lookupBaseline(l.exercise)) continue;
      const arr = byEx.get(l.exercise) ?? [];
      arr.push(l);
      byEx.set(l.exercise, arr);
    }
    const lowLifts: string[] = [];
    for (const [ex, logs] of byEx) {
      const rolling = rollingE1RMBySession(logs);
      const dates = [...new Set(logs.filter(countsForEAk).map((l) => l.date))].sort().slice(-2);
      if (dates.length < 2) continue;
      const low = dates.every((d) => {
        const b = baselineAt(ex, d);
        const r = rolling.get(`${d}::${ex}`) ?? 0;
        return b > 0 && (r / b) * 100 < 95;
      });
      if (low) lowLifts.push(ex);
    }
    // 2) RPE drift > +0.5 (avg of last 3 sessions)
    const lastDiff = [...adherence.rpeSeries].reverse().find((r) => r.diffAvg != null)?.diffAvg ?? null;
    const rpeHigh = lastDiff != null && lastDiff > 0.5;
    // 3) Latest fatigue above athlete's own average
    const surveys = (surveysQuery.data ?? []).filter((s) => s.fatigue != null);
    const avgFat = surveys.length ? surveys.reduce((a, s) => a + Number(s.fatigue), 0) / surveys.length : null;
    const latestFat = surveys.length ? Number(surveys[surveys.length - 1].fatigue) : null;
    const fatigueHigh = avgFat != null && latestFat != null && surveys.length >= 3 && latestFat > avgFat;
    return {
      lowLifts,
      eakLow: lowLifts.length > 0,
      rpeHigh,
      lastDiff,
      fatigueHigh,
      latestFat,
      avgFat,
      flag: lowLifts.length > 0 && rpeHigh && fatigueHigh,
    };
  }, [allLogs, adherence.rpeSeries, surveysQuery.data, baselines, baselineHistoryQuery.data]);

  // ---- Readiness vs performance ----
  const readinessScatter = useMemo(() => {
    // For each date with a survey, compute that day's average EAk% across all logged exercises
    const formByDate = new Map<string, { form: number; fatigue: number }>();
    for (const s of surveysQuery.data ?? []) {
      formByDate.set(s.date, { form: s.daily_form, fatigue: s.fatigue });
    }
    // Same-day EAk (not the rolling average — that would lag behind the
    // check-in): best qualifying E1RM per lift that day ÷ baseline in force.
    const bestByDayEx = new Map<string, number>();
    for (const l of allLogs) {
      if (!countsForEAk(l)) continue;
      const k = `${l.date}::${l.exercise}`;
      bestByDayEx.set(k, Math.max(bestByDayEx.get(k) ?? 0, dailyE1RM(l)));
    }
    const eakByDate = new Map<string, { sum: number; count: number }>();
    for (const [k, e1] of bestByDayEx) {
      const [date, ex] = k.split("::");
      const baseline = baselineAt(ex, date);
      if (!baseline || baseline <= 0) continue;
      const cur = eakByDate.get(date) ?? { sum: 0, count: 0 };
      cur.sum += (e1 / baseline) * 100;
      cur.count += 1;
      eakByDate.set(date, cur);
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
    if (points.length >= 5) {
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
  }, [surveysQuery.data, allLogs, baselines, baselineHistoryQuery.data]);

  // ---- Endurance ----
  const enduranceData = enduranceQuery.data?.sessions ?? [];
  const runStepsData = enduranceQuery.data?.runSteps ?? [];
  const enduranceStats = useMemo(() => {
    const completed = enduranceData.filter((s) => s.status === "completed" || s.duration_s > 0 || s.distance_m > 0);

    // Per-session series (sorted by date)
    const series = completed.map((s) => {
      const km = s.distance_m / 1000;
      const min = s.duration_s / 60;
      const paceSecPerKm = km > 0 && s.duration_s > 0 ? s.duration_s / km : null;
      return {
        date: s.date,
        dateMs: parseISO(s.date).getTime(),
        label: format(parseISO(s.date), "MMM d", { locale: sv }),
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

    // --- This week, per day (Mon-Sun) ---
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const dailyThisWeek = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      const iso = format(d, "yyyy-MM-dd");
      return {
        date: iso,
        label: format(d, "EEE"),
        min_easy: 0,
        min_mod: 0,
        min_hard: 0,
        min_max: 0,
        totalMin: 0,
        rpeSum: 0,
        rpeCount: 0,
        avgRPE: null as number | null,
        sessions: 0,
      };
    });
    for (const s of completed) {
      const day = dailyThisWeek.find((d) => d.date === s.date);
      if (!day) continue;
      const min = s.duration_s / 60;
      day.totalMin += min;
      day.sessions += 1;
      const rpe = s.rpe;
      if (rpe != null) {
        day.rpeSum += rpe;
        day.rpeCount += 1;
        if (rpe <= 4) day.min_easy += min;
        else if (rpe <= 6) day.min_mod += min;
        else if (rpe <= 8) day.min_hard += min;
        else day.min_max += min;
      } else {
        day.min_mod += min; // unknown RPE -> moderate bucket
      }
    }
    for (const d of dailyThisWeek) {
      d.totalMin = Math.round(d.totalMin);
      d.min_easy = Math.round(d.min_easy);
      d.min_mod = Math.round(d.min_mod);
      d.min_hard = Math.round(d.min_hard);
      d.min_max = Math.round(d.min_max);
      d.avgRPE = d.rpeCount > 0 ? Number((d.rpeSum / d.rpeCount).toFixed(1)) : null;
    }

    // --- Per-session scatter, grouped by RPE band ---
    const scatterByBand: Record<string, typeof series> = { easy: [], mod: [], hard: [], max: [], none: [] };
    for (const p of series) {
      if (p.km <= 0) continue; // scatter is distance vs date, skip non-distance sessions
      const r = p.rpe;
      const id = r == null ? "none" : r <= 4 ? "easy" : r <= 6 ? "mod" : r <= 8 ? "hard" : "max";
      scatterByBand[id].push(p);
    }

    // --- Run pace by RPE band (from sampled step intervals; falls back to session totals) ---
    type PaceBucket = { sec: number; m: number; samples: number };
    const empty = (): PaceBucket => ({ sec: 0, m: 0, samples: 0 });
    const paceAgg: Record<string, PaceBucket> = { easy: empty(), mod: empty(), hard: empty(), max: empty() };
    const bandOf = (r: number) => (r <= 4 ? "easy" : r <= 6 ? "mod" : r <= 8 ? "hard" : "max");

    if (runStepsData.length > 0) {
      // Use interval samples — much more accurate when a workout mixes intensities
      for (const st of runStepsData) {
        const id = bandOf(st.rpe);
        paceAgg[id].sec += st.sec;
        paceAgg[id].m += st.m;
        paceAgg[id].samples += 1;
      }
    } else {
      // Fallback: whole-session avg when no step data exists
      for (const s of completed) {
        if (s.discipline !== "run") continue;
        if (s.distance_m <= 0 || s.duration_s <= 0 || s.rpe == null) continue;
        const id = bandOf(s.rpe);
        paceAgg[id].sec += s.duration_s;
        paceAgg[id].m += s.distance_m;
        paceAgg[id].samples += 1;
      }
    }
    const paceByBand = (["easy", "mod", "hard", "max"] as const).map((id) => {
      const b = paceAgg[id];
      const km = b.m / 1000;
      const paceSec = km > 0 ? b.sec / km : null;
      return {
        id,
        label: id === "easy" ? "Lätt (1–4)" : id === "mod" ? "Måttligt (5–6)" : id === "hard" ? "Hårt (7–8)" : "Max (9–10)",
        fill: BAND_COLORS[id],
        sessions: b.samples,
        km,
        paceLabel: paceSec ? `${Math.floor(paceSec / 60)}:${String(Math.round(paceSec % 60)).padStart(2, "0")}/km` : null,
      };
    });

    // --- Weekly run pace per individual RPE (1..10) + "no RPE" ---
    const rpeKeys = ["r1","r2","r3","r4","r5","r6","r7","r8","r9","r10","none"] as const;
    type RpeKey = typeof rpeKeys[number];
    const emptyRpeAgg = (): Record<RpeKey, PaceBucket> => ({
      r1: empty(), r2: empty(), r3: empty(), r4: empty(), r5: empty(),
      r6: empty(), r7: empty(), r8: empty(), r9: empty(), r10: empty(), none: empty(),
    });
    const keyOfRpe = (r: number | null | undefined): RpeKey => {
      if (r == null) return "none";
      const rounded = Math.max(1, Math.min(10, Math.round(r)));
      return (`r${rounded}` as RpeKey);
    };
    const paceWeekMap = new Map<string, { week: string; label: string; agg: Record<RpeKey, PaceBucket> }>();
    const stepSource: Array<{ date: string; sec: number; m: number; rpe: number | null }> = runStepsData.length > 0
      ? runStepsData
      : completed
          .filter((s) => s.discipline === "run" && s.distance_m > 0 && s.duration_s > 0)
          .map((s) => ({ date: s.date, sec: s.duration_s, m: s.distance_m, rpe: s.rpe }));
    for (const st of stepSource) {
      const wk = format(startOfWeek(parseISO(st.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const row = paceWeekMap.get(wk) ?? {
        week: wk,
        label: format(parseISO(wk), "MMM d", { locale: sv }),
        agg: emptyRpeAgg(),
      };
      const id = keyOfRpe(st.rpe);
      row.agg[id].sec += st.sec;
      row.agg[id].m += st.m;
      row.agg[id].samples += 1;
      paceWeekMap.set(wk, row);
    }
    const paceByRpeWeekly = Array.from(paceWeekMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => {
        const row: Record<string, number | string | null> = { week: w.week, label: w.label };
        for (const k of rpeKeys) {
          const b = w.agg[k];
          row[k] = b.m > 0 ? Number((b.sec / (b.m / 1000)).toFixed(1)) : null;
        }
        return row;
      });
    const paceSampledFromSteps = runStepsData.length > 0;



    // Weekly aggregates (per discipline + per RPE band)
    const weekMap = new Map<string, { week: string; label: string; distance: Record<string, number>; minutes: Record<string, number>; band: Record<string, number>; rpeSum: number; rpeCount: number; sessions: number }>();
    const disciplines = new Set<string>();
    for (const s of completed) {
      const wk = format(startOfWeek(parseISO(s.date), { weekStartsOn: 1 }), "yyyy-MM-dd");
      disciplines.add(s.discipline);
      const row = weekMap.get(wk) ?? { week: wk, label: format(parseISO(wk), "MMM d", { locale: sv }), distance: {}, minutes: {}, band: { easy: 0, mod: 0, hard: 0, max: 0 }, rpeSum: 0, rpeCount: 0, sessions: 0 };
      row.distance[s.discipline] = (row.distance[s.discipline] ?? 0) + s.distance_m / 1000;
      const min = s.duration_s / 60;
      row.minutes[s.discipline] = (row.minutes[s.discipline] ?? 0) + min;
      const r = s.rpe;
      const bandId = r == null ? "mod" : r <= 4 ? "easy" : r <= 6 ? "mod" : r <= 8 ? "hard" : "max";
      row.band[bandId] += min;
      if (s.rpe != null) { row.rpeSum += s.rpe; row.rpeCount += 1; }
      row.sessions += 1;
      weekMap.set(wk, row);
    }
    const weekly = Array.from(weekMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => {
        const flat: Record<string, number | string> = {
          week: w.week,
          label: w.label,
          sessions: w.sessions,
          avgRPE: w.rpeCount > 0 ? Number((w.rpeSum / w.rpeCount).toFixed(2)) : 0,
          min_easy: Math.round(w.band.easy),
          min_mod: Math.round(w.band.mod),
          min_hard: Math.round(w.band.hard),
          min_max: Math.round(w.band.max),
        };
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
      dailyThisWeek,
      scatterByBand,
      paceByBand,
      paceByRpeWeekly,
      paceSampledFromSteps,
      disciplines: Array.from(disciplines).sort(),
      totals: {
        sessions: completed.length,
        totalKm,
        totalMin,
        avgRPE,
        avgRunPace,
      },
    };
  }, [enduranceData, runStepsData]);


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
              <SelectItem value="30">Senaste 30 dagarna</SelectItem>
              <SelectItem value="60">Senaste 60 dagarna</SelectItem>
              <SelectItem value="90">Senaste 90 dagarna</SelectItem>
              <SelectItem value="180">Senaste 180 dagarna</SelectItem>
              <SelectItem value="365">Senaste 365 dagarna</SelectItem>
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
            Exportera CSV
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Laddar…
          </CardContent>
        </Card>
      )}

      {!isLoading && (
        <Card className={cn(deloadFlag.flag && "border-destructive")}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span className="font-semibold">
                {deloadFlag.flag ? "Överväg deload" : "Inga varningsflaggor"}
              </span>
              {deloadFlag.flag && <Badge variant="destructive">Flagga</Badge>}
            </div>
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
              <li className={cn(deloadFlag.eakLow && "font-medium text-destructive")}>
                {deloadFlag.eakLow ? "✗" : "✓"} EAk &lt; 95 % två pass i rad
                {deloadFlag.eakLow ? ` (${deloadFlag.lowLifts.join(", ")})` : ""}
              </li>
              <li className={cn(deloadFlag.rpeHigh && "font-medium text-destructive")}>
                {deloadFlag.rpeHigh ? "✗" : "✓"} RPE-avvikelse &gt; +0,5
                {deloadFlag.lastDiff != null ? ` (${deloadFlag.lastDiff >= 0 ? "+" : ""}${deloadFlag.lastDiff.toFixed(1)})` : " (ingen plan)"}
              </li>
              <li className={cn(deloadFlag.fatigueHigh && "font-medium text-destructive")}>
                {deloadFlag.fatigueHigh ? "✗" : "✓"} Trötthet över eget snitt
                {deloadFlag.latestFat != null && deloadFlag.avgFat != null ? ` (${deloadFlag.latestFat} mot ${deloadFlag.avgFat.toFixed(1)})` : ""}
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {!isLoading && (
        <Tabs
          className="min-w-0"
          value={tab}
          onValueChange={(v) =>
            navigate({ search: (prev) => ({ ...prev, tab: v as typeof tab }) })
          }
        >
          <TabsList aria-label="Analysområden" className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 [&>button]:min-h-9 [&>button]:min-w-0 [&>button]:px-2">
            <TabsTrigger value="exercise"><Dumbbell className="mr-1 h-3.5 w-3.5" />Övning</TabsTrigger>
            <TabsTrigger value="volume"><TrendingUp className="mr-1 h-3.5 w-3.5" />Volym</TabsTrigger>
            <TabsTrigger value="endurance"><Footprints className="mr-1 h-3.5 w-3.5" />Kondition</TabsTrigger>
            <TabsTrigger value="adherence"><CalendarCheck className="mr-1 h-3.5 w-3.5" />Följsamhet</TabsTrigger>
            <TabsTrigger value="readiness"><Heart className="mr-1 h-3.5 w-3.5" />Dagsform</TabsTrigger>
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
                  <SelectValue placeholder="Välj övning" />
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
                  Inga träningsloggar i vald period.
                </CardContent>
              </Card>
            )}

            {exercise && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard icon={<Dumbbell className="h-4 w-4" />} label="Total volym" value={`${(totals.volume / 1000).toFixed(1)}t`} hint={`${totals.sessions} pass`} />
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Maxvikt" value={`${totals.maxWeight} kg`} />
                  <KpiCard icon={<Activity className="h-4 w-4" />} label="Högsta E1RM" value={`${totals.peakE1RM.toFixed(1)} kg`} />
                  <KpiCard icon={<Gauge className="h-4 w-4" />} label="Högsta EAk" value={totals.peakEAk > 0 ? `${totals.peakEAk.toFixed(0)}%` : "—"} hint={lookupBaseline(exercise) ? `Baslinje: ${lookupBaseline(exercise)} kg` : "Ingen baslinje"} />
                </div>

                <ChartCard
                  title="E1RM & EAk över tid"
                  description={lookupBaseline(exercise) ? "Bästa dags-E1RM, baslinjen som gällde (steglinje) och EAk % (snitt 3 pass). Streckade lodlinjer = baslinjebyte." : "Bästa dags-E1RM. Sätt en baslinje för att se EAk %."}
                >
                  {coverage && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Datatäckning: {coverage.sets} kvalificerande set (RPE ≥ 7) över {coverage.sessions} pass
                      {coverage.spanDays > 0 ? ` · ${coverage.spanDays} dagar` : ""}
                      {coverage.spanDays > 14 ? " — snittet släpar efter" : ""}
                    </p>
                  )}
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis yAxisId="left" domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin - 5)), (dataMax: number) => Math.ceil(dataMax + 5)]} stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="bestE1RM" name="Bästa E1RM (kg)" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                      <Line yAxisId="left" type="stepAfter" dataKey="baseline" name="Baslinje (kg)" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                      {baselineChangeDates.map((lbl) => (
                        <ReferenceLine key={lbl} yAxisId="left" x={lbl} stroke="var(--chart-3)" strokeDasharray="2 4" label={{ value: "Ny baslinje", fontSize: 10, fill: "var(--muted-foreground)", position: "insideTop" }} />
                      ))}
                      {lookupBaseline(exercise) > 0 && (
                        <Line yAxisId="right" type="monotone" dataKey="eaKoefficient" name="EAkoeff % (3 pass)" stroke="var(--accent-foreground)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Baslinje"
                  description={
                    baselineSeries.length === 0
                      ? "Inga baslinjebyten registrerade för lyftet än. Uppdatera baslinjen på atletsidan för att följa utvecklingen."
                      : baselineDelta
                        ? `${baselineSeries.length} byte${baselineSeries.length === 1 ? "" : "n"} · ${baselineDelta.abs >= 0 ? "+" : ""}${baselineDelta.abs.toFixed(1)} kg (${baselineDelta.pct >= 0 ? "+" : ""}${baselineDelta.pct.toFixed(1)}%) sedan första registreringen.`
                        : "En baslinje registrerad."
                  }
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Automatisk baslinje</p>
                      <p>Höjer baseline när atleten har ≥ 12 set-1-pass med EAk ≥ 103 % efter senaste ändringen. Trögt — påverkas inte av enstaka topp-pass.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAutoFloat}
                      disabled={autoFloatPending}
                    >
                      {autoFloatPending ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-3.5 w-3.5" />
                      )}
                      Kör auto-uppdatering
                    </Button>
                  </div>
                  {autoFloatResult && (
                    <div className="mb-3 space-y-1 text-xs">
                      {autoFloatResult.updated.length > 0 && (
                        <ul className="space-y-0.5">
                          {autoFloatResult.updated.map((u) => (
                            <li key={u.exercise} className="text-status-adapting-foreground">
                              ✓ {u.exercise}: {u.oldBaseline} → <b>{u.newBaseline} kg</b> ({u.peakCount} toppar, median-E1RM {u.medianPeakE1RM} kg)
                            </li>
                          ))}
                        </ul>
                      )}
                      {autoFloatResult.skipped.filter((s) => s.peakCount > 0).length > 0 && (
                        <ul className="space-y-0.5 text-muted-foreground">
                          {autoFloatResult.skipped
                            .filter((s) => s.peakCount > 0)
                            .map((s) => (
                              <li key={s.exercise}>
                                · {s.exercise}: {s.peakCount}/{autoFloatResult.threshold} peaks
                                {s.reason === "no_improvement" ? " (ingen förbättring)" : ""}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}
                </ChartCard>

                <ChartCard title="Volym per pass" description="Total tonnage (reps × vikt) per träningsdag.">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                      <Bar dataKey="volume" name="Volym (kg)" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {multiLiftSeries.lifts.length > 1 && (
                  <ChartCard title="Topplyften — utveckling i takt" description="Bästa dags-E1RM som index (första passet i perioden = 100), så lyften kan jämföras oavsett vikt.">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={multiLiftSeries.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={[(dataMin: number) => Math.floor(dataMin - 3), (dataMax: number) => Math.ceil(dataMax + 3)]} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                        <Legend />
                        <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
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
                <CardTitle className="text-base">Hårda set per vecka och kategori</CardTitle>
                <CardDescription>
                  Antal set med RPE ≥ 7 per vecka, grupperat per övningskategori. Samma tröskel som EAk — rättvist mellan tunga och lätta lyft.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {volumeByCategory.data.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Ingen data i perioden.</div>
                ) : (
                  <WeekWindow data={volumeByCategory.data}>
                    {(slice) => (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={slice}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                          <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
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
                  </WeekWindow>
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
                      <div className="mt-1 text-2xl font-bold">{total} set</div>
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
                  <KpiCard icon={<Footprints className="h-4 w-4" />} label="Pass" value={String(enduranceStats.totals.sessions)} hint={enduranceStats.disciplines.join(", ")} />
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Total distans" value={`${enduranceStats.totals.totalKm.toFixed(1)} km`} />
                  <KpiCard icon={<Activity className="h-4 w-4" />} label="Total tid" value={`${Math.floor(enduranceStats.totals.totalMin / 60)}h ${Math.round(enduranceStats.totals.totalMin % 60)}m`} />
                  <KpiCard
                    icon={<Gauge className="h-4 w-4" />}
                    label="Snittempo löpning"
                    value={
                      enduranceStats.totals.avgRunPace
                        ? `${Math.floor(enduranceStats.totals.avgRunPace / 60)}:${String(Math.round(enduranceStats.totals.avgRunPace % 60)).padStart(2, "0")}/km`
                        : "—"
                    }
                    hint={enduranceStats.totals.avgRPE != null ? `Avg RPE ${enduranceStats.totals.avgRPE.toFixed(1)}` : undefined}
                  />
                </div>

                <ChartCard title="Veckodistans per gren" description="Totalt antal km per vecka, uppdelat på löpning / cykel / simning.">
                  <WeekWindow data={enduranceStats.weekly}>
                    {(slice) => (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={slice}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                          <YAxis stroke="var(--muted-foreground)" fontSize={11} unit=" km" />
                          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                          <Legend />
                          {enduranceStats.disciplines.map((d, i) => (
                            <Bar key={d} dataKey={`km_${d}`} stackId="km" name={d} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </WeekWindow>
                </ChartCard>

                <ChartCard
                  title="Veckominuter per intensitet"
                  description="Staplarna visar tid i varje RPE-zon per vecka. Linjen visar veckans snitt-RPE per pass."
                >
                  <WeekWindow data={enduranceStats.weekly}>
                    {(slice) => (
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={slice} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                          <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} unit=" min" />
                          <YAxis yAxisId="right" orientation="right" domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={11} />
                          <Tooltip
                            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                            formatter={(value: number, name: string) => {
                              if (name === "Snitt-RPE") return [Number(value).toFixed(1), name];
                              return [`${Math.round(Number(value))} min`, name];
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar yAxisId="left" dataKey="min_easy" stackId="d" name="Lätt (1–4)" fill={BAND_COLORS.easy} />
                          <Bar yAxisId="left" dataKey="min_mod" stackId="d" name="Måttligt (5–6)" fill={BAND_COLORS.mod} />
                          <Bar yAxisId="left" dataKey="min_hard" stackId="d" name="Hårt (7–8)" fill={BAND_COLORS.hard} />
                          <Bar yAxisId="left" dataKey="min_max" stackId="d" name="Max (9–10)" fill={BAND_COLORS.max} radius={[6, 6, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="avgRPE" name="Snitt-RPE" stroke={BAND_ACCENT} strokeWidth={2.5} dot={{ r: 4, fill: BAND_ACCENT, stroke: "var(--card)", strokeWidth: 1.5 }} connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </WeekWindow>
                </ChartCard>


                <ChartCard
                  title="Löptempo per intensitet"
                  description={
                    enduranceStats.paceSampledFromSteps
                      ? "Hämtat från passens intervaller — ett tempoblock 6×1 km på RPE 8 räknas som Hårt, inte blandat med uppvärmning. Tempo och km per RPE-zon över hela perioden."
                      : "Snittempo och total volym per RPE-zon över hela perioden. (Inga intervalldata hittades — använder snitt för hela passet.)"
                  }
                >
                  {enduranceStats.paceByBand.every((b) => b.sessions === 0) ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Inga löppass med RPE i perioden.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {enduranceStats.paceByBand.map((b) => (
                        <div key={b.id} className="rounded-lg border border-border bg-muted/20 p-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.fill }} />
                            <span>{b.label}</span>
                          </div>
                          <div className="mt-1 text-2xl font-bold tracking-tight">{b.paceLabel ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {b.sessions} {enduranceStats.paceSampledFromSteps ? (b.sessions === 1 ? "interval" : "intervals") : (b.sessions === 1 ? "run" : "runs")} · {b.km.toFixed(1)} km
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ChartCard>

                <ChartCard
                  title="Löptempo per intensitet — veckotrend"
                  description="Snittempo per RPE (1–10, plus pass utan RPE) per vecka. Se om lugnt tempo, tempo och tröskel förbättras över tid."
                >
                  {enduranceStats.paceByRpeWeekly.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Inga löppass i perioden.</p>
                  ) : (
                    <WeekWindow data={enduranceStats.paceByRpeWeekly}>
                      {(slice) => (
                        <ResponsiveContainer width="100%" height={320}>
                          <LineChart data={slice} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                            <YAxis
                              stroke="var(--muted-foreground)"
                              fontSize={11}
                              reversed
                              domain={["auto", "auto"]}
                              tickFormatter={(v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`}
                              label={{ value: "min/km (lower = faster)", angle: -90, position: "insideLeft", fontSize: 10, fill: "var(--muted-foreground)" }}
                            />
                            <Tooltip
                              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                              formatter={(value, name) => {
                                if (value == null) return ["—", String(name)];
                                const v = Number(value);
                                if (!Number.isFinite(v)) return ["—", String(name)];
                                return [`${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}/km`, String(name)];
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {([
                              { key: "r1", label: "RPE 1", color: "oklch(0.72 0.15 155)" },
                              { key: "r2", label: "RPE 2", color: "oklch(0.74 0.16 135)" },
                              { key: "r3", label: "RPE 3", color: "oklch(0.76 0.16 115)" },
                              { key: "r4", label: "RPE 4", color: "oklch(0.78 0.16 95)" },
                              { key: "r5", label: "RPE 5", color: "oklch(0.78 0.17 80)" },
                              { key: "r6", label: "RPE 6", color: "oklch(0.74 0.18 60)" },
                              { key: "r7", label: "RPE 7", color: "oklch(0.70 0.19 45)" },
                              { key: "r8", label: "RPE 8", color: "oklch(0.64 0.21 30)" },
                              { key: "r9", label: "RPE 9", color: "oklch(0.58 0.23 18)" },
                              { key: "r10", label: "RPE 10", color: "oklch(0.50 0.25 8)" },
                              { key: "none", label: "Ingen RPE", color: "oklch(0.65 0.02 270)" },
                            ] as const).map((s) => (
                              <Line
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.label}
                                stroke={s.color}
                                strokeWidth={1.75}
                                dot={{ r: 2.5 }}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </WeekWindow>
                  )}
                </ChartCard>


                <ChartCard
                  title="Intensitet mot distans per pass"
                  description="Varje punkt är ett pass — bara dagar med loggade pass visas. Bläddra 30 dagar i taget med pilarna."
                >
                  <SessionScatterWindow series={enduranceStats.series} scatterByBand={enduranceStats.scatterByBand} />
                </ChartCard>


                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Senaste passen</CardTitle>
                    <CardDescription>De 15 senaste genomförda konditionspassen med tempo och puls.</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Datum</th>
                          <th className="px-2 py-2 text-left">Typ</th>
                          <th className="px-2 py-2 text-left">Titel</th>
                          <th className="px-2 py-2 text-right">Distans</th>
                          <th className="px-2 py-2 text-right">Tid</th>
                          <th className="px-2 py-2 text-right">Tempo</th>
                          <th className="px-2 py-2 text-right">RPE</th>
                          <th className="px-2 py-2 text-right">Snittpuls</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...enduranceStats.series].reverse().slice(0, 15).map((s, idx) => (
                          <tr key={`${s.date}-${idx}`} className="border-t border-border">
                            <td className="px-3 py-2 font-medium">{format(parseISO(s.date), "EEE MMM d", { locale: sv })}</td>
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
              <KpiCard icon={<Target className="h-4 w-4" />} label="Följsamhet" value={adherence.adherencePct != null ? `${adherence.adherencePct}%` : "—"} hint={`${adherence.completed}/${adherence.planned} planerade pass`} />
              <KpiCard icon={<CalendarCheck className="h-4 w-4" />} label="Genomförda" value={String(adherence.completed)} />
              <KpiCard icon={<Activity className="h-4 w-4" />} label="Missade" value={String(adherence.missed)} hint={adherence.missed > 0 ? "See list below" : "Clean record"} />
              <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Svit" value={`${adherence.streak} days`} hint="Genomförda planerade dagar i rad" />
            </div>

            {adherence.planned === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No published planned sessions in this window. Publish a week in a mesocycle to track adherence.
                </CardContent>
              </Card>
            ) : (
              <>
                <ChartCard title="RPE-avvikelse (faktisk − mål)" description="Per pass, med rullande snitt över 3 pass. Över +1 = passen blir tyngre än planerat.">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={adherence.rpeSeries.filter((r) => r.diff != null)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis domain={[(m: number) => Math.min(-1, Math.floor(m)), (m: number) => Math.max(2, Math.ceil(m))]} stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                      <Legend />
                      <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                      <ReferenceLine y={1} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: "+1", fontSize: 10, fill: "var(--muted-foreground)", position: "right" }} />
                      <Bar dataKey="diff" name="Avvikelse" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="diffAvg" name="Snitt 3 pass" stroke="var(--accent-foreground)" strokeWidth={2} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                {adherence.missedDates.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Nyligen missade pass</CardTitle>
                      <CardDescription>Planerade dagar utan loggad träning.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {adherence.missedDates.map((d) => (
                          <Badge key={d} variant="destructive">
                            {format(parseISO(d), "EEE MMM d", { locale: sv })}
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
                label="Förutsäger incheckningen dagens EAk?"
                value={readinessScatter.correlation != null ? readinessScatter.correlation.toFixed(2) : "—"}
                hint={
                  readinessScatter.correlation == null
                    ? "Kräver minst 5 dagar med både incheckning och pass"
                    : `r = ${readinessScatter.correlation.toFixed(2)}, n = ${readinessScatter.points.length}${readinessScatter.points.length < 15 ? " — osäkert, lite data" : ""} · ` +
                      (readinessScatter.correlation > 0.3
                      ? "Dagsformen förutsäger prestationen"
                      : readinessScatter.correlation < -0.3
                        ? "Omvänt samband"
                        : "Svagt eller inget samband")
                }
              />
              <KpiCard icon={<Activity className="h-4 w-4" />} label="Incheckningar" value={String(formSeries.length)} />
              <KpiCard icon={<Gauge className="h-4 w-4" />} label="Parade datapunkter" value={String(readinessScatter.points.length)} hint="Dagar med både incheckning och lyft" />
            </div>

            {readinessScatter.points.length < 30 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Spridningsdiagrammet visas när det finns minst 30 dagar med både incheckning och pass ({readinessScatter.points.length} hittills). Tills dess räcker korrelationsvärdet ovan.
                </CardContent>
              </Card>
            ) : (
              <ChartCard
                title="Dagsform mot dagens EAk"
                description="Varje punkt är en dag. X = självskattad dagsform (1–10), Y = snitt-EAk % samma dag (dagens egna set, inte treppassnittet)."
              >
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 12, right: 24, bottom: 28, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis
                      type="number"
                      dataKey="form"
                      name="Dagsform"
                      domain={[1, 10]}
                      ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                      stroke="var(--foreground)"
                      tick={{ fill: "var(--foreground)", fontSize: 11 }}
                      label={{ value: "Daily form (1–10)", position: "insideBottom", offset: -16, fill: "var(--muted-foreground)", fontSize: 12 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="eak"
                      name="EAk %"
                      stroke="var(--foreground)"
                      tick={{ fill: "var(--foreground)", fontSize: 11 }}
                      label={{ value: "EAkoefficient %", angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 12 }}
                    />
                    <ZAxis range={[110, 110]} />
                    <Tooltip
                      cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.35)",
                      }}
                      labelStyle={{ color: "var(--popover-foreground)" }}
                      itemStyle={{ color: "var(--popover-foreground)" }}
                      formatter={(value, name) => [value, name]}
                    />
                    <ReferenceLine
                      y={100}
                      stroke="var(--chart-2)"
                      strokeOpacity={0.8}
                      strokeDasharray="4 4"
                      label={{ value: "Baseline 100%", fill: "var(--chart-2)", fontSize: 11, position: "insideTopRight" }}
                    />
                    <Scatter
                      data={readinessScatter.points}
                      fill="var(--chart-1)"
                      fillOpacity={0.85}
                      stroke="var(--background)"
                      strokeWidth={1.5}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {formSeries.length > 0 && (
              <ChartCard title="Trender i incheckningen" description="Alla självskattade värden från atletens incheckning före passet (1–10).">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={formSeries} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis domain={[1, 10]} stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }} />
                    <Legend wrapperStyle={{ paddingTop: 8 }} iconType="line" />
                    <Line type="monotone" dataKey="daily_form" name="Dagsform" stroke="var(--chart-1)" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="fatigue" name="Trötthet" stroke="var(--destructive)" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="sleep_quality" name="Sömnkvalitet" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="nutrition" name="Kost" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="stiffness" name="Stelhet" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="work_stress" name="Jobbstress" stroke="var(--chart-5)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    <Line type="monotone" dataKey="life_stress" name="Livsstress" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {formSeries.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Incheckning dag för dag</CardTitle>
                  <CardDescription>Färgade celler markerar låga värden — snabb överblick över dagarna.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Datum</th>
                        <th className="px-2 py-2 text-center">Dagsform</th>
                        <th className="px-2 py-2 text-center">Sömnkval.</th>
                        <th className="px-2 py-2 text-center">Sömn h</th>
                        <th className="px-2 py-2 text-center">Kost</th>
                        <th className="px-2 py-2 text-center">Stelhet</th>
                        <th className="px-2 py-2 text-center">Trötthet</th>
                        <th className="px-2 py-2 text-center">Jobb</th>
                        <th className="px-2 py-2 text-center">Livet</th>
                        <th className="px-2 py-2 text-center">Kroppsvikt kg</th>
                        <th className="px-3 py-2 text-left">Anteckningar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...formSeries].reverse().map((s) => (
                        <tr key={s.date} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{format(parseISO(s.date), "EEE MMM d", { locale: sv })}</td>
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

interface SessionPoint {
  date: string;
  dateMs: number;
  discipline: string;
  title?: string | null;
  km: number;
  minutes: number;
  pace_label?: string | null;
  rpe?: number | null;
}

function SessionScatterWindow({
  series,
  scatterByBand,
}: {
  series: SessionPoint[];
  scatterByBand: Record<"easy" | "mod" | "hard" | "max" | "none", SessionPoint[]>;
}) {
  const SIZE = 30;
  const [offset, setOffset] = useState(0);

  // Unique dates that actually have sessions, sorted ascending
  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    for (const p of series) set.add(p.date);
    return Array.from(set).sort();
  }, [series]);

  const total = uniqueDates.length;
  const maxOffset = Math.max(0, total - SIZE);
  const safeOffset = Math.min(offset, maxOffset);
  const end = total - safeOffset;
  const start = Math.max(0, end - SIZE);
  const windowDates = uniqueDates.slice(start, end);
  const windowSet = new Set(windowDates);

  const filtered = {
    easy: scatterByBand.easy.filter((p) => windowSet.has(p.date)),
    mod: scatterByBand.mod.filter((p) => windowSet.has(p.date)),
    hard: scatterByBand.hard.filter((p) => windowSet.has(p.date)),
    max: scatterByBand.max.filter((p) => windowSet.has(p.date)),
    none: scatterByBand.none.filter((p) => windowSet.has(p.date)),
  };

  const canNewer = safeOffset > 0;
  const canOlder = start > 0;
  const showPager = total > SIZE;

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Inga pass i perioden.</p>;
  }

  return (
    <div className="space-y-2">
      {showPager && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Days {start + 1}–{end} of {total}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={!canOlder} onClick={() => setOffset((o) => Math.min(maxOffset, o + SIZE))} aria-label="Äldre dagar">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={!canNewer} onClick={() => setOffset((o) => Math.max(0, o - SIZE))} aria-label="Nyare dagar">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            type="category"
            allowDuplicatedCategory={false}
            ticks={windowDates}
            domain={windowDates}
            tickFormatter={(v: string) => format(parseISO(v), "MMM d", { locale: sv })}
            stroke="var(--muted-foreground)"
            fontSize={11}
            interval="preserveStartEnd"
          />
          <YAxis dataKey="km" type="number" stroke="var(--muted-foreground)" fontSize={11} unit=" km" />
          <ZAxis dataKey="minutes" type="number" range={[60, 400]} name="Minuter" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload as SessionPoint;
              return (
                <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="font-semibold">{format(parseISO(p.date), "EEE MMM d", { locale: sv })}</div>
                  <div className="capitalize text-muted-foreground">{p.discipline}{p.title ? ` · ${p.title}` : ""}</div>
                  <div className="mt-1">{p.km.toFixed(2)} km · {Math.round(p.minutes)} min</div>
                  {p.pace_label && <div>Pace {p.pace_label}</div>}
                  {p.rpe != null && <div>RPE {p.rpe.toFixed(1)}</div>}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Scatter name="Lätt (1–4)" data={filtered.easy} fill={BAND_COLORS.easy} />
          <Scatter name="Måttligt (5–6)" data={filtered.mod} fill={BAND_COLORS.mod} />
          <Scatter name="Hårt (7–8)" data={filtered.hard} fill={BAND_COLORS.hard} />
          <Scatter name="Max (9–10)" data={filtered.max} fill={BAND_COLORS.max} />
          <Scatter name="Ingen RPE" data={filtered.none} fill="var(--muted-foreground)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeekWindow<T>({
  data,
  size = 30,
  children,
}: {
  data: T[];
  size?: number;
  children: (slice: T[]) => React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const total = data.length;
  const maxOffset = Math.max(0, total - size);
  const safeOffset = Math.min(offset, maxOffset);
  const end = total - safeOffset;
  const start = Math.max(0, end - size);
  const raw = data.slice(start, end);

  // Always pad the slice to exactly `size` slots so axis spacing stays
  // constant — bars/lines never auto-stretch to fill the chart width.
  const padCount = Math.max(0, size - raw.length);
  const pad: T[] = Array.from({ length: padCount }, (_, i) => ({ label: ` `.repeat(i + 1) } as unknown as T));
  const slice = [...raw, ...pad];

  const canNewer = safeOffset > 0;
  const canOlder = start > 0;
  const showPager = total > size;

  return (
    <div className="space-y-2">
      {showPager && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            Weeks {start + 1}–{end} of {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={!canOlder}
            onClick={() => setOffset((o) => Math.min(maxOffset, o + size))}
            aria-label="Äldre veckor"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={!canNewer}
            onClick={() => setOffset((o) => Math.max(0, o - size))}
            aria-label="Nyare veckor"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {children(slice)}
    </div>
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
