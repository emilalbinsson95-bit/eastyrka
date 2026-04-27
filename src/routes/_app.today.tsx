import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  format,
  parseISO,
  startOfWeek,
  addDays,
  isToday,
  isSameDay,
} from "date-fns";
import { Plus, CheckCircle2, Save, Calendar as CalendarIcon } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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

export const Route = createFileRoute("/_app/today")({
  head: () => ({
    meta: [
      { title: "Today's Session — EA Training System" },
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
  target_weight_kg: number | null;
  notes: string | null;
  order_index: number;
}

interface PlannedSession {
  id: string;
  day_of_week: number;
  title: string | null;
  notes: string | null;
  planned_exercises: PlannedExercise[];
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
}

function TodayPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, "yyyy-MM-dd");
  const weekStart = format(
    startOfWeek(today, { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );

  const planQuery = useQuery({
    queryKey: ["athlete-plan", userId, weekStart],
    queryFn: async (): Promise<WeekPlan | null> => {
      const { data, error } = await supabase
        .from("week_plans")
        .select(
          `id, week_start_date, status,
           planned_sessions (
             id, day_of_week, title, notes,
             planned_exercises (
               id, exercise, variation, target_sets, target_reps,
               target_rpe, target_weight_kg, notes, order_index
             )
           )`,
        )
        .eq("athlete_id", userId)
        .eq("week_start_date", weekStart)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data as WeekPlan | null;
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

  // Determine today's planned session (Mon=1 .. Sun=0 in date-fns; we store 0=Mon..6=Sun)
  const todayPlanned: PlannedSession | undefined = useMemo(() => {
    if (!planQuery.data) return undefined;
    // Convert: Mon=0..Sun=6 (matches our storage)
    const jsDay = today.getDay(); // 0=Sun..6=Sat
    const dow = jsDay === 0 ? 6 : jsDay - 1;
    return planQuery.data.planned_sessions
      .sort((a, b) => a.day_of_week - b.day_of_week)
      .find((s) => s.day_of_week === dow);
  }, [planQuery.data, today]);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          {format(today, "EEEE, MMMM d")}
        </p>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!isLoading && todayPlanned && (
        <PlannedSessionCard
          session={todayPlanned}
          logs={logs}
          processed={processed}
          baselines={baselines}
          athleteId={userId}
          dateStr={todayStr}
        />
      )}

      {!isLoading && !todayPlanned && (
        <Card>
          <CardHeader>
            <CardTitle>No session planned for today</CardTitle>
            <CardDescription>
              You can still log freestyle sets below — they'll show up in your history
              and feed into your EAkoefficient.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FreestyleQuickLog
              athleteId={userId}
              dateStr={todayStr}
              baselines={baselines}
            />
          </CardContent>
        </Card>
      )}

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
        Need to update your 1RM baselines? Ask your coach — they manage them on the
        athlete page.{" "}
        <Link to="/me" className="text-primary hover:underline">
          View baselines
        </Link>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          {session.title ?? "Today's session"}
        </CardTitle>
        {session.notes && (
          <CardDescription>{session.notes}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {session.planned_exercises
          .sort((a, b) => a.order_index - b.order_index)
          .map((ex) => {
            const exerciseLogs = logs.filter(
              (l) => l.planned_exercise_id === ex.id || l.exercise === ex.exercise,
            );
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
  const completed = logs.length;
  const targetSets = ex.target_sets;
  const isDone = completed >= targetSets;

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
            {ex.target_rpe && ` @RPE${ex.target_rpe}`}
            {ex.target_weight_kg && ` · ${ex.target_weight_kg}kg`}
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {completed}/{targetSets}
        </span>
      </div>

      {processed.length > 0 && (
        <div className="mb-3 space-y-1">
          {processed
            .sort((a, b) => a.source.set_number - b.source.set_number)
            .map((p) => (
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
                </div>
              </div>
            ))}
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
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();

  const livePreview = useMemo(() => {
    const e1rm = dailyE1RM({ weight_kg: weight, reps, rpe });
    const eak = baseline > 0 ? eaKoefficient({ weight_kg: weight, reps, rpe }, baseline) : 0;
    const status = readinessFromEAk(eak);
    return { e1rm, eak, status };
  }, [weight, reps, rpe, baseline]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = setSchema.parse({
        weight_kg: weight,
        reps,
        rpe,
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
        comment: parsed.comment ?? null,
        planned_exercise_id: ex.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Set ${nextSet} logged`);
      queryClient.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      setOpen(false);
      setComment("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

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
            Target: {ex.target_reps} reps
            {ex.target_rpe && ` @RPE${ex.target_rpe}`}
            {ex.target_weight_kg && ` · ${ex.target_weight_kg}kg`}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 py-4">
          <NumField label="Weight (kg)" step={2.5} value={weight} onChange={setWeight} />
          <NumField label="Reps" step={1} value={reps} onChange={setReps} />
          <NumField label="RPE" step={0.5} min={1} max={10} value={rpe} onChange={setRpe} />
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
              Live EAkoefficient preview
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-lg font-bold">
                {livePreview.e1rm.toFixed(1)} kg E1RM
              </span>
              {baseline > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-semibold",
                    readinessClasses(livePreview.status),
                  )}
                >
                  {livePreview.eak.toFixed(0)}% · {readinessLabel(livePreview.status)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No baseline set</span>
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
