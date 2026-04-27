import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, addWeeks } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Send,
  Trash2,
  EyeOff,
  GripVertical,
  Copy,
  CopyPlus,
  Pencil,
  Check,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  prescribedWeightKg,
  type IntensityMetric,
} from "@/lib/intensity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/coach/athletes/$athleteId/cycles/$cycleId",
)({
  head: () => ({
    meta: [
      { title: "Mesocycle builder — EA Training System Coach" },
      {
        name: "description",
        content:
          "Plan each microcycle and publish 1–2 weeks at a time to the athlete.",
      },
    ],
  }),
  component: CycleDetailPage,
});

function dayLabel(index: number) {
  return `Day ${index + 1}`;
}

interface Cycle {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  total_weeks: number;
  days_per_week: number;
  status: "draft" | "active" | "archived";
  notes: string | null;
}

interface WeekPlanRow {
  id: string;
  week_index: number | null;
  week_start_date: string;
  status: "draft" | "published" | "archived";
}

interface PlannedExerciseRow {
  id: string;
  planned_session_id: string;
  exercise_id: string | null;
  exercise: string;
  variation: string | null;
  target_sets: number;
  target_reps: number;
  target_rpe: number | null;
  target_rir: number | null;
  intensity_metric: IntensityMetric;
  target_weight_kg: number | null;
  lengthened_partials: boolean;
  last_set_to_failure: boolean;
  notes: string | null;
  order_index: number;
}

interface PlannedSessionRow {
  id: string;
  week_plan_id: string;
  day_of_week: number;
  title: string | null;
  notes: string | null;
}

interface ExerciseLib {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  default_intensity_metric: IntensityMetric;
}

interface BaselineRow {
  exercise: string;
  one_rm_kg: number;
}

