import { useWarmupLoads } from "@/components/WarmupLoadsCard";
import { CompetitionDayToday } from "@/components/CompetitionDayCard";
import { FinishPushButton } from "@/components/PushProgressionCard";
import { firstSetInstruction } from "@/lib/pushPresentation";
import { BULK_LOG_MIN_SETS, isPercentRow, loggedRpeText, rpeRequired } from "@/lib/percentRows";
import { BUILDER_DEFAULT_STEP_KG, BUILDER_LAST_SET_RPE, BUILDER_RPE, builderTarget, builderTargetMet, lastTimeText, type BuilderLogSet, type BuilderTarget } from "@/lib/builderExercises";
import { START_WEIGHT_TOLERANCE_KG } from "@/lib/pushProgression";
import { WarmupReferenceFields } from "@/components/WarmupReferenceFields";
import { matchesWarmupLoad } from "@/lib/warmupReference";
import { SessionFeedbackRow } from "@/components/SessionFeedbackRow";
import { isReadinessLift, lookupBaseline } from "@/lib/eakoefficient";
import { fetchPlannedLightDates } from "@/lib/plannedLightDays";
import { canAddExtraSet } from "@/lib/blockVolume";
import { moveSessionLogs } from "@/lib/calendar";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  readinessAction,
  readinessClasses,
  volumeQualityClasses,
  volumeQualityLabel,
  processLogs,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";
import { ReadinessGate } from "@/components/ReadinessGate";
import { EnduranceTodayCard } from "@/components/EnduranceTodayCard";
import { ReturnToLoadCard } from "@/components/ReturnToLoadCard";
import { AddExtraExerciseInline } from "@/components/AddExtraExerciseInline";
import { plannedSessionDate } from "@/lib/planned-session-dates";

