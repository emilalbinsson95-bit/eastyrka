import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, Dumbbell, Copy, GripVertical } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SetRow = { reps: string; weight: string; rpe: string };
type ExerciseBlock = { name: string; sets: SetRow[] };

type LogRow = {
  id: string;
  exercise: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number;
};

export function AdhocStrengthEditor({
  athleteId,
  date,
  onClose,
}: {
  athleteId: string;
  date: string;
  onClose?: () => void;
}) {
  const qc = useQueryClient();

  const logsQuery = useQuery({
    queryKey: ["adhoc-strength", athleteId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("id, exercise, set_number, reps, weight_kg, rpe")
        .eq("athlete_id", athleteId)
        .eq("date", date)
        .is("planned_exercise_id", null)
        .order("exercise", { ascending: true })
        .order("set_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  // Athlete's exercise vocabulary — suggest via <datalist>.
  const suggestionsQuery = useQuery({
    queryKey: ["exercise-suggestions", athleteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_logs")
        .select("exercise")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(200);
      const set = new Set<string>();
      for (const r of data ?? []) if (r.exercise) set.add(r.exercise);
      return Array.from(set).slice(0, 30);
    },
  });

  const [blocks, setBlocks] = useState<ExerciseBlock[]>([
    { name: "", sets: [{ reps: "", weight: "", rpe: "" }] },
  ]);

  useEffect(() => {
    if (!logsQuery.data || logsQuery.data.length === 0) return;
    const grouped = new Map<string, LogRow[]>();
    for (const r of logsQuery.data) {
      const arr = grouped.get(r.exercise) ?? [];
      arr.push(r);
      grouped.set(r.exercise, arr);
    }
    setBlocks(
      Array.from(grouped.entries()).map(([name, rows]) => ({
        name,
        sets: rows
          .sort((a, b) => a.set_number - b.set_number)
          .map((r) => ({
            reps: String(r.reps),
            weight: String(r.weight_kg),
            rpe: String(r.rpe),
          })),
      })),
    );
  }, [logsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase
        .from("training_logs")
        .delete()
        .eq("athlete_id", athleteId)
        .eq("date", date)
        .is("planned_exercise_id", null);
      if (delErr) throw delErr;

      type Insert = {
        athlete_id: string;
        date: string;
        exercise: string;
        set_number: number;
        reps: number;
        weight_kg: number;
        rpe: number;
        planned_exercise_id: null;
      };
      const rows: Insert[] = [];
      for (const b of blocks) {
        const name = b.name.trim();
        if (!name) continue;
        b.sets.forEach((s, i) => {
          const reps = Number(s.reps);
          const weight = Number(s.weight);
          const rpe = Number(s.rpe);
          if (!reps || !rpe) return;
          rows.push({
            athlete_id: athleteId,
            date,
            exercise: name,
            set_number: i + 1,
            reps,
            weight_kg: Number.isFinite(weight) ? weight : 0,
            rpe,
            planned_exercise_id: null,
          });
        });
      }
      if (rows.length === 0) {
        throw new Error("Add at least one set with reps and RPE.");
      }
      const { error } = await supabase.from("training_logs").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workout saved");
      qc.invalidateQueries({ queryKey: ["adhoc-strength", athleteId, date] });
      qc.invalidateQueries({ queryKey: ["calendar-items", athleteId] });
      qc.invalidateQueries({ queryKey: ["endurance-weekly", athleteId] });
      qc.invalidateQueries({ queryKey: ["logs-today", athleteId, date] });
      onClose?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("training_logs")
        .delete()
        .eq("athlete_id", athleteId)
        .eq("date", date)
        .is("planned_exercise_id", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workout deleted");
      qc.invalidateQueries({ queryKey: ["adhoc-strength", athleteId, date] });
      qc.invalidateQueries({ queryKey: ["calendar-items", athleteId] });
      qc.invalidateQueries({ queryKey: ["logs-today", athleteId, date] });
      onClose?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totalSets = useMemo(
    () => blocks.reduce((acc, b) => acc + b.sets.filter((s) => s.reps && s.rpe).length, 0),
    [blocks],
  );
  const avgRpe = useMemo(() => {
    const all = blocks.flatMap((b) => b.sets.map((s) => Number(s.rpe))).filter((n) => n > 0);
    if (!all.length) return null;
    return Math.round((all.reduce((a, n) => a + n, 0) / all.length) * 10) / 10;
  }, [blocks]);
  const totalTonnage = useMemo(() => {
    let t = 0;
    for (const b of blocks) {
      for (const s of b.sets) {
        const reps = Number(s.reps);
        const w = Number(s.weight);
        if (reps > 0 && w > 0) t += reps * w;
      }
    }
    return t;
  }, [blocks]);

  const updateBlock = (bi: number, patch: Partial<ExerciseBlock>) => {
    setBlocks((prev) => prev.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  };
  const updateSet = (bi: number, si: number, patch: Partial<SetRow>) => {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === bi
          ? { ...b, sets: b.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
          : b,
      ),
    );
  };
  const addSet = (bi: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== bi) return b;
        const last = b.sets[b.sets.length - 1];
        return {
          ...b,
          sets: [...b.sets, last ? { ...last } : { reps: "", weight: "", rpe: "" }],
        };
      }),
    );
  };
  const removeSet = (bi: number, si: number) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === bi ? { ...b, sets: b.sets.filter((_, j) => j !== si) } : b)),
    );
  };
  const removeBlock = (bi: number) => setBlocks((prev) => prev.filter((_, i) => i !== bi));
  const addBlock = () =>
    setBlocks((prev) => [...prev, { name: "", sets: [{ reps: "", weight: "", rpe: "" }] }]);

  const suggestions = suggestionsQuery.data ?? [];
  const dateLabel = useMemo(() => format(parseISO(date), "EEE, MMM d"), [date]);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="h-4 w-4 text-primary" />
              Strength workout
            </CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {dateLabel} · your own sets — feeds your weekly load & EAk.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {totalSets > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {totalSets} set{totalSets === 1 ? "" : "s"}
              </Badge>
            )}
            {avgRpe != null && (
              <Badge variant="secondary" className="text-[10px]">
                avg RPE {avgRpe}
              </Badge>
            )}
            {totalTonnage > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {Math.round(totalTonnage)} kg
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <datalist id="adhoc-exercise-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        {blocks.map((block, bi) => (
          <div
            key={bi}
            className={cn(
              "space-y-2 rounded-lg border bg-muted/20 p-3",
              block.name.trim() ? "border-border" : "border-dashed border-border/70",
            )}
          >
            {/* Exercise header */}
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
              <Input
                value={block.name}
                onChange={(e) => updateBlock(bi, { name: e.target.value })}
                placeholder="Exercise name — e.g. Back squat"
                list="adhoc-exercise-suggestions"
                className="h-9 font-medium"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeBlock(bi)}
                aria-label="Remove exercise"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Column headers — only above the first row */}
            <div className="grid grid-cols-[1.75rem_1fr_1fr_1fr_2rem] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Set</span>
              <span>Weight (kg)</span>
              <span>Reps</span>
              <span>RPE</span>
              <span />
            </div>

            {/* Set rows */}
            <div className="space-y-1.5">
              {block.sets.map((s, si) => (
                <div
                  key={si}
                  className="grid grid-cols-[1.75rem_1fr_1fr_1fr_2rem] items-center gap-2 rounded-md bg-background/60 p-1"
                >
                  <div className="flex h-8 w-7 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                    {si + 1}
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.5}
                    value={s.weight}
                    onChange={(e) => updateSet(bi, si, { weight: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="0"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={s.reps}
                    onChange={(e) => updateSet(bi, si, { reps: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="0"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={10}
                    step={0.5}
                    value={s.rpe}
                    onChange={(e) => updateSet(bi, si, { rpe: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="—"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSet(bi, si)}
                    aria-label={`Remove set ${si + 1}`}
                    disabled={block.sets.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => addSet(bi)} className="h-8">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add set
              </Button>
              {block.sets.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addSet(bi)}
                  className="h-8 text-muted-foreground"
                  title="Copies the last set"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Repeat last
                </Button>
              )}
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addBlock} className="w-full border-dashed">
          <Plus className="mr-1 h-4 w-4" /> Add exercise
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          {logsQuery.data && logsQuery.data.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => del.mutate()}
              disabled={del.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete workout
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {save.isPending ? "Saving…" : "Save workout"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