function CycleDetailPage() {
  const { athleteId, cycleId } = useParams({
    from: "/coach/athletes/$athleteId/cycles/$cycleId",
  });
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();
  const [activeWeek, setActiveWeek] = useState(0);

  const cycleQuery = useQuery({
    queryKey: ["mesocycle", cycleId],
    queryFn: async (): Promise<Cycle | null> => {
      const { data, error } = await supabase
        .from("mesocycles")
        .select("id, name, goal, start_date, total_weeks, days_per_week, status, notes")
        .eq("id", cycleId)
        .maybeSingle();
      if (error) throw error;
      return data as Cycle | null;
    },
  });

  const weeksQuery = useQuery({
    queryKey: ["meso-weeks", cycleId],
    queryFn: async (): Promise<WeekPlanRow[]> => {
      const { data, error } = await supabase
        .from("week_plans")
        .select("id, week_index, week_start_date, status")
        .eq("mesocycle_id", cycleId)
        .order("week_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WeekPlanRow[];
    },
    enabled: !!cycleQuery.data,
  });

  const exerciseLibQuery = useQuery({
    queryKey: ["exercises"],
    queryFn: async (): Promise<ExerciseLib[]> => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, name, category, description, default_intensity_metric")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseLib[];
    },
  });

  // Athlete's 1RMs — used to compute prescribed kg from RPE/RIR. Coach only.
  const baselinesQuery = useQuery({
    queryKey: ["athlete-baselines", athleteId],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", athleteId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as BaselineRow[]) {
        map[row.exercise] = Number(row.one_rm_kg);
      }
      return map;
    },
  });

  const ensureWeeksMutation = useMutation({
    mutationFn: async () => {
      const cycle = cycleQuery.data!;
      const existing = weeksQuery.data ?? [];
      const haveIndices = new Set(existing.map((w) => w.week_index));
      const toInsert: Array<{
        coach_id: string;
        athlete_id: string;
        mesocycle_id: string;
        week_index: number;
        week_start_date: string;
        status: "draft";
      }> = [];
      for (let i = 0; i < cycle.total_weeks; i++) {
        if (haveIndices.has(i)) continue;
        toInsert.push({
          coach_id: userId,
          athlete_id: athleteId,
          mesocycle_id: cycle.id,
          week_index: i,
          week_start_date: format(
            addWeeks(parseISO(cycle.start_date), i),
            "yyyy-MM-dd",
          ),
          status: "draft",
        });
      }
      if (toInsert.length > 0) {
        const { error } = await supabase.from("week_plans").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meso-weeks", cycleId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (
      cycleQuery.data &&
      weeksQuery.data &&
      weeksQuery.data.length < cycleQuery.data.total_weeks &&
      !ensureWeeksMutation.isPending
    ) {
      ensureWeeksMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleQuery.data?.id, weeksQuery.data?.length]);

  const togglePublishMutation = useMutation({
    mutationFn: async (input: { weekId: string; publish: boolean }) => {
      const { error } = await supabase
        .from("week_plans")
        .update({ status: input.publish ? "published" : "draft" })
        .eq("id", input.weekId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meso-weeks", cycleId] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Copy entire structure from one week to another
  const copyWeekMutation = useMutation({
    mutationFn: async (input: { fromWeekId: string; toWeekId: string }) => {
      // Load source sessions + exercises
      const { data: srcSess, error: e1 } = await supabase
        .from("planned_sessions")
        .select("id, day_of_week, title, notes")
        .eq("week_plan_id", input.fromWeekId);
      if (e1) throw e1;
      const srcSessions = srcSess ?? [];
      const srcIds = srcSessions.map((s) => s.id);
      let srcExes: PlannedExerciseRow[] = [];
      if (srcIds.length) {
        const { data: ex, error: e2 } = await supabase
          .from("planned_exercises")
          .select(
            "id, planned_session_id, exercise_id, exercise, variation, target_sets, target_reps, target_rpe, target_rir, intensity_metric, target_weight_kg, lengthened_partials, last_set_to_failure, notes, order_index",
          )
          .in("planned_session_id", srcIds);
        if (e2) throw e2;
        srcExes = (ex ?? []) as PlannedExerciseRow[];
      }

      // Wipe destination sessions (cascade-ish: delete exercises then sessions)
      const { data: dstSess } = await supabase
        .from("planned_sessions")
        .select("id")
        .eq("week_plan_id", input.toWeekId);
      const dstIds = (dstSess ?? []).map((s) => s.id);
      if (dstIds.length) {
        await supabase
          .from("planned_exercises")
          .delete()
          .in("planned_session_id", dstIds);
        await supabase.from("planned_sessions").delete().in("id", dstIds);
      }

      // Insert new sessions and remember mapping
      for (const s of srcSessions) {
        const { data: newSess, error: e3 } = await supabase
          .from("planned_sessions")
          .insert({
            week_plan_id: input.toWeekId,
            day_of_week: s.day_of_week,
            title: s.title,
            notes: s.notes,
          })
          .select("id")
          .single();
        if (e3) throw e3;
        const sessExes = srcExes.filter((e) => e.planned_session_id === s.id);
        if (sessExes.length) {
          const { error: e4 } = await supabase.from("planned_exercises").insert(
            sessExes.map((e) => ({
              planned_session_id: newSess.id,
              exercise_id: e.exercise_id,
              exercise: e.exercise,
              variation: e.variation,
              target_sets: e.target_sets,
              target_reps: e.target_reps,
              target_rpe: e.target_rpe,
              target_rir: e.target_rir,
              intensity_metric: e.intensity_metric,
              target_weight_kg: e.target_weight_kg,
              lengthened_partials: e.lengthened_partials,
              last_set_to_failure: e.last_set_to_failure,
              notes: e.notes,
              order_index: e.order_index,
            })),
          );
          if (e4) throw e4;
        }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["week-sessions", vars.toWeekId] });
      toast.success("Week copied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (cycleQuery.isLoading || !cycleQuery.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const cycle = cycleQuery.data;
  const weeks = weeksQuery.data ?? [];
  const publishedCount = weeks.filter((w) => w.status === "published").length;
  const currentWeek = weeks[activeWeek];
  const previousWeek = activeWeek > 0 ? weeks[activeWeek - 1] : null;

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link
            to="/coach/athletes/$athleteId/cycles"
            params={{ athleteId }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Mesocycles
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cycle.name}</h1>
            <p className="text-sm text-muted-foreground">
              {cycle.goal ? cycle.goal + " · " : ""}
              {cycle.total_weeks} weeks from{" "}
              {format(parseISO(cycle.start_date), "MMM d, yyyy")}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-1">
              {publishedCount} published
            </Badge>
            <Badge variant="outline">
              {weeks.length - publishedCount} draft
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2">
            {weeks.map((w, i) => (
              <button
                key={w.id}
                onClick={() => setActiveWeek(i)}
                className={cn(
                  "flex flex-col items-center rounded-md border px-3 py-2 text-xs transition-colors",
                  i === activeWeek
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="font-semibold">Week {i + 1}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(parseISO(w.week_start_date), "MMM d")}
                </span>
                <Badge
                  variant={w.status === "published" ? "default" : "outline"}
                  className="mt-1 px-1.5 py-0 text-[9px] capitalize"
                >
                  {w.status}
                </Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {currentWeek && (
        <WeekEditor
          key={currentWeek.id}
          week={currentWeek}
          weekIndex={activeWeek}
          previousWeek={previousWeek}
          exerciseLib={exerciseLibQuery.data ?? []}
          baselines={baselinesQuery.data ?? {}}
          onTogglePublish={(publish) =>
            togglePublishMutation.mutate({ weekId: currentWeek.id, publish })
          }
          onCopyFromPrevious={() => {
            if (!previousWeek) return;
            if (
              !confirm(
                `Replace Week ${activeWeek + 1} with a copy of Week ${activeWeek}? This will overwrite any existing sessions.`,
              )
            )
              return;
            copyWeekMutation.mutate({
              fromWeekId: previousWeek.id,
              toWeekId: currentWeek.id,
            });
          }}
        />
      )}
    </div>
  );
}

function WeekEditor({
  week,
  weekIndex,
  previousWeek,
  exerciseLib,
  baselines,
  onTogglePublish,
  onCopyFromPrevious,
}: {
  week: WeekPlanRow;
  weekIndex: number;
  previousWeek: WeekPlanRow | null;
  exerciseLib: ExerciseLib[];
  baselines: Record<string, number>;
  onTogglePublish: (publish: boolean) => void;
  onCopyFromPrevious: () => void;
}) {
  const qc = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["week-sessions", week.id],
    queryFn: async () => {
      const { data: sess, error: e1 } = await supabase
        .from("planned_sessions")
        .select("id, week_plan_id, day_of_week, title, notes")
        .eq("week_plan_id", week.id)
        .order("day_of_week");
      if (e1) throw e1;
      const sessionIds = (sess ?? []).map((s) => s.id);
      let exes: PlannedExerciseRow[] = [];
      if (sessionIds.length) {
        const { data: ex, error: e2 } = await supabase
          .from("planned_exercises")
          .select(
            "id, planned_session_id, exercise_id, exercise, variation, target_sets, target_reps, target_rpe, target_rir, intensity_metric, target_weight_kg, lengthened_partials, last_set_to_failure, notes, order_index",
          )
          .in("planned_session_id", sessionIds)
          .order("order_index");
        if (e2) throw e2;
        exes = (ex ?? []) as PlannedExerciseRow[];
      }
      return {
        sessions: (sess ?? []) as PlannedSessionRow[],
        exercises: exes,
      };
    },
  });

  const addSessionMutation = useMutation({
    mutationFn: async (day: number) => {
      const { error } = await supabase.from("planned_sessions").insert({
        week_plan_id: week.id,
        day_of_week: day,
        title: `${DAYS[day]} session`,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSessionMutation = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<PlannedSessionRow> }) => {
      const { error } = await supabase
        .from("planned_sessions")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planned_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
  });

  const addExerciseMutation = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      exerciseLibId: string;
    }) => {
      const lib = exerciseLib.find((e) => e.id === input.exerciseLibId);
      if (!lib) throw new Error("Exercise not found");
      const existing = (sessionsQuery.data?.exercises ?? []).filter(
        (e) => e.planned_session_id === input.sessionId,
      );
      const metric = lib.default_intensity_metric ?? "rpe";
      const { error } = await supabase.from("planned_exercises").insert({
        planned_session_id: input.sessionId,
        exercise_id: lib.id,
        exercise: lib.name,
        target_sets: 3,
        target_reps: metric === "rir" ? 10 : 5,
        intensity_metric: metric,
        target_rpe: metric === "rpe" ? 7 : null,
        target_rir: metric === "rir" ? 2 : null,
        order_index: existing.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateExerciseMutation = useMutation({
    mutationFn: async (ex: PlannedExerciseRow) => {
      const existing = (sessionsQuery.data?.exercises ?? []).filter(
        (e) => e.planned_session_id === ex.planned_session_id,
      );
      const { error } = await supabase.from("planned_exercises").insert({
        planned_session_id: ex.planned_session_id,
        exercise_id: ex.exercise_id,
        exercise: ex.exercise,
        variation: ex.variation,
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        target_rpe: ex.target_rpe,
        target_rir: ex.target_rir,
        intensity_metric: ex.intensity_metric,
        target_weight_kg: ex.target_weight_kg,
        lengthened_partials: ex.lengthened_partials,
        last_set_to_failure: ex.last_set_to_failure,
        notes: ex.notes,
        order_index: existing.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateExerciseMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<PlannedExerciseRow>;
    }) => {
      const { error } = await supabase
        .from("planned_exercises")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planned_exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
  });

  const reorderExercisesMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update order_index for each
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase
            .from("planned_exercises")
            .update({ order_index: idx })
            .eq("id", id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week-sessions", week.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const exercises = sessionsQuery.data?.exercises ?? [];
  const sessionsByDay = new Map<number, PlannedSessionRow>();
  sessions.forEach((s) => sessionsByDay.set(s.day_of_week, s));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
        <div>
          <p className="text-sm font-semibold">
            Week {weekIndex + 1} — {format(parseISO(week.week_start_date), "MMM d")}
          </p>
          <p className="text-xs text-muted-foreground">
            {week.status === "published"
              ? "Visible to the athlete in their Today view."
              : "Only visible to you. Publish when the athlete is ready."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previousWeek && (
            <Button variant="outline" size="sm" onClick={onCopyFromPrevious}>
              <Copy className="mr-1 h-4 w-4" /> Copy from Week {weekIndex}
            </Button>
          )}
          <Button
            variant={week.status === "published" ? "outline" : "default"}
            size="sm"
            onClick={() => onTogglePublish(week.status !== "published")}
          >
            {week.status === "published" ? (
              <>
                <EyeOff className="mr-1 h-4 w-4" /> Unpublish
              </>
            ) : (
              <>
                <Send className="mr-1 h-4 w-4" /> Publish to athlete
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DAYS.map((dayName, day) => {
          const session = sessionsByDay.get(day);
          const dayExes = session
            ? exercises
                .filter((e) => e.planned_session_id === session.id)
                .sort((a, b) => a.order_index - b.order_index)
            : [];
          return (
            <Card key={day} className={!session ? "border-dashed" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-1">
                  <CardTitle className="text-sm">{dayName}</CardTitle>
                  {session ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete ${dayName} session?`))
                          deleteSessionMutation.mutate(session.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addSessionMutation.mutate(day)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                </div>
                {session && (
                  <SessionTitle
                    session={session}
                    onSave={(title) =>
                      updateSessionMutation.mutate({
                        id: session.id,
                        patch: { title },
                      })
                    }
                  />
                )}
              </CardHeader>
              {session && (
                <CardContent className="space-y-2 pt-0">
                  <SortableExerciseList
                    items={dayExes}
                    onReorder={(ids) => reorderExercisesMutation.mutate(ids)}
                    renderItem={(ex) => (
                      <ExerciseRow
                        ex={ex}
                        oneRm={baselines[ex.exercise] ?? 0}
                        onUpdate={(patch) =>
                          updateExerciseMutation.mutate({ id: ex.id, patch })
                        }
                        onDuplicate={() => duplicateExerciseMutation.mutate(ex)}
                        onDelete={() => deleteExerciseMutation.mutate(ex.id)}
                      />
                    )}
                  />
                  <AddExerciseRow
                    exerciseLib={exerciseLib}
                    onAdd={(libId) =>
                      addExerciseMutation.mutate({
                        sessionId: session.id,
                        exerciseLibId: libId,
                      })
                    }
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SessionTitle({
  session,
  onSave,
}: {
  session: PlannedSessionRow;
  onSave: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.title ?? "");

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 text-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSave(value);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            onSave(value);
            setEditing(false);
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-left"
    >
      <CardDescription className="text-xs">
        {session.title || "Untitled"}
      </CardDescription>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function SortableExerciseList({
  items,
  onReorder,
  renderItem,
}: {
  items: PlannedExerciseRow[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (ex: PlannedExerciseRow) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    onReorder(next.map((i) => i.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {items.map((ex) => (
            <SortableItem key={ex.id} id={ex.id}>
              {renderItem(ex)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <div data-drag-handle {...attributes} {...listeners} className="contents">
        {children}
      </div>
    </div>
  );
}

function ExerciseRow({
  ex,
  oneRm,
  onUpdate,
  onDuplicate,
  onDelete,
}: {
  ex: PlannedExerciseRow;
  oneRm: number;
  onUpdate: (patch: Partial<PlannedExerciseRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [sets, setSets] = useState(String(ex.target_sets));
  const [reps, setReps] = useState(String(ex.target_reps));
  const [rpe, setRpe] = useState(ex.target_rpe?.toString() ?? "");
  const [rir, setRir] = useState(ex.target_rir?.toString() ?? "");
  const [weight, setWeight] = useState(ex.target_weight_kg?.toString() ?? "");
  const [notes, setNotes] = useState(ex.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!ex.notes);
  const metric: IntensityMetric = ex.intensity_metric;

  const computeAndPatch = (
    overrides: Partial<{
      sets: string;
      reps: string;
      rpe: string;
      rir: string;
      weight: string;
      metric: IntensityMetric;
    }> = {},
  ): Partial<PlannedExerciseRow> => {
    const m = overrides.metric ?? metric;
    const s = parseInt(overrides.sets ?? sets, 10) || 1;
    const r = parseInt(overrides.reps ?? reps, 10) || 1;
    const rpeVal = (overrides.rpe ?? rpe) ? parseFloat(overrides.rpe ?? rpe) : null;
    const rirVal = (overrides.rir ?? rir) ? parseFloat(overrides.rir ?? rir) : null;
    // Auto-compute target_weight_kg from 1RM × intensity, unless coach typed one explicitly
    let kgVal: number | null = null;
    const explicitWeight = (overrides.weight ?? weight).trim();
    if (explicitWeight) {
      kgVal = parseFloat(explicitWeight);
    } else if (oneRm > 0) {
      kgVal = prescribedWeightKg({
        oneRmKg: oneRm,
        reps: r,
        metric: m,
        rpe: rpeVal,
        rir: rirVal,
      });
    }
    return {
      target_sets: s,
      target_reps: r,
      intensity_metric: m,
      target_rpe: m === "rpe" ? rpeVal : null,
      target_rir: m === "rir" ? rirVal : null,
      target_weight_kg: kgVal,
    };
  };

  const commit = () => onUpdate(computeAndPatch());

  const switchMetric = (next: IntensityMetric) => {
    if (next === metric) return;
    // When switching, clear the other field locally
    if (next === "rpe") setRir("");
    else setRpe("");
    onUpdate(computeAndPatch({ metric: next }));
  };

  // Computed prescribed weight (coach view) — derived live from current inputs
  const computedKg = useMemo(() => {
    const r = parseInt(reps, 10) || 1;
    const rpeVal = rpe ? parseFloat(rpe) : null;
    const rirVal = rir ? parseFloat(rir) : null;
    return prescribedWeightKg({
      oneRmKg: oneRm,
      reps: r,
      metric,
      rpe: rpeVal,
      rir: rirVal,
    });
  }, [oneRm, reps, rpe, rir, metric]);

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="cursor-grab touch-none p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
            onClick={(e) => e.preventDefault()}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="truncate text-sm font-medium">{ex.exercise}</span>
        </div>
        <div
          className="flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Metric toggle */}
          <div className="flex overflow-hidden rounded-md border border-border text-[10px]">
            <button
              type="button"
              onClick={() => switchMetric("rpe")}
              className={cn(
                "px-1.5 py-0.5 font-semibold",
                metric === "rpe"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              RPE
            </button>
            <button
              type="button"
              onClick={() => switchMetric("rir")}
              className={cn(
                "px-1.5 py-0.5 font-semibold",
                metric === "rir"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              RIR
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <span className="text-lg leading-none">⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={onDuplicate}>
                <CopyPlus className="mr-2 h-4 w-4" /> Add another block (same
                exercise)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNotes((v) => !v)}>
                <Pencil className="mr-2 h-4 w-4" />
                {showNotes ? "Hide notes" : "Add notes"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className="mt-1 grid grid-cols-4 gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <NumField label="Sets" value={sets} onChange={setSets} onBlur={commit} />
        <NumField label="Reps" value={reps} onChange={setReps} onBlur={commit} />
        {metric === "rpe" ? (
          <NumField
            label="RPE"
            value={rpe}
            onChange={setRpe}
            onBlur={commit}
            step="0.5"
          />
        ) : (
          <NumField
            label="RIR"
            value={rir}
            onChange={setRir}
            onBlur={commit}
            step="1"
          />
        )}
        <NumField
          label="kg"
          value={weight}
          onChange={setWeight}
          onBlur={commit}
          step="0.5"
          placeholder={computedKg != null ? String(computedKg) : ""}
        />
      </div>

      {/* Coach-only computed weight hint */}
      {oneRm > 0 && computedKg != null && !weight && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-1 inline-flex cursor-help items-center gap-1 text-[10px] text-muted-foreground">
                <Calculator className="h-3 w-3" />
                Auto: <span className="font-semibold text-foreground">
                  {computedKg} kg
                </span>{" "}
                (from athlete's 1RM, hidden from athlete)
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs">
              The athlete sees only this prescribed kg, never their 1RM.
              Override by typing a value in the kg box.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {oneRm === 0 && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          No 1RM set for {ex.exercise} — set one to auto-compute kg from{" "}
          {metric.toUpperCase()}.
        </div>
      )}

      {/* Toggles: lengthened partials, last set to failure */}
      <div
        className="mt-2 flex flex-wrap gap-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
          <Checkbox
            checked={ex.lengthened_partials}
            onCheckedChange={(v) =>
              onUpdate({ lengthened_partials: v === true })
            }
          />
          Lengthened partials
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
          <Checkbox
            checked={ex.last_set_to_failure}
            onCheckedChange={(v) =>
              onUpdate({ last_set_to_failure: v === true })
            }
          />
          Last set to failure
        </label>
      </div>

      {showNotes && (
        <div className="mt-1" onPointerDown={(e) => e.stopPropagation()}>
          <Input
            placeholder="Notes (e.g. tempo 3-1-1, paused)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onUpdate({ notes: notes || null })}
            className="h-7 text-xs"
          />
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  onBlur,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="h-7 px-2 text-xs"
      />
    </div>
  );
}

function AddExerciseRow({
  exerciseLib,
  onAdd,
}: {
  exerciseLib: ExerciseLib[];
  onAdd: (libId: string) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <div
      className="flex gap-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Select
        value={pick}
        onValueChange={(v) => {
          setPick(v);
          onAdd(v);
          setPick("");
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="+ Add exercise" />
        </SelectTrigger>
        <SelectContent>
          {exerciseLib.map((e) => (
            <SelectItem key={e.id} value={e.id} className="text-xs">
              {e.name}
              {e.category ? (
                <span className="ml-2 text-muted-foreground">· {e.category}</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