export const Route = createFileRoute("/_app/today")({
  head: () => ({
    meta: [
      { title: "Today's Session — SETPOINT" },
      { name: "description", content: "Log today's lifts and see your readiness in real time." },
      { property: "og:title", content: "Today's Session — SETPOINT" },
      { property: "og:description", content: "Log today's lifts and see your readiness in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TodayPage,
});

const setSchema = z.object({
  weight_kg: z.number().min(0).max(1000),
  reps: z.number().int().min(1).max(50),
  rpe: z.number().min(1).max(10).nullable(),
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
  target_pct?: number | null;
  lengthened_partials: boolean;
  last_set_to_failure: boolean;
  notes: string | null;
  order_index: number;
  is_technique?:boolean;
  push_main?: boolean;
  push_lift?: string | null;
  rules_version?: string | null;
  builder_lift?: string | null;
  target_reps_max?: number | null;
  weight_step_kg?: number | null;
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
  rpe: number | null;
  comment: string | null;
  form_score: number | null;
  planned_exercise_id: string | null;
  is_warmup_reference?: boolean;
  is_technique?:boolean;
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
      const selectCols = `id, week_start_date, status,
           planned_sessions (
             id, day_of_week, title, notes,
             planned_exercises (
               id, exercise, variation, target_sets, target_reps,
               target_rpe, target_rir, intensity_metric,
               target_weight_kg, target_pct, lengthened_partials, last_set_to_failure,
               notes, order_index, is_technique, push_main, push_lift, rules_version,
               builder_lift, target_reps_max, weight_step_kg
             )
           )`;
      // Prefer the current (or most recent past) published week.
      const { data, error } = await supabase
        .from("week_plans")
        .select(selectCols)
        .eq("athlete_id", userId)
        .eq("status", "published")
        .lte("week_start_date", todayStr)
        .order("week_start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      let wp = data as {
        id: string; week_start_date: string; status: string;
        planned_sessions: Omit<PlannedSession, "week_plan_id" | "week_start_date">[];
      } | null;
      // Fallback: no current week → surface the next upcoming published week so
      // the athlete can still start a session ahead of schedule.
      if (!wp) {
        const { data: upcoming, error: upErr } = await supabase
          .from("week_plans")
          .select(selectCols)
          .eq("athlete_id", userId)
          .eq("status", "published")
          .gt("week_start_date", todayStr)
          .order("week_start_date", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (upErr) throw upErr;
        wp = upcoming as typeof wp;
      }
      if (!wp) return null;
      return {
        ...wp,
        planned_sessions: wp.planned_sessions.map((s) => ({
          ...s,
          week_plan_id: wp!.id,
          week_start_date: wp!.week_start_date,
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
             target_weight_kg, target_pct, lengthened_partials, last_set_to_failure,
             notes, order_index, is_technique, push_main, push_lift, rules_version,
               builder_lift, target_reps_max, weight_step_kg
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

  const lightDatesQuery = useQuery({
    queryKey: ["planned-light-dates", userId],
    queryFn: () => fetchPlannedLightDates(userId),
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
        .eq("is_warmup_reference", false)
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
          is_warmup_reference: l.is_warmup_reference,
          is_technique:l.is_technique,
          set_number: l.set_number,
          reps: l.reps,
          weight_kg: Number(l.weight_kg),
          rpe: Number(l.rpe),
        })),
        baselines,
        lightDatesQuery.data,
      ),
    [logs, baselines, lightDatesQuery.data],
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

      {!isLoading && <ReturnToLoadCard athleteId={userId} dateStr={todayStr} />}

      {!isLoading && <CompetitionDayToday athleteId={userId} dateStr={todayStr} />}

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

      {logs.some((l) => l.is_warmup_reference) && <div className="space-y-1 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Uppvärmningsset</p>
        {logs.filter((l) => l.is_warmup_reference).map((l) => <p key={l.id} className="text-xs text-muted-foreground">{l.exercise} · {l.reps}×{l.weight_kg} kg · RPE {loggedRpeText(l.rpe)}</p>)}
      </div>}
      {/* Always show today's logged sets */}
      {processed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Loggade set idag</CardTitle>
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
                    @RPE {loggedRpeText(p.source.rpe)}
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
                      ? `Dagsform ${p.eaKoefficient.toFixed(0)} %`
                      : p.dailyE1RM > 0 ? `${p.dailyE1RM.toFixed(0)}kg E1RM` : "Ingen RPE"}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Följ instruktionen vid varje övning: står det en vikt börjar du där, annars väljer du vikt efter mål-RPE.
        Logga alltid vikt, reps och <span className="font-medium">faktisk RPE</span>.
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
  const extraPreferences=useQuery({queryKey:["generator-preferences",athleteId],queryFn:async()=>{
    const {data,error}=await supabase.from("athlete_generator_preferences").select("settings").eq("athlete_id",athleteId).maybeSingle();
    if(error) throw error;
    const settings=data?.settings as {extraSets?:Record<string,boolean>}|undefined;
    return settings?.extraSets??{};
  }});
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
    return [...linked, ...unlinked].filter((l) => !l.is_warmup_reference);
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
                baseline={lookupBaseline(baselines, ex.exercise) ?? 0}
                athleteId={athleteId}
                dateStr={dateStr}
                coachExtraEnabled={extraPreferences.data?.[/squat|böj/i.test(ex.exercise)?"squat":/bench|bänk/i.test(ex.exercise)?"bench":/deadlift|mark/i.test(ex.exercise)?"deadlift":"none"]===true}
                sessionSets={logs.filter(l=>!l.is_warmup_reference).length}
              />
            );
          })}
        <AddExtraExerciseInline athleteId={athleteId} dateStr={dateStr} />
        {allDone && <SessionFeedbackRow athleteId={athleteId} dateStr={dateStr} />}
        {inProgress && <PauseSessionRow sessionId={session.id} athleteId={athleteId} />}
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
  const [rpe, setRpe] = useState(log.rpe == null ? "" : String(log.rpe));

  const save = useMutation({
    mutationFn: async () => {
      // A set logged without RPE may stay unrated; a rated set keeps needing one.
      if (rpe.trim() === "" && log.rpe != null) throw new Error("Ange RPE för setet.");
      const parsed = setSchema.parse({
        reps: Number(reps),
        weight_kg: Number(weight),
        rpe: rpe.trim() === "" ? null : Number(rpe.replace(",", ".")),
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
        placeholder="–"
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

/** Byggövning: last logged session of the same exercise before today, and today's double-progression target. */
function useBuilderTarget(ex: PlannedExercise, athleteId: string, dateStr: string, todayLogs: LogRow[]) {
  const enabled = Boolean(ex.builder_lift);
  const q = useQuery({
    queryKey: ["builder-last", athleteId, ex.exercise, dateStr],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("training_logs")
        .select("date, set_number, reps, weight_kg, is_warmup_reference")
        .eq("athlete_id", athleteId).eq("exercise", ex.exercise).lt("date", dateStr)
        .order("date", { ascending: false }).order("set_number", { ascending: true }).limit(40);
      if (error) throw error;
      const rows = (data ?? []).filter((r) => !r.is_warmup_reference);
      const last = rows.length ? rows[0].date : null;
      return rows.filter((r) => r.date === last).map((r) => ({ weight_kg: Number(r.weight_kg), reps: r.reps, set_number: r.set_number }));
    },
  });
  if (!enabled) return { target: null, last: [] as BuilderLogSet[], met: false, loading: false };
  const last = q.data ?? [];
  const target = q.isSuccess ? builderTarget(last, ex.target_reps, ex.target_reps_max ?? ex.target_reps, Number(ex.weight_step_kg ?? BUILDER_DEFAULT_STEP_KG), ex.target_sets) : null;
  const today = todayLogs.filter((l) => !l.is_warmup_reference).map((l) => ({ weight_kg: Number(l.weight_kg), reps: l.reps }));
  return { target, last, met: target ? builderTargetMet(target, today, ex.target_sets) : false, loading: q.isLoading };
}

function BuilderTargetBox({ target, last, met, loading }: { target: BuilderTarget | null; last: BuilderLogSet[]; met: boolean; loading: boolean }) {
  if (loading) return <p className="mt-2 text-xs text-muted-foreground">Hämtar förra gången…</p>;
  if (!target) return null;
  return (
    <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/40 p-2 text-sm">
      {last.length > 0 && <p><span className="text-muted-foreground">Förra gången:</span> {lastTimeText(last)}</p>}
      <p><span className="font-medium">{target.kind === "none" ? "Första gången:" : "Mål i dag:"}</span> {target.text}</p>
      {met && <p className="flex items-center gap-1 font-medium text-primary"><CheckCircle2 className="h-4 w-4" /> Målet är nått.</p>}
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
  coachExtraEnabled,
  sessionSets,
}: {
  ex: PlannedExercise;
  logs: LogRow[];
  processed: ReturnType<typeof processLogs<any>>;
  baseline: number;
  athleteId: string;
  dateStr: string;
  coachExtraEnabled: boolean;
  sessionSets: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const completed = logs.length;
  const targetSets = ex.target_sets;
  const isDone = completed >= targetSets;
  const pctRow = isPercentRow(ex);
  const pctText = pctRow ? `${String(Number(ex.target_pct)).replace(".", ",")} % av ditt max` : null;
  const builder = useBuilderTarget(ex, athleteId, dateStr, logs);

  const intensityLabel = pctRow ? null :
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
            {ex.builder_lift ? `Byggövning · ${ex.target_sets} set × ${ex.target_reps}–${ex.target_reps_max ?? ex.target_reps} reps @ RPE ${BUILDER_RPE}, sista setet RPE ${BUILDER_LAST_SET_RPE}` : ex.notes?.includes("Setupplägg:") ? `${ex.target_sets} arbetsset · första setet: ${ex.target_reps} reps` : `Mål: ${ex.target_sets}×${ex.target_reps}`}
            {intensityLabel && !ex.builder_lift && ` @ ${intensityLabel}`}
            {ex.target_weight_kg != null && ` · ${ex.push_main && ex.rules_version === "push-2.0" ? "Startvikt: " : ""}${ex.target_weight_kg} kg`}
            {pctText && <span className="ml-1 text-[11px]">({pctText})</span>}
          </p>
          {(ex.lengthened_partials || ex.last_set_to_failure) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ex.lengthened_partials && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                  + Halvreps i utsträckt läge efter sista fulla rep
                </span>
              )}
              {ex.last_set_to_failure && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  Sista setet till failure
                </span>
              )}
            </div>
          )}
          {pctRow && <p className="mt-2 text-sm">{ex.target_weight_kg != null ? `Fast vikt: ${ex.target_weight_kg} kg på alla set. Behåll vikten även om det känns lätt. ${rpeRequired(ex, 1) ? "Ange RPE på första setet; på övriga set är RPE frivilligt." : "RPE är frivilligt på alla set."}` : "Vikten saknas eftersom din coach inte har lagt in något max för övningen. Fråga din coach."}</p>}
          {ex.builder_lift && <BuilderTargetBox target={builder.target} last={builder.last} met={builder.met} loading={builder.loading} />}
          {!pctRow && !ex.builder_lift && (ex.push_main || ex.target_weight_kg == null) && <p className="mt-2 text-sm">{ex.push_main && ex.rules_version !== "push-2.0" ? "Detta sparade pass har samma målvikter för huvudseten. Logga faktisk RPE; sänk vikten om den blir för tung. Ändrad vikt ger ingen automatisk höjning." : firstSetInstruction(ex.target_weight_kg, ex.target_rpe)}</p>}
          {ex.notes && !ex.notes.startsWith("Fyra arbetsset på angiven vikt.") && (
            <p className="mt-1 whitespace-pre-line text-xs italic text-muted-foreground">
              {ex.notes}
            </p>
          )}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {completed}/{targetSets}
        </span>
      </div>

      {ex.push_main && <div className="mb-3 border-t border-border pt-3"><FinishPushButton exerciseId={ex.id} exerciseName={ex.exercise} ready={isDone}/></div>}
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
                    @RPE {loggedRpeText(p.source.rpe)}
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

      {!isDone && pctRow && ex.target_weight_kg != null && targetSets >= BULK_LOG_MIN_SETS && targetSets - completed >= 2 && (
        <BulkLogPlannedSets ex={ex} fromSet={completed + 1} athleteId={athleteId} dateStr={dateStr} />
      )}
      {!isDone && (
        <LogSetButton
          ex={ex}
          nextSet={completed + 1}
          baseline={baseline}
          previousLog={logs[logs.length - 1]}
          defaultWeight={builder.target && builder.target.kind !== "none" ? builder.target.weightKg : undefined}
          athleteId={athleteId}
          dateStr={dateStr}
        />
      )}
      {isDone && (() => {
        const extra = canAddExtraSet({
          coachEnabled:coachExtraEnabled,
          sessionSets,
          plannedSets: targetSets,
          doneSets: logs.map((l) => ({ reps: l.reps, weight_kg: Number(l.weight_kg), rpe: Number(l.rpe), set_number: l.set_number })),
          targetRpe: ex.target_rpe != null ? Number(ex.target_rpe) : ex.target_rir != null ? 10 - Number(ex.target_rir) : null,
          isLightOrSingle: ex.target_reps <= 1 || /deload|toppning|peak|taper|singel|single/i.test(`${ex.notes ?? ""} ${ex.variation ?? ""}`),
        });
        if (!extra.reason) return null;
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{extra.reason}</p>
            {extra.allowed && (
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
      })()}
    </div>
  );
}

function LogSetButton({
  ex,
  nextSet,
  baseline,
  previousLog,
  defaultWeight,
  athleteId,
  dateStr,
}: {
  ex: PlannedExercise;
  nextSet: number;
  baseline: number;
  previousLog: LogRow | undefined;
  /** Byggövning: today's target weight when no set is logged yet. */
  defaultWeight?: number;
  athleteId: string;
  dateStr: string;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState<number>(
    // Percent rows: the planned weight is fixed on every set.
    isPercentRow(ex) && ex.target_weight_kg != null ? Number(ex.target_weight_kg)
      : previousLog ? Number(previousLog.weight_kg) : defaultWeight != null ? defaultWeight : ex.target_weight_kg == null ? NaN : Number(ex.target_weight_kg),
  );
  const [reps, setReps] = useState<number>(
    previousLog ? previousLog.reps : ex.target_reps,
  );
  const [rpe, setRpe] = useState<number>(NaN);
  // Byggövning: today's target weight arrives after the last session loads.
  useEffect(() => {
    if (!previousLog && defaultWeight != null && !isPercentRow(ex)) setWeight((w) => (Number.isFinite(w) ? w : defaultWeight));
  }, [defaultWeight, previousLog, ex]);
  const [rir, setRir] = useState<number>(
    NaN,
  );
  const [partials, setPartials] = useState<boolean>(ex.lengthened_partials);
  const [toFailure, setToFailure] = useState<boolean>(
    ex.last_set_to_failure && nextSet === ex.target_sets,
  );
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();
  const warmupLoads = useWarmupLoads(athleteId);
  const [warmup, setWarmup] = useState(false);
  const [warmupRpe, setWarmupRpe] = useState<number | null>(null);

  const matchesWarmup = matchesWarmupLoad(ex.exercise, ex.variation, weight, warmupLoads.data ?? {});
  const isWarmup = matchesWarmup && warmup;
  const usingRir = ex.intensity_metric === "rir";
  const lockedStart = ex.push_main && ex.rules_version === "push-2.0" && nextSet === 1 && ex.target_weight_kg != null ? Number(ex.target_weight_kg) : null;
  const effectiveRpe = isWarmup ? warmupRpe ?? 6 : usingRir ? rirToRpe(rir) : rpe;
  const needsRpe = isWarmup || rpeRequired(ex, nextSet);
  const rated = Number.isFinite(effectiveRpe) && effectiveRpe > 0;

  const livePreview = useMemo(() => {
    const e1rm = dailyE1RM({ weight_kg: weight, reps, rpe: effectiveRpe });
    const eak =
      baseline > 0 && isReadinessLift(ex.exercise, ex.variation)
        ? eaKoefficient({ weight_kg: weight, reps, rpe: effectiveRpe, is_warmup_reference: isWarmup, is_technique: ex.is_technique }, baseline)
        : 0;
    const status = readinessFromEAk(eak);
    return { e1rm, eak, status };
  }, [weight, reps, effectiveRpe, baseline, ex.exercise, ex.variation, ex.is_technique, isWarmup]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!rated && needsRpe) throw new Error("Välj faktisk RPE eller reps kvar innan setet sparas.");
      if (isWarmup && warmupRpe === null) throw new Error("Välj uppvärmnings-RPE.");
      if (lockedStart != null && !isWarmup && Math.abs(weight - lockedStart) > START_WEIGHT_TOLERANCE_KG + 1e-9) throw new Error(`Första arbetssetet ska ligga på ${lockedStart} kg (±${START_WEIGHT_TOLERANCE_KG} kg).`);
      const parsed = setSchema.parse({
        weight_kg: weight,
        reps,
        rpe: rated ? effectiveRpe : null,
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
        is_warmup_reference: isWarmup,
        is_technique:ex.is_technique===true,
        rir: !isWarmup && usingRir && Number.isFinite(rir) ? rir : null,
        lengthened_partials: !isWarmup && partials,
        to_failure: !isWarmup && toFailure,
        comment: parsed.comment ?? null,
        planned_exercise_id: ex.id,
        actively_confirmed: !isWarmup,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isWarmup ? "Uppvärmningsset sparat." : `Set ${nextSet} logged`);
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      setOpen(false);
      setComment("");
      setWarmup(false);
      setWarmupRpe(null);
      setRpe(NaN);
      setRir(NaN);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const intensityLabel = isPercentRow(ex)
    ? `fast vikt (${String(Number(ex.target_pct)).replace(".", ",")} %)`
    : usingRir
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
          Logga set {nextSet} av {ex.target_sets}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {ex.exercise} — Set {nextSet}
          </SheetTitle>
          <SheetDescription>
            Mål: {ex.target_reps} reps @ {intensityLabel}
            {ex.target_weight_kg != null && (!ex.push_main || ex.rules_version !== "push-2.0" || nextSet === 1) && ` · ${ex.push_main && ex.rules_version === "push-2.0" ? "Startvikt: " : ""}${ex.target_weight_kg} kg`}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 py-4">
          {lockedStart != null && !isWarmup ? (
            <div className="space-y-1">
              <NumField label="Vikt (kg)" step={2.5} min={lockedStart - START_WEIGHT_TOLERANCE_KG} max={lockedStart + START_WEIGHT_TOLERANCE_KG} value={weight} onChange={setWeight} />
              <p className="text-xs text-muted-foreground">Startvikten är fast: {lockedStart} kg, högst ±{START_WEIGHT_TOLERANCE_KG} kg. Följande set väljer du efter RPE.</p>
            </div>
          ) : (
            <NumField label="Vikt (kg)" step={2.5} value={weight} onChange={setWeight} />
          )}
          <NumField label="Reps" step={1} value={reps} onChange={setReps} />
          {matchesWarmup && <WarmupReferenceFields checked={warmup} rpe={warmupRpe} onChecked={setWarmup} onRpe={setWarmupRpe} />}
          {!isWarmup && (usingRir ? (
            <NumField label={needsRpe ? "RIR (reps in reserve)" : "RIR (valfritt)"} step={1} min={0} max={10} value={rir} onChange={setRir} />
          ) : (
            <NumField label={needsRpe ? "Faktisk RPE" : "Faktisk RPE (valfritt)"} step={0.5} min={1} max={10} value={rpe} onChange={setRpe} />
          ))}
          {!isWarmup && !needsRpe && <p className="-mt-2 text-xs text-muted-foreground">Vikten är fast, så RPE behövs inte på det här setet. Fyll i den om du vill.</p>}

          <div className="flex flex-wrap gap-4 rounded-md border border-border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={partials}
                onCheckedChange={(v) => setPartials(v === true)}
              />
              Halvreps i utsträckt läge
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={toFailure}
                onCheckedChange={(v) => setToFailure(v === true)}
              />
              Setet till failure
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Kommentar (valfritt)</Label>
            <Input
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Kändes tungt / snabbt / osv."
            />
          </div>

          {!isWarmup && rated && <div className="rounded-lg border border-border bg-readiness-tint p-3">
            <div className="text-xs font-medium text-muted-foreground">
              Beräknat max (E1RM) för setet
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
                  Dagsform {livePreview.eak.toFixed(0)} %
                </span>
              )}
              {baseline > 0 && readinessAction(livePreview.status) && (
                <span className="text-xs text-muted-foreground">{readinessAction(livePreview.status)}</span>
              )}
            </div>
          </div>}
        </div>
        <SheetFooter className="px-4 pb-4">
          <Button
            className="w-full"
            size="lg"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || warmupLoads.isLoading || warmupLoads.isError || (isWarmup && warmupRpe === null)}
          >
            <Save className="mr-1 h-4 w-4" />
            {mutation.isPending ? "Saving…" : "Save set"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Percent rows with many equal sets: log every remaining set at the planned
 * weight and reps in one go. The athlete gives one RPE for the sets and can
 * edit each logged set afterwards.
 */
function BulkLogPlannedSets({
  ex,
  fromSet,
  athleteId,
  dateStr,
}: {
  ex: PlannedExercise;
  fromSet: number;
  athleteId: string;
  dateStr: string;
}) {
  const [open, setOpen] = useState(false);
  const [rpe, setRpe] = useState<number>(NaN);
  const queryClient = useQueryClient();
  const remaining = ex.target_sets - fromSet + 1;
  const needsRpe = rpeRequired(ex, fromSet);
  const mutation = useMutation({
    mutationFn: async () => {
      const rated = Number.isFinite(rpe) && rpe > 0;
      if (!rated && needsRpe) throw new Error("Välj hur tungt första setet kändes (RPE).");
      const parsed = setSchema.parse({ weight_kg: Number(ex.target_weight_kg), reps: ex.target_reps, rpe: rated ? rpe : null });
      const rows = Array.from({ length: remaining }, (_, i) => ({
        athlete_id: athleteId,
        date: dateStr,
        exercise: ex.exercise,
        variation: ex.variation,
        set_number: fromSet + i,
        reps: parsed.reps,
        weight_kg: parsed.weight_kg,
        rpe: parsed.rpe,
        is_warmup_reference: false,
        is_technique: ex.is_technique === true,
        planned_exercise_id: ex.id,
        actively_confirmed: true,
      }));
      const { error } = await supabase.from("training_logs").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${remaining} set loggade som planerat. Ändra ett set med pennan om något blev annorlunda.`);
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      setOpen(false);
      setRpe(NaN);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="mb-2 h-auto w-full whitespace-normal py-2">
          Logga alla set som planerat
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{ex.exercise} — logga alla set</SheetTitle>
          <SheetDescription>
            Set {fromSet}–{ex.target_sets}: {ex.target_reps} reps på {ex.target_weight_kg} kg. Använd bara detta om du gjorde seten som planerat.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 py-4">
          <NumField label={needsRpe ? "Hur tunga kändes seten? (faktisk RPE)" : "Hur tunga kändes seten? (RPE, valfritt)"} step={0.5} min={1} max={10} value={rpe} onChange={setRpe} />
          <p className="text-xs text-muted-foreground">{needsRpe ? "Samma RPE sparas på alla set." : "Lämna tomt om du inte vill ange RPE. Fyller du i den sparas den på alla set."} Du kan ändra vikt, reps eller RPE på varje set efteråt.</p>
        </div>
        <SheetFooter className="px-4 pb-4">
          <Button className="w-full" size="lg" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Save className="mr-1 h-4 w-4" />
            {mutation.isPending ? "Sparar…" : `Spara ${remaining} set`}
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
  const warmupLoads = useWarmupLoads(athleteId);
  const [warmup, setWarmup] = useState(false);
  const [warmupRpe, setWarmupRpe] = useState<number | null>(null);

  const matchesWarmup = matchesWarmupLoad(exercise, null, weight, warmupLoads.data ?? {});
  const isWarmup = matchesWarmup && warmup;
  const mutation = useMutation({
    mutationFn: async () => {
      if (isWarmup && warmupRpe === null) throw new Error("Välj uppvärmnings-RPE.");
      const parsed = setSchema.parse({ weight_kg: weight, reps, rpe: isWarmup ? warmupRpe : rpe });
      const { error } = await supabase.from("training_logs").insert({
        athlete_id: athleteId,
        date: dateStr,
        exercise,
        variation: null,
        set_number: setNumber,
        reps: parsed.reps,
        weight_kg: parsed.weight_kg,
        rpe: parsed.rpe,
        is_warmup_reference: isWarmup,
        comment: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Set logged");
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      if (!isWarmup) setSetNumber((n) => n + 1);
      setWarmup(false);
      setWarmupRpe(null);
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
        <NumField label="Vikt (kg)" step={2.5} value={weight} onChange={setWeight} />
        <NumField label="Reps" step={1} value={reps} onChange={setReps} />
        {!isWarmup && <NumField label="RPE" step={0.5} min={1} max={10} value={rpe} onChange={setRpe} />}
      </div>
      {matchesWarmup && <WarmupReferenceFields checked={warmup} rpe={warmupRpe} onChecked={setWarmup} onRpe={setWarmupRpe} />}
      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || warmupLoads.isLoading || warmupLoads.isError || (isWarmup && warmupRpe === null)}
        className="w-full"
      >
        <Save className="mr-1 h-4 w-4" /> Logga set
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
          onClick={() => onChange(Math.max(min, +((Number.isFinite(value) ? value : min + step) - step).toFixed(2)))}
        >
          −
        </Button>
        <Input
          type="number"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          className="text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            const next = +((Number.isFinite(value) ? value : min - step) + step).toFixed(2);
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
      await moveSessionLogs(athleteId, session.id, todayStr);
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

function PauseSessionRow({ sessionId, athleteId }: { sessionId: string; athleteId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return format(d, "yyyy-MM-dd");
  });
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("split_planned_session", {
      _session_id: sessionId,
      _target_date: date,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Resten av passet är flyttat");
    setOpen(false);
    for (const k of ["today-overrides-planned", "today-overrides-any", "today-crossweek-sessions", "athlete-plan"]) {
      queryClient.invalidateQueries({ queryKey: [k, athleteId] });
    }
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };
  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Pausa passet och flytta resten
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm text-muted-foreground">
        Övningar du inte loggat något på flyttas till ett eget pass på valt datum.
      </p>
      <Label htmlFor="pause-date">Nytt datum</Label>
      <Input id="pause-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={run} disabled={busy || !date}>
          {busy ? "Flyttar…" : "Flytta resten"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
      </div>
    </div>
  );
}
