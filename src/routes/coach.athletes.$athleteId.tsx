import { createFileRoute, Link, Outlet, useParams, useChildMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Save, TrendingDown, TrendingUp, Plus, Settings, Calendar, BarChart3, History, Activity, Trash2, Pencil } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  processLogs,
  readinessClasses,
  readinessLabel,
  volumeQualityClasses,
  volumeQualityLabel,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";
import { EnduranceSummaryCard } from "@/components/EnduranceSummary";
import { RpePaceEstimateCard } from "@/components/RpePaceEstimateCard";
import { MesocycleProgressCard } from "@/components/MesocycleProgressCard";
import { E1rmPrCard, RpePaceTrendCard } from "@/components/StrengthTrendCards";

const DEFAULT_EXERCISES = [
  "Knäböj",
  "Bänkpress",
  "Marklyft",
  "Axelpress",
  "Lår Curl",
];

export const Route = createFileRoute("/coach/athletes/$athleteId")({
  head: () => ({
    meta: [
      { title: "Athlete dashboard — EA Training System Coach" },
      { name: "description", content: "EAkoefficient analytics and programming for one athlete." },
    ],
  }),
  component: AthleteDetailPage,
});

function AthleteDetailPage() {
  const { athleteId } = useParams({ from: "/coach/athletes/$athleteId" });
  const childMatches = useChildMatches();
  const hasChild = childMatches.length > 0;
  const profileQuery = useQuery({
    queryKey: ["athlete-profile", athleteId],
    queryFn: async () => {
      // Defense in depth: confirm this athlete is linked to the current coach
      // before exposing their profile in the UI.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: link, error: linkErr } = await supabase
        .from("coach_athletes")
        .select("id")
        .eq("coach_id", user.id)
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (linkErr) throw linkErr;
      if (!link) throw new Error("This athlete is not linked to your account");
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, weight_class")
        .eq("id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (hasChild) return <Outlet />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/coach">
              <ArrowLeft className="mr-1 h-4 w-4" /> Roster
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {profileQuery.data?.full_name ?? "Athlete"}
          </h1>
          {profileQuery.data?.weight_class && (
            <p className="text-sm text-muted-foreground">
              Weight class: {profileQuery.data.weight_class}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link
              to="/coach/athletes/$athleteId/analytics"
              params={{ athleteId }}
            >
              <BarChart3 className="mr-1 h-4 w-4" /> Analytics
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              to="/coach/athletes/$athleteId/endurance"
              params={{ athleteId }}
            >
              <Activity className="mr-1 h-4 w-4" /> Endurance
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              to="/coach/athletes/$athleteId/calendar"
              params={{ athleteId }}
            >
              <Calendar className="mr-1 h-4 w-4" /> Calendar
            </Link>
          </Button>
          <Button asChild>
            <Link
              to="/coach/athletes/$athleteId/cycles"
              params={{ athleteId }}
            >
              <Calendar className="mr-1 h-4 w-4" /> Training program
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">EAkoefficient log</TabsTrigger>
          <TabsTrigger value="baselines">
            <Settings className="mr-1 h-3.5 w-3.5" /> Baselines
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <MesocycleProgressCard athleteId={athleteId} />
          <EnduranceSummaryCard athleteId={athleteId} />
          <div className="grid gap-4 md:grid-cols-2">
            <E1rmPrCard athleteId={athleteId} />
            <RpePaceTrendCard athleteId={athleteId} />
          </div>
          <RpePaceEstimateCard athleteId={athleteId} />
          <DashboardTable athleteId={athleteId} />
        </TabsContent>

        <TabsContent value="baselines">
          <BaselinesEditor athleteId={athleteId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTable({ athleteId }: { athleteId: string }) {
  const [exerciseFilter, setExerciseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const logsQuery = useQuery({
    queryKey: ["athlete-logs", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("id, date, exercise, variation, set_number, reps, weight_kg, rpe, edited_by_athlete_at, original_reps, original_rpe, created_at")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["athlete-baselines", athleteId],
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

  const qc = useQueryClient();
  const deleteSet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Set deleted");
      qc.invalidateQueries({ queryKey: ["athlete-logs", athleteId] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete set"),
  });

  const processed = useMemo(() => {
    const logs = logsQuery.data ?? [];
    const baselines = baselinesQuery.data ?? {};
    return processLogs(
      logs.map((l) => ({
        id: l.id,
        date: l.date,
        exercise: l.exercise,
        variation: l.variation,
        set_number: l.set_number,
        reps: l.reps,
        weight_kg: Number(l.weight_kg),
        rpe: Number(l.rpe),
      })),
      baselines,
    );
  }, [logsQuery.data, baselinesQuery.data]);

  const editsById = useMemo(() => {
    const map = new Map<string, { editedAt: string | null; origReps: number | null; origRpe: number | null }>();
    for (const l of logsQuery.data ?? []) {
      map.set(l.id, {
        editedAt: l.edited_by_athlete_at,
        origReps: l.original_reps,
        origRpe: l.original_rpe != null ? Number(l.original_rpe) : null,
      });
    }
    return map;
  }, [logsQuery.data]);

  const exercises = useMemo(
    () => Array.from(new Set(processed.map((p) => p.source.exercise))).sort(),
    [processed],
  );

  const filtered = useMemo(
    () =>
      processed.filter(
        (p) =>
          (exerciseFilter === "all" || p.source.exercise === exerciseFilter) &&
          (statusFilter === "all" || p.status === statusFilter),
      ),
    [processed, exerciseFilter, statusFilter],
  );

  const [windowKey, setWindowKey] = useState<"7d" | "30d" | "3m">("30d");
  const windowDays = windowKey === "7d" ? 7 : windowKey === "30d" ? 30 : 90;

  const summary = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const inWindow = processed.filter((p) => p.source.date >= cutoffIso);
    const withEak = inWindow.filter((p) => p.eaKoefficient > 0);
    const avg =
      withEak.length > 0
        ? withEak.reduce((a, p) => a + p.eaKoefficient, 0) / withEak.length
        : 0;
    const peak = withEak.reduce((a, p) => Math.max(a, p.eaKoefficient), 0);
    const sessions = new Set(inWindow.map((p) => p.source.date)).size;
    const counts: Record<string, number> = {
      peaking: 0,
      adapting: 0,
      undertrained: 0,
      exhausted: 0,
    };
    for (const p of withEak) {
      if (counts[p.status] != null) counts[p.status] += 1;
    }
    const fatigueLimit = inWindow.filter((p) => p.volume === "fatigue_limit").length;
    return { sessions, totalSets: inWindow.length, avg, peak, counts, withEakCount: withEak.length, fatigueLimit };
  }, [processed, windowDays]);

  const windowLabel = windowKey === "7d" ? "Last 7 days" : windowKey === "30d" ? "Last 30 days" : "Last 3 months";

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const arr = map.get(p.source.date) ?? [];
      arr.push(p);
      map.set(p.source.date, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">{windowLabel}</div>
        <Tabs value={windowKey} onValueChange={(v) => setWindowKey(v as "7d" | "30d" | "3m")}>
          <TabsList className="h-8">
            <TabsTrigger value="7d" className="text-xs px-2.5">7 days</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs px-2.5">30 days</TabsTrigger>
            <TabsTrigger value="3m" className="text-xs px-2.5">3 months</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Sessions</div>
            <div className="mt-1 text-2xl font-bold">{summary.sessions}</div>
            <div className="text-[11px] text-muted-foreground">{summary.totalSets} sets logged</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Avg EAkoeff</div>
            <div className="mt-1 text-2xl font-bold">
              {summary.avg > 0 ? `${summary.avg.toFixed(1)}%` : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">Across {summary.withEakCount} sets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Peak EAkoeff</div>
            <div className="mt-1 text-2xl font-bold">
              {summary.peak > 0 ? `${summary.peak.toFixed(1)}%` : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">Best E1RM vs baseline</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Fatigue-limit sets</div>
            <div className="mt-1 text-2xl font-bold">{summary.fatigueLimit}</div>
            <div className="text-[11px] text-muted-foreground">≥5% E1RM drop</div>
          </CardContent>
        </Card>
      </div>

      {summary.withEakCount > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Readiness distribution</span>
              <span className="text-muted-foreground">{summary.withEakCount} sets</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {(["peaking", "adapting", "undertrained", "exhausted"] as const).map((s) => {
                const pct = (summary.counts[s] / summary.withEakCount) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={s}
                    style={{ width: `${pct}%` }}
                    className={cn("h-full", readinessClasses(s))}
                    title={`${readinessLabel(s)}: ${summary.counts[s]} (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["peaking", "adapting", "undertrained", "exhausted"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", readinessClasses(s))} />
                  <span className="text-muted-foreground">
                    {readinessLabel(s)} · {summary.counts[s]}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>EAkoefficient log</CardTitle>
            <CardDescription>
              Sets grouped by session date with readiness and volume quality applied.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={exerciseFilter}
              onChange={(e) => setExerciseFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All exercises</option>
              {exercises.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="peaking">Peaking</option>
              <option value="adapting">Adapting</option>
              <option value="undertrained">Undertrained</option>
              <option value="exhausted">Exhausted</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {logsQuery.isLoading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!logsQuery.isLoading && grouped.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {processed.length === 0 ? "No sets logged yet." : "No sets match your filters."}
            </div>
          )}
          {grouped.length > 0 && (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Exercise</th>
                  <th className="px-4 py-3">Set · Rep · Wt · RPE</th>
                  <th className="bg-readiness-tint/30 px-4 py-3">E1RM</th>
                  <th className="bg-readiness-tint/30 px-4 py-3">EAk %</th>
                  <th className="bg-readiness-tint/30 px-4 py-3">Status</th>
                  <th className="bg-volume-tint/30 px-4 py-3">Drop</th>
                  <th className="bg-volume-tint/30 px-4 py-3">Volume</th>
                  <th className="px-2 py-3 sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([date, rows]) => {
                  const withEak = rows.filter((r) => r.eaKoefficient > 0);
                  const dayAvg =
                    withEak.length > 0
                      ? withEak.reduce((a, r) => a + r.eaKoefficient, 0) / withEak.length
                      : 0;
                  return (
                    <React.Fragment key={date}>
                      <tr className="bg-muted/30">
                        <td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <div className="flex items-center justify-between">
                            <span>{format(parseISO(date), "EEEE · MMM d, yyyy")}</span>
                            <span className="font-normal normal-case">
                              {rows.length} sets{dayAvg > 0 ? ` · avg ${dayAvg.toFixed(1)}%` : ""}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {rows.map((p) => {
                        const edit = editsById.get(p.source.id);
                        const wasEdited = !!edit?.editedAt;
                        const repsChanged = edit?.origReps != null && edit.origReps !== p.source.reps;
                        const rpeChanged = edit?.origRpe != null && edit.origRpe !== p.source.rpe;
                        return (
                        <tr
                          key={p.source.id}
                          className={cn(
                            "border-b border-border transition-colors hover:bg-muted/30",
                            wasEdited && "bg-amber-500/5",
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{p.source.exercise}</span>
                              {wasEdited && (
                                <span
                                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"
                                  title={`Athlete edited ${format(parseISO(edit!.editedAt!), "MMM d, HH:mm")}`}
                                >
                                  Edited
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.source.variation ?? "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              S:{p.source.set_number} ·{" "}
                              <span className="font-semibold">
                                <span className={cn(repsChanged && "text-amber-700 dark:text-amber-400")}>{p.source.reps}</span>
                                ×{p.source.weight_kg}kg
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              RPE <span className={cn(rpeChanged && "text-amber-700 dark:text-amber-400")}>{p.source.rpe}</span>
                              {(repsChanged || rpeChanged) && (
                                <span className="ml-1 text-[10px]">
                                  (was{repsChanged ? ` ${edit!.origReps}r` : ""}
                                  {rpeChanged ? ` RPE${edit!.origRpe}` : ""})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="bg-readiness-tint/20 px-4 py-3 font-bold">
                            {p.dailyE1RM.toFixed(1)} kg
                          </td>
                          <td className="bg-readiness-tint/20 px-4 py-3">
                            <div className="font-bold">
                              {p.eaKoefficient > 0 ? `${p.eaKoefficient.toFixed(1)}%` : "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Base: {p.baseline1RM || "—"}
                            </div>
                          </td>
                          <td className="bg-readiness-tint/20 px-4 py-3">
                            {p.eaKoefficient > 0 ? (
                              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", readinessClasses(p.status))}>
                                {readinessLabel(p.status)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="bg-volume-tint/20 px-4 py-3">
                            {p.source.set_number > 1 && p.set1E1RM > 0 ? (
                              <div className="flex items-center gap-1 font-semibold">
                                <TrendingDown
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    p.dropPercent >= 5 ? "text-destructive" : "text-muted-foreground",
                                  )}
                                />
                                {p.dropPercent.toFixed(1)}%
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Set 1 ref</span>
                            )}
                          </td>
                          <td className="bg-volume-tint/20 px-4 py-3">
                            {p.source.set_number > 1 && p.set1E1RM > 0 ? (
                              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", volumeQualityClasses(p.volume))}>
                                {volumeQualityLabel(p.volume)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              disabled={deleteSet.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete this set?\n\n${p.source.exercise} · S${p.source.set_number} · ${p.source.reps}×${p.source.weight_kg}kg @ RPE ${p.source.rpe}\n\nThis cannot be undone.`,
                                  )
                                ) {
                                  deleteSet.mutate(p.source.id);
                                }
                              }}
                              aria-label="Delete set"
                              title="Delete misslogged set"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const baselineSchema = z.object({
  exercise: z
    .string()
    .trim()
    .min(1, "Exercise required")
    .max(100, "Exercise name too long"),
  one_rm_kg: z.number().min(0).max(1000),
});

function BaselinesEditor({ athleteId }: { athleteId: string }) {
  const queryClient = useQueryClient();
  const baselinesQuery = useQuery({
    queryKey: ["athlete-baselines-list", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("id, exercise, one_rm_kg, updated_at")
        .eq("athlete_id", athleteId)
        .order("exercise", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ exercise, kg }: { exercise: string; kg: number }) => {
      const parsed = baselineSchema.parse({ exercise, one_rm_kg: kg });
      const { error } = await supabase
        .from("baselines")
        .upsert(
          {
            athlete_id: athleteId,
            exercise: parsed.exercise,
            one_rm_kg: parsed.one_rm_kg,
          },
          { onConflict: "athlete_id,exercise" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Baseline saved");
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines-list", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["baseline-history", athleteId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("baselines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Baseline removed");
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines-list", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines", athleteId] });
    },
  });

  const existing = baselinesQuery.data ?? [];
  const existingExercises = new Set(existing.map((b) => b.exercise));
  const suggested = DEFAULT_EXERCISES.filter((e) => !existingExercises.has(e));

  const [newExercise, setNewExercise] = useState("");
  const [newKg, setNewKg] = useState<number>(100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>1RM Baselines</CardTitle>
        <CardDescription>
          Update these whenever the athlete tests a new rested 1RM. Required for
          EAkoefficient % to compute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {existing.map((b) => (
            <BaselineRow
              key={b.id}
              athleteId={athleteId}
              exercise={b.exercise}
              kg={Number(b.one_rm_kg)}
              updatedAt={b.updated_at}
              onSave={(kg) => upsertMutation.mutate({ exercise: b.exercise, kg })}
              onDelete={() => deleteMutation.mutate(b.id)}
            />
          ))}
          {existing.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No baselines yet — add the athlete's tested 1RMs below.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Add baseline
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-ex">Exercise</Label>
              <Input
                id="new-ex"
                list="suggested"
                value={newExercise}
                onChange={(e) => setNewExercise(e.target.value)}
                placeholder="e.g. Knäböj"
                maxLength={100}
              />
              <datalist id="suggested">
                {suggested.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <div className="w-32 space-y-1">
              <Label htmlFor="new-kg">1RM (kg)</Label>
              <Input
                id="new-kg"
                type="number"
                min={0}
                max={1000}
                step={2.5}
                value={newKg}
                onChange={(e) => setNewKg(Number(e.target.value))}
              />
            </div>
            <Button
              onClick={() => {
                if (!newExercise.trim()) {
                  toast.error("Enter an exercise name");
                  return;
                }
                upsertMutation.mutate({ exercise: newExercise.trim(), kg: newKg });
                setNewExercise("");
              }}
              disabled={upsertMutation.isPending}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BaselineRow({
  athleteId,
  exercise,
  kg,
  updatedAt,
  onSave,
  onDelete,
}: {
  athleteId: string;
  exercise: string;
  kg: number;
  updatedAt: string;
  onSave: (kg: number) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(kg);
  const [open, setOpen] = useState(false);
  const dirty = value !== kg;

  const historyQuery = useQuery({
    queryKey: ["baseline-history", athleteId, exercise],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baseline_history")
        .select("id, one_rm_kg, recorded_at")
        .eq("athlete_id", athleteId)
        .eq("exercise", exercise)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const history = historyQuery.data ?? [];
  const first = history[0];
  const last = history[history.length - 1];
  const delta = first && last ? Number(last.one_rm_kg) - Number(first.one_rm_kg) : 0;
  const deltaPct = first && Number(first.one_rm_kg) > 0
    ? (delta / Number(first.one_rm_kg)) * 100
    : 0;
  const chartData = history.map((h) => ({
    date: h.recorded_at,
    kg: Number(h.one_rm_kg),
  }));

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-end gap-2 p-2">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">{exercise}</div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <History className="h-3 w-3" />
              {open ? "Hide history" : "Show history"}
            </button>
          </div>
          <Input
            type="number"
            min={0}
            max={1000}
            step={2.5}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="mt-1"
          />
          <div className="mt-1 text-[10px] text-muted-foreground">
            Last updated {format(parseISO(updatedAt), "MMM d, yyyy")}
          </div>
        </div>
        <Button size="sm" disabled={!dirty} onClick={() => onSave(value)}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Remove
        </Button>
      </div>

      {open && (
        <div className="border-t border-border bg-muted/30 p-3 space-y-3">
          {historyQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading history…</p>
          ) : history.length < 2 ? (
            <p className="text-xs text-muted-foreground">
              Only one record so far — update the 1RM above to start tracking progress.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {history.length} records since {format(parseISO(first!.recorded_at), "MMM d, yyyy")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    delta > 0 && "text-emerald-500",
                    delta < 0 && "text-destructive",
                    delta === 0 && "text-muted-foreground",
                  )}
                >
                  {delta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : delta < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)} kg ({deltaPct > 0 ? "+" : ""}
                  {deltaPct.toFixed(1)}%)
                </span>
              </div>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <YAxis
                      domain={["dataMin - 5", "dataMax + 5"]}
                      hide
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      labelFormatter={(v) => format(parseISO(String(v)), "MMM d, yyyy")}
                      formatter={(val: number) => [`${val} kg`, "1RM"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="max-h-32 overflow-y-auto text-xs">
                <table className="w-full">
                  <tbody>
                    {[...history].reverse().map((h, i, arr) => {
                      const prev = arr[i + 1];
                      const diff = prev ? Number(h.one_rm_kg) - Number(prev.one_rm_kg) : 0;
                      return (
                        <tr key={h.id} className="border-b border-border/50 last:border-0">
                          <td className="py-1 text-muted-foreground">
                            {format(parseISO(h.recorded_at), "MMM d, yyyy")}
                          </td>
                          <td className="py-1 text-right font-medium">
                            {Number(h.one_rm_kg)} kg
                          </td>
                          <td
                            className={cn(
                              "py-1 pl-2 text-right text-[11px]",
                              diff > 0 && "text-emerald-500",
                              diff < 0 && "text-destructive",
                              diff === 0 && "text-muted-foreground",
                            )}
                          >
                            {prev ? `${diff > 0 ? "+" : ""}${diff.toFixed(1)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
