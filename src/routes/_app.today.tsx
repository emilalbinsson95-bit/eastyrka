import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  format,
} from "date-fns";
import { Plus, CheckCircle2, Save, Calendar as CalendarIcon, Pencil, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { rirToRpe } from "@/lib/intensity";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  dailyE1RM,
  eaKoefficient,
  readinessFromEAk,
  readinessLabel,
  readinessClasses,
  volumeQualityClasses,
  volumeQualityLabel,
  processLogs,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";
import { ReadinessGate } from "@/components/ReadinessGate";
import { EnduranceTodayCard } from "@/components/EnduranceTodayCard";
import { plannedSessionDate } from "@/lib/planned-session-dates";

export const Route = createFileRoute("/_app/today")({
  head: () => ({
    meta: [
      { title: "Today's Session — SETPOINT" },
      { name: "description", content: "Log today's lifts and see your readiness in real time." },
    ],
  }),
  component: TodayPage,
});

const setSchema = z.object({
  weight_kg: z.number().min(0).max(1000),
  reps: z.number().int().min(1).max(50),
  rpe: z.number().min(1).max(10),
  comment: z.string().trim().max(500).optional(),
});

interface PlannedExercise {
  id: string;
  exercise: string;
  variation: string | null;
  target_sets: number;
  target_reps: number;
  target_rpe: number | null;
  target_rir: number | null;
  intensity_metric: "rpe" | "rir";
  target_weight_kg: number | null;
  lengthened_partials: boolean;
  last_set_to_failure: boolean;
  notes: string | null;
  order_index: number;
}

interface PlannedSession {
  id: string;
  day_of_week: number;
  title: string | null;
  notes: string | null;
  planned_exercises: PlannedExercise[];
  /** Week-plan context for computing the default (un-overridden) date. */
  week_plan_id: string;
  week_start_date: string;
}

interface WeekPlan {
  id: string;
  week_start_date: string;
  status: string;
  planned_sessions: PlannedSession[];
}

interface LogRow {
  id: string;
  date: string;
  exercise: string;
  variation: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number;
  comment: string | null;
  form_score: number | null;
  planned_exercise_id: string | null;
  original_reps?: number | null;
  original_rpe?: number | null;
}

function TodayPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, "yyyy-MM-dd");

  // 1. Find any planned-session overrides landing on today (across any week_plan).
  //    This catches sessions moved/dragged from a different week into today.
  const todayOverridesQuery = useQuery({
    queryKey: ["today-overrides-any", userId, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_schedule_overrides")
        .select("source_id, scheduled_date, cancelled_at")
        .eq("owner_id", userId)
        .eq("source_type", "planned")
        .eq("scheduled_date", todayStr)
        .is("cancelled_at", null);
      if (error) throw error;
      return (data ?? []) as { source_id: string; scheduled_date: string; cancelled_at: string | null }[];
    },
  });

  // 2. Fetch the active published week (for default-scheduled sessions today
  //    and the "Or start one of your week's sessions today" list).
  const planQuery = useQuery({
    queryKey: ["athlete-plan", userId, todayStr],
    queryFn: async (): Promise<WeekPlan | null> => {
      const { data, error } = await supabase
        .from("week_plans")
        .select(
          `id, week_start_date, status,
           planned_sessions (
             id, day_of_week, title, notes,
             planned_exercises (
               id, exercise, variation, target_sets, target_reps,
               target_rpe, target_rir, intensity_metric,
               target_weight_kg, lengthened_partials, last_set_to_failure,
               notes, order_index
             )
           )`,
        )
        .eq("athlete_id", userId)
        .eq("status", "published")
        .lte("week_start_date", todayStr)
        .order("week_start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const wp = data as {
        id: string; week_start_date: string; status: string;
        planned_sessions: Omit<PlannedSession, "week_plan_id" | "week_start_date">[];
      };
      return {
        ...wp,
        planned_sessions: wp.planned_sessions.map((s) => ({
          ...s,
          week_plan_id: wp.id,
          week_start_date: wp.week_start_date,
        })),
      };
    },
  });

  // 3. Fetch the cross-week planned sessions referenced by today's overrides
  //    (i.e. sessions belonging to OTHER week_plans that were dragged to today).
  const crossWeekSessionIds = useMemo(() => {
    const ids = (todayOverridesQuery.data ?? []).map((o) => o.source_id);
    const inCurrent = new Set(
      (planQuery.data?.planned_sessions ?? []).map((s) => s.id),
    );
    return ids.filter((id) => !inCurrent.has(id));
  }, [todayOverridesQuery.data, planQuery.data]);

  const crossWeekSessionsQuery = useQuery({
    queryKey: ["today-crossweek-sessions", userId, crossWeekSessionIds.join(",")],
    enabled: crossWeekSessionIds.length > 0,
    queryFn: async (): Promise<PlannedSession[]> => {
      const { data, error } = await supabase
        .from("planned_sessions")
        .select(
          `id, day_of_week, title, notes, week_plan_id,
           week_plans!inner(id, week_start_date, status, athlete_id),
           planned_exercises (
             id, exercise, variation, target_sets, target_reps,
             target_rpe, target_rir, intensity_metric,
             target_weight_kg, lengthened_partials, last_set_to_failure,
             notes, order_index
           )`,
        )
        .in("id", crossWeekSessionIds);
      if (error) throw error;
      type Row = {
        id: string; day_of_week: number; title: string | null; notes: string | null;
        week_plan_id: string;
        week_plans: { id: string; week_start_date: string; status: string; athlete_id: string };
        planned_exercises: PlannedExercise[];
      };
      return (data as Row[] ?? [])
        .filter((r) => r.week_plans?.status === "published" && r.week_plans?.athlete_id === userId)
        .map((r) => ({
          id: r.id,
          day_of_week: r.day_of_week,
          title: r.title,
          notes: r.notes,
          planned_exercises: r.planned_exercises ?? [],
          week_plan_id: r.week_plan_id,
          week_start_date: r.week_plans.week_start_date,
        }));
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["baselines", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", userId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.exercise] = Number(row.one_rm_kg);
      return map;
    },
  });

  const logsQuery = useQuery({
    queryKey: ["logs-today", userId, todayStr],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("*")
        .eq("athlete_id", userId)
        .eq("date", todayStr)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  // All planned sessions we care about today = current week's sessions + cross-week sessions overridden to today.
  const allRelevantSessions = useMemo<PlannedSession[]>(() => {
    const current = planQuery.data?.planned_sessions ?? [];
    const cross = crossWeekSessionsQuery.data ?? [];
    return [...current, ...cross];
  }, [planQuery.data, crossWeekSessionsQuery.data]);

  const weekPlannedExerciseIds = useMemo(
    () => allRelevantSessions.flatMap((s) => s.planned_exercises.map((e) => e.id)),
    [allRelevantSessions],
  );

  const weekLogsQuery = useQuery({
    queryKey: ["week-logs", userId, weekPlannedExerciseIds.join(",")],
    enabled: weekPlannedExerciseIds.length > 0,
    queryFn: async (): Promise<{ planned_exercise_id: string }[]> => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("planned_exercise_id")
        .eq("athlete_id", userId)
        .in("planned_exercise_id", weekPlannedExerciseIds);
      if (error) throw error;
      return (data ?? []) as { planned_exercise_id: string }[];
    },
  });

  // Overrides for ALL relevant sessions (current-week + cross-week).
  const allRelevantSessionIds = useMemo(
    () => allRelevantSessions.map((s) => s.id),
    [allRelevantSessions],
  );

  const overridesQuery = useQuery({
    queryKey: ["today-overrides-planned", userId, allRelevantSessionIds.join(",")],
    enabled: allRelevantSessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_schedule_overrides")
        .select("source_id, scheduled_date, confirmed_at, cancelled_at")
        .eq("owner_id", userId)
        .eq("source_type", "planned")
        .in("source_id", allRelevantSessionIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ovByPlanId = useMemo(() => {
    const m = new Map<string, { scheduledDate: string; cancelled: boolean }>();
    for (const o of overridesQuery.data ?? []) {
      m.set(o.source_id as string, {
        scheduledDate: String(o.scheduled_date).slice(0, 10),
        cancelled: !!o.cancelled_at,
      });
    }
    return m;
  }, [overridesQuery.data]);

  // A planned session shows up "today" when its effective date == today.
  // Effective date = override.scheduled_date (uncancelled) OR
  //                  week_start_date + day-offset (per plannedSessionDate).
  const todayPlanned: PlannedSession | undefined = useMemo(() => {
    if (allRelevantSessions.length === 0) return undefined;
    // group siblings by week_plan_id so plannedSessionDate's zero/one-based detection still works
    const siblingsByPlan = new Map<string, PlannedSession[]>();
    for (const s of allRelevantSessions) {
      const arr = siblingsByPlan.get(s.week_plan_id) ?? [];
      arr.push(s);
      siblingsByPlan.set(s.week_plan_id, arr);
    }
    const loggedSet = new Set(
      (weekLogsQuery.data ?? []).map((l) => l.planned_exercise_id),
    );
    const candidates = allRelevantSessions
      .map((s) => {
        const ov = ovByPlanId.get(s.id);
        if (ov?.cancelled) return null;
        const effective = ov?.scheduledDate
          ? ov.scheduledDate
          : plannedSessionDate(s.week_start_date, s, siblingsByPlan.get(s.week_plan_id) ?? [s]);
        return effective === todayStr ? s : null;
      })
      .filter((s): s is PlannedSession => s !== null)
      .sort((a, b) => a.day_of_week - b.day_of_week);
    if (candidates.length === 0) return undefined;
    const next = candidates.find((s) =>
      s.planned_exercises.some((e) => !loggedSet.has(e.id)),
    );
    return next ?? candidates[0];
  }, [allRelevantSessions, ovByPlanId, weekLogsQuery.data, todayStr]);

  // Other planned sessions that aren't done yet and aren't scheduled for today.
  // Includes current-week sessions AND any cross-week session moved into view via an override.
  const pendingSessions = useMemo(() => {
    if (allRelevantSessions.length === 0) return [] as { session: PlannedSession; effective: string }[];
    const siblingsByPlan = new Map<string, PlannedSession[]>();
    for (const s of allRelevantSessions) {
      const arr = siblingsByPlan.get(s.week_plan_id) ?? [];
      arr.push(s);
      siblingsByPlan.set(s.week_plan_id, arr);
    }
    const loggedSet = new Set(
      (weekLogsQuery.data ?? []).map((l) => l.planned_exercise_id),
    );
    return allRelevantSessions
      .map((s) => {
        const ov = ovByPlanId.get(s.id);
        if (ov?.cancelled) return null;
        const effective = ov?.scheduledDate
          ? ov.scheduledDate
          : plannedSessionDate(s.week_start_date, s, siblingsByPlan.get(s.week_plan_id) ?? [s]);
        if (effective === todayStr) return null;
        const allDone = s.planned_exercises.length > 0
          && s.planned_exercises.every((e) => loggedSet.has(e.id));
        if (allDone) return null;
        return { session: s, effective };
      })
      .filter((x): x is { session: PlannedSession; effective: string } => x !== null)
      .sort((a, b) => a.effective.localeCompare(b.effective));
  }, [allRelevantSessions, ovByPlanId, weekLogsQuery.data, todayStr]);


  const baselines = baselinesQuery.data ?? {};
  const logs = logsQuery.data ?? [];

  const processed = useMemo(
    () =>
      processLogs(
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
      ),
    [logs, baselines],
  );

  const isLoading =
    planQuery.isLoading || baselinesQuery.isLoading || logsQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
          Setpoint · Today
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {format(today, "EEEE · MMMM d")}
        </p>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!isLoading && (
        <ReadinessGate athleteId={userId} dateStr={todayStr}>
          {todayPlanned ? (
            <PlannedSessionCard
              session={todayPlanned}
              logs={logs}
              processed={processed}
              baselines={baselines}
              athleteId={userId}
              dateStr={todayStr}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No session scheduled for today</CardTitle>
                <CardDescription>
                  Your coach hasn't scheduled a strength session for today, or it's been moved. Check your <Link to="/calendar" className="underline">calendar</Link>. You can still log freestyle sets below — they'll feed into your EAkoefficient.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingSessions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Or start one of your week's sessions today
                    </div>
                    {pendingSessions.map(({ session, effective }) => (
                      <StartTodayRow
                        key={session.id}
                        session={session}
                        plannedDate={effective}
                        athleteId={userId}
                        todayStr={todayStr}
                      />
                    ))}
                  </div>
                )}
                <FreestyleQuickLog
                  athleteId={userId}
                  dateStr={todayStr}
                  baselines={baselines}
                />
              </CardContent>
            </Card>
          )}
        </ReadinessGate>
      )}

      {!isLoading && <EnduranceTodayCard athleteId={userId} dateStr={todayStr} />}

      {/* Always show today's logged sets */}
      {processed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today's logged sets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {processed.map((p) => (
              <div
                key={p.source.id}
                className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
              >
                <div>
                  <div className="font-semibold">{p.source.exercise}</div>
                  <div className="text-xs text-muted-foreground">
                    Set {p.source.set_number} · {p.source.reps}×{p.source.weight_kg}kg
                    @RPE{p.source.rpe}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      readinessClasses(p.status),
                    )}
                  >
                    {p.eaKoefficient > 0
                      ? `${p.eaKoefficient.toFixed(0)}% · ${readinessLabel(p.status)}`
                      : `${p.dailyE1RM.toFixed(0)}kg E1RM`}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Prescribed weights come from your coach based on your current strength —
        focus on hitting the target reps and {""}
        <span className="font-medium">RPE/RIR</span>.
      </p>
    </div>
  );
}

