import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO, addWeeks } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Send,
  Save,
  Trash2,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Cycle {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  total_weeks: number;
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
  target_weight_kg: number | null;
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
        .select("id, name, goal, start_date, total_weeks, status, notes")
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
        .select("id, name, category, description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseLib[];
    },
  });

  // Ensure week_plans rows exist for every week in the meso
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

  // Auto-create missing weeks once data loads
  useMemo(() => {
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

  if (cycleQuery.isLoading || !cycleQuery.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const cycle = cycleQuery.data;
  const weeks = weeksQuery.data ?? [];
  const publishedCount = weeks.filter((w) => w.status === "published").length;
  const currentWeek = weeks[activeWeek];

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

      {/* Week selector */}
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
          exerciseLib={exerciseLibQuery.data ?? []}
          onTogglePublish={(publish) =>
            togglePublishMutation.mutate({ weekId: currentWeek.id, publish })
          }
        />
      )}
    </div>
  );
}

function WeekEditor({
  week,
  weekIndex,
  exerciseLib,
  onTogglePublish,
}: {
  week: WeekPlanRow;
  weekIndex: number;
  exerciseLib: ExerciseLib[];
  onTogglePublish: (publish: boolean) => void;
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
            "id, planned_session_id, exercise_id, exercise, variation, target_sets, target_reps, target_rpe, target_weight_kg, notes, order_index",
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
      const { error } = await supabase.from("planned_exercises").insert({
        planned_session_id: input.sessionId,
        exercise_id: lib.id,
        exercise: lib.name,
        target_sets: 3,
        target_reps: 5,
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

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {DAYS.map((dayName, day) => {
          const session = sessionsByDay.get(day);
          const dayExes = session
            ? exercises.filter((e) => e.planned_session_id === session.id)
            : [];
          return (
            <Card key={day} className={!session ? "border-dashed" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{dayName}</CardTitle>
                  {session ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSessionMutation.mutate(session.id)}
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
                {session?.title && (
                  <CardDescription className="text-xs">
                    {session.title}
                  </CardDescription>
                )}
              </CardHeader>
              {session && (
                <CardContent className="space-y-2 pt-0">
                  {dayExes.map((ex) => (
                    <ExerciseRow
                      key={ex.id}
                      ex={ex}
                      onUpdate={(patch) =>
                        updateExerciseMutation.mutate({ id: ex.id, patch })
                      }
                      onDelete={() => deleteExerciseMutation.mutate(ex.id)}
                    />
                  ))}
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

function ExerciseRow({
  ex,
  onUpdate,
  onDelete,
}: {
  ex: PlannedExerciseRow;
  onUpdate: (patch: Partial<PlannedExerciseRow>) => void;
  onDelete: () => void;
}) {
  const [sets, setSets] = useState(String(ex.target_sets));
  const [reps, setReps] = useState(String(ex.target_reps));
  const [rpe, setRpe] = useState(ex.target_rpe?.toString() ?? "");
  const [weight, setWeight] = useState(ex.target_weight_kg?.toString() ?? "");

  const commit = () => {
    const patch: Partial<PlannedExerciseRow> = {
      target_sets: parseInt(sets, 10) || 1,
      target_reps: parseInt(reps, 10) || 1,
      target_rpe: rpe ? parseFloat(rpe) : null,
      target_weight_kg: weight ? parseFloat(weight) : null,
    };
    onUpdate(patch);
  };

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{ex.exercise}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1">
        <NumField label="Sets" value={sets} onChange={setSets} onBlur={commit} />
        <NumField label="Reps" value={reps} onChange={setReps} onBlur={commit} />
        <NumField label="RPE" value={rpe} onChange={setRpe} onBlur={commit} step="0.5" />
        <NumField label="kg" value={weight} onChange={setWeight} onBlur={commit} step="0.5" />
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  onBlur,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  step?: string;
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
    <div className="flex gap-1">
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