function PlannedSessionCard({
  session,
  logs,
  processed,
  baselines,
  athleteId,
  dateStr,
}: {
  session: PlannedSession;
  logs: LogRow[];
  processed: ReturnType<typeof processLogs<any>>;
  baselines: Record<string, number>;
  athleteId: string;
  dateStr: string;
}) {
  // Match logs to a specific planned exercise. To avoid double-counting when
  // the same exercise name appears twice in a session (e.g. bench press as
  // both a main and an accessory lift), unlinked (freestyle) logs are only
  // attributed to the FIRST planned row with that name.
  const matchLogs = (ex: PlannedExercise): LogRow[] => {
    const linked = logs.filter((l) => l.planned_exercise_id === ex.id);
    const sameName = session.planned_exercises.filter(
      (e) => e.exercise === ex.exercise,
    );
    const isFirstByName = sameName[0]?.id === ex.id;
    const unlinked = isFirstByName
      ? logs.filter(
          (l) => l.planned_exercise_id == null && l.exercise === ex.exercise,
        )
      : [];
    return [...linked, ...unlinked];
  };

  // Session progress: count exercises that have at least one logged set today.
  const exercisesWithLogs = session.planned_exercises.filter(
    (ex) => matchLogs(ex).length > 0,
  ).length;
  const totalEx = session.planned_exercises.length;
  const allDone = totalEx > 0 && exercisesWithLogs >= totalEx;
  const inProgress = exercisesWithLogs > 0 && !allDone;
  const notStarted = exercisesWithLogs === 0;

  const statusBadge = allDone
    ? { label: "Complete", cls: "bg-status-adapting text-status-adapting-foreground" }
    : inProgress
      ? { label: `In progress · ${exercisesWithLogs}/${totalEx}`, cls: "bg-status-peaking text-status-peaking-foreground animate-pulse" }
      : { label: "Not started", cls: "bg-muted text-muted-foreground" };

  return (
    <Card className={cn(inProgress && "ring-2 ring-status-peaking/40", notStarted && "border-dashed")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {session.title ?? "Today's session"}
          </CardTitle>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap", statusBadge.cls)}>
            {statusBadge.label}
          </span>
        </div>
        {session.notes && (
          <CardDescription>{session.notes}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {[...session.planned_exercises]
          .sort((a, b) => a.order_index - b.order_index)
          .map((ex) => {
            const exerciseLogs = matchLogs(ex);
            const exerciseProcessed = processed.filter(
              (p) =>
                exerciseLogs.some((l) => l.id === p.source.id),
            );
            return (
              <PlannedExerciseRow
                key={ex.id}
                ex={ex}
                logs={exerciseLogs}
                processed={exerciseProcessed}
                baseline={baselines[ex.exercise] ?? 0}
                athleteId={athleteId}
                dateStr={dateStr}
              />
            );
          })}
      </CardContent>
    </Card>
  );
}


function EditLoggedSet({
  log,
  athleteId,
  dateStr,
  onClose,
}: {
  log: LogRow;
  athleteId: string;
  dateStr: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reps, setReps] = useState(String(log.reps));
  const [weight, setWeight] = useState(String(log.weight_kg));
  const [rpe, setRpe] = useState(String(log.rpe));

  const save = useMutation({
    mutationFn: async () => {
      const parsed = setSchema.parse({
        reps: Number(reps),
        weight_kg: Number(weight),
        rpe: Number(rpe),
      });
      const { error } = await supabase
        .from("training_logs")
        .update({
          reps: parsed.reps,
          weight_kg: parsed.weight_kg,
          rpe: parsed.rpe,
          edited_by_athlete_at: new Date().toISOString(),
          original_reps: log.original_reps ?? log.reps,
          original_rpe: log.original_rpe ?? log.rpe,
        } as never)
        .eq("id", log.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Set updated");
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded bg-muted px-2 py-1.5 text-xs">
      <Input
        type="number"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="h-7 w-16 text-xs"
        aria-label="Weight kg"
      />
      <span className="text-muted-foreground">kg ×</span>
      <Input
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        className="h-7 w-14 text-xs"
        aria-label="Reps"
      />
      <span className="text-muted-foreground">@RPE</span>
      <Input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={rpe}
        onChange={(e) => setRpe(e.target.value)}
        className="h-7 w-14 text-xs"
        aria-label="RPE"
      />
      <Button size="sm" className="h-7 px-2" disabled={save.isPending} onClick={() => save.mutate()}>
        <Save className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function PlannedExerciseRow({
  ex,
  logs,
  processed,
  baseline,
  athleteId,
  dateStr,
}: {
  ex: PlannedExercise;
  logs: LogRow[];
  processed: ReturnType<typeof processLogs<any>>;
  baseline: number;
  athleteId: string;
  dateStr: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const completed = logs.length;
  const targetSets = ex.target_sets;
  const isDone = completed >= targetSets;

  const intensityLabel =
    ex.intensity_metric === "rir" && ex.target_rir != null
      ? `${ex.target_rir} RIR`
      : ex.target_rpe != null
        ? `RPE ${ex.target_rpe}`
        : null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{ex.exercise}</h3>
            {ex.variation && (
              <span className="text-xs text-muted-foreground">· {ex.variation}</span>
            )}
            {isDone && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
          <p className="text-xs text-muted-foreground">
            Target: {ex.target_sets}×{ex.target_reps}
            {intensityLabel && ` @ ${intensityLabel}`}
            {ex.target_weight_kg && ` · ${ex.target_weight_kg}kg`}
          </p>
          {(ex.lengthened_partials || ex.last_set_to_failure) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ex.lengthened_partials && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                  + Lengthened partials
                </span>
              )}
              {ex.last_set_to_failure && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  Last set → failure
                </span>
              )}
            </div>
          )}
          {ex.notes && (
            <p className="mt-1 text-xs italic text-muted-foreground">
              {ex.notes}
            </p>
          )}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {completed}/{targetSets}
        </span>
      </div>

      {processed.length > 0 && (
        <div className="mb-3 space-y-1">
          {processed
            .sort((a, b) => a.source.set_number - b.source.set_number)
            .map((p) => {
              const logForEdit = logs.find((l) => l.id === p.source.id);
              if (editingId === p.source.id && logForEdit) {
                return (
                  <EditLoggedSet
                    key={p.source.id}
                    log={logForEdit}
                    athleteId={athleteId}
                    dateStr={dateStr}
                    onClose={() => setEditingId(null)}
                  />
                );
              }
              return (
                <div
                  key={p.source.id}
                  className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium">
                    Set {p.source.set_number}: {p.source.reps}×{p.source.weight_kg}kg
                    @RPE{p.source.rpe}
                  </span>
                  <div className="flex items-center gap-1">
                    {p.eaKoefficient > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-semibold",
                          readinessClasses(p.status),
                        )}
                      >
                        {p.eaKoefficient.toFixed(0)}%
                      </span>
                    )}
                    {p.source.set_number > 1 && p.set1E1RM > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-semibold",
                          volumeQualityClasses(p.volume),
                        )}
                      >
                        {volumeQualityLabel(p.volume)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-primary"
                      onClick={() => setEditingId(p.source.id)}
                      aria-label="Edit set"
                      title="Edit logged set"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {!isDone && (
        <LogSetButton
          ex={ex}
          nextSet={completed + 1}
          baseline={baseline}
          previousLog={logs[logs.length - 1]}
          athleteId={athleteId}
          dateStr={dateStr}
        />
      )}
    </div>
  );
}

function LogSetButton({
  ex,
  nextSet,
  baseline,
  previousLog,
  athleteId,
  dateStr,
}: {
  ex: PlannedExercise;
  nextSet: number;
  baseline: number;
  previousLog: LogRow | undefined;
  athleteId: string;
  dateStr: string;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState<number>(
    previousLog ? Number(previousLog.weight_kg) : Number(ex.target_weight_kg ?? 100),
  );
  const [reps, setReps] = useState<number>(
    previousLog ? previousLog.reps : ex.target_reps,
  );
  const [rpe, setRpe] = useState<number>(
    previousLog ? Number(previousLog.rpe) : Number(ex.target_rpe ?? 7),
  );
  const [rir, setRir] = useState<number>(
    ex.target_rir != null ? Number(ex.target_rir) : 2,
  );
  const [partials, setPartials] = useState<boolean>(ex.lengthened_partials);
  const [toFailure, setToFailure] = useState<boolean>(
    ex.last_set_to_failure && nextSet === ex.target_sets,
  );
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();

  const usingRir = ex.intensity_metric === "rir";
  const effectiveRpe = usingRir ? rirToRpe(rir) : rpe;

  const livePreview = useMemo(() => {
    const e1rm = dailyE1RM({ weight_kg: weight, reps, rpe: effectiveRpe });
    const eak =
      baseline > 0
        ? eaKoefficient({ weight_kg: weight, reps, rpe: effectiveRpe }, baseline)
        : 0;
    const status = readinessFromEAk(eak);
    return { e1rm, eak, status };
  }, [weight, reps, effectiveRpe, baseline]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = setSchema.parse({
        weight_kg: weight,
        reps,
        rpe: effectiveRpe,
        comment: comment || undefined,
      });
      const { error } = await supabase.from("training_logs").insert({
        athlete_id: athleteId,
        date: dateStr,
        exercise: ex.exercise,
        variation: ex.variation,
        set_number: nextSet,
        reps: parsed.reps,
        weight_kg: parsed.weight_kg,
        rpe: parsed.rpe,
        rir: usingRir ? rir : null,
        lengthened_partials: partials,
        to_failure: toFailure,
        comment: parsed.comment ?? null,
        planned_exercise_id: ex.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Set ${nextSet} logged`);
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      setOpen(false);
      setComment("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const intensityLabel = usingRir
    ? ex.target_rir != null
      ? `${ex.target_rir} RIR`
      : "RIR"
    : ex.target_rpe != null
      ? `RPE ${ex.target_rpe}`
      : "RPE";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="w-full" size="lg">
          <Plus className="mr-1 h-4 w-4" />
          Log set {nextSet} of {ex.target_sets}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {ex.exercise} — Set {nextSet}
          </SheetTitle>
          <SheetDescription>
            Target: {ex.target_reps} reps @ {intensityLabel}
            {ex.target_weight_kg && ` · ${ex.target_weight_kg}kg`}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 py-4">
          <NumField label="Weight (kg)" step={2.5} value={weight} onChange={setWeight} />
          <NumField label="Reps" step={1} value={reps} onChange={setReps} />
          {usingRir ? (
            <NumField label="RIR (reps in reserve)" step={1} min={0} max={10} value={rir} onChange={setRir} />
          ) : (
            <NumField label="RPE" step={0.5} min={1} max={10} value={rpe} onChange={setRpe} />
          )}

          <div className="flex flex-wrap gap-4 rounded-md border border-border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={partials}
                onCheckedChange={(v) => setPartials(v === true)}
              />
              Lengthened partials
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={toFailure}
                onCheckedChange={(v) => setToFailure(v === true)}
              />
              Set taken to failure
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Input
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Felt heavy / fast / etc."
            />
          </div>

          <div className="rounded-lg border border-border bg-readiness-tint p-3">
            <div className="text-xs font-medium text-muted-foreground">
              Live E1RM preview
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-lg font-bold">
                {livePreview.e1rm.toFixed(1)} kg E1RM
              </span>
              {baseline > 0 && (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-semibold",
                    readinessClasses(livePreview.status),
                  )}
                >
                  {livePreview.eak.toFixed(0)}% · {readinessLabel(livePreview.status)}
                </span>
              )}
            </div>
          </div>
        </div>
        <SheetFooter className="px-4 pb-4">
          <Button
            className="w-full"
            size="lg"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Save className="mr-1 h-4 w-4" />
            {mutation.isPending ? "Saving…" : "Save set"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FreestyleQuickLog({
  athleteId,
  dateStr,
  baselines,
}: {
  athleteId: string;
  dateStr: string;
  baselines: Record<string, number>;
}) {
  const [exercise, setExercise] = useState(Object.keys(baselines)[0] ?? "Knäböj");
  const [weight, setWeight] = useState(100);
  const [reps, setReps] = useState(5);
  const [rpe, setRpe] = useState(7);
  const [setNumber, setSetNumber] = useState(1);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("training_logs").insert({
        athlete_id: athleteId,
        date: dateStr,
        exercise,
        variation: null,
        set_number: setNumber,
        reps,
        weight_kg: weight,
        rpe,
        comment: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Set logged");
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      setSetNumber((n) => n + 1);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ex">Exercise</Label>
          <Input
            id="ex"
            list="ex-list"
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
          />
          <datalist id="ex-list">
            {Object.keys(baselines).map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>
        <NumField label="Set" step={1} value={setNumber} onChange={setSetNumber} />
        <NumField label="Weight (kg)" step={2.5} value={weight} onChange={setWeight} />
        <NumField label="Reps" step={1} value={reps} onChange={setReps} />
        <NumField label="RPE" step={0.5} min={1} max={10} value={rpe} onChange={setRpe} />
      </div>
      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="w-full"
      >
        <Save className="mr-1 h-4 w-4" /> Log set
      </Button>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
        >
          −
        </Button>
        <Input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const next = +(value + step).toFixed(2);
            onChange(max !== undefined ? Math.min(max, next) : next);
          }}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function StartTodayRow({
  session,
  plannedDate,
  athleteId,
  todayStr,
}: {
  session: PlannedSession;
  plannedDate: string;
  athleteId: string;
  todayStr: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      // Find an existing override for this planned session (any source_type='planned').
      const { data: existing, error: selErr } = await supabase
        .from("session_schedule_overrides")
        .select("id")
        .eq("owner_id", athleteId)
        .eq("source_type", "planned")
        .eq("source_id", session.id)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing) {
        const { error } = await supabase
          .from("session_schedule_overrides")
          .update({
            scheduled_date: todayStr,
            cancelled_at: null,
            cancel_reason: null,
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("session_schedule_overrides")
          .insert({
            owner_id: athleteId,
            source_type: "planned",
            source_id: session.id,
            scheduled_date: todayStr,
            confirmed_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Session moved to today — start logging!");
      queryClient.invalidateQueries({ queryKey: ["today-overrides-planned", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["today-overrides-any", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["today-crossweek-sessions", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-plan", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const niceDate = format(new Date(plannedDate + "T00:00:00"), "EEE, MMM d");

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {session.title ?? `Day ${session.day_of_week} session`}
        </div>
        <div className="text-xs text-muted-foreground">
          Scheduled: {niceDate} · {session.planned_exercises.length} exercises
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {mutation.isPending ? "Moving…" : "Start today"}
      </Button>
    </div>
  );
}
