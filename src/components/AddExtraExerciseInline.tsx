import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, X, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Inline "add an extra exercise" card the athlete can use inside a planned
 * session on the Today page. It creates freestyle (planned_exercise_id = null)
 * training_logs rows on the given date so the coach's session structure
 * stays intact but the athlete's extra work still feeds their weekly load.
 */
export function AddExtraExerciseInline({
  athleteId,
  dateStr,
}: {
  athleteId: string;
  dateStr: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sets, setSets] = useState<{ reps: string; weight: string; rpe: string }[]>([
    { reps: "", weight: "", rpe: "" },
  ]);

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

  const reset = () => {
    setName("");
    setSets([{ reps: "", weight: "", rpe: "" }]);
    setOpen(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      const exercise = name.trim();
      if (!exercise) throw new Error("Give the exercise a name.");
      // Find highest existing set_number for this exercise today so we append.
      const { data: existing, error: exErr } = await supabase
        .from("training_logs")
        .select("set_number")
        .eq("athlete_id", athleteId)
        .eq("date", dateStr)
        .eq("exercise", exercise)
        .order("set_number", { ascending: false })
        .limit(1);
      if (exErr) throw exErr;
      const startSet = ((existing?.[0]?.set_number ?? 0) as number) + 1;

      const rows = sets
        .map((s, i) => {
          const reps = Number(s.reps);
          const weight = Number(s.weight);
          const rpe = Number(s.rpe);
          if (!reps || !rpe) return null;
          return {
            athlete_id: athleteId,
            date: dateStr,
            exercise,
            set_number: startSet + i,
            reps,
            weight_kg: Number.isFinite(weight) ? weight : 0,
            rpe,
            planned_exercise_id: null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length === 0) throw new Error("Add at least one set with reps and RPE.");

      const { error } = await supabase.from("training_logs").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n} set${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["logs-today", athleteId, dateStr] });
      qc.invalidateQueries({ queryKey: ["week-logs", athleteId] });
      qc.invalidateQueries({ queryKey: ["adhoc-strength", athleteId, dateStr] });
      qc.invalidateQueries({ queryKey: ["calendar-items", athleteId] });
      reset();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const suggestions = suggestionsQuery.data ?? [];
  const totalReady = useMemo(
    () => sets.filter((s) => Number(s.reps) > 0 && Number(s.rpe) > 0).length,
    [sets],
  );

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" /> Add extra exercise
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Dumbbell className="h-4 w-4 text-primary" /> Extra exercise
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <datalist id="extra-exercise-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise — e.g. Face pulls"
        list="extra-exercise-suggestions"
        className="h-9"
      />

      <div className="grid grid-cols-[1.75rem_1fr_1fr_1fr_2rem] items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Set</span>
        <span>Weight (kg)</span>
        <span>Reps</span>
        <span>RPE</span>
        <span />
      </div>

      <div className="space-y-1.5">
        {sets.map((s, si) => (
          <div
            key={si}
            className={cn(
              "grid grid-cols-[1.75rem_1fr_1fr_1fr_2rem] items-center gap-2 rounded-md bg-background/60 p-1",
            )}
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
              onChange={(e) =>
                setSets((prev) => prev.map((r, i) => (i === si ? { ...r, weight: e.target.value } : r)))
              }
              className="h-8 text-sm"
              placeholder="0"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={s.reps}
              onChange={(e) =>
                setSets((prev) => prev.map((r, i) => (i === si ? { ...r, reps: e.target.value } : r)))
              }
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
              onChange={(e) =>
                setSets((prev) => prev.map((r, i) => (i === si ? { ...r, rpe: e.target.value } : r)))
              }
              className="h-8 text-sm"
              placeholder="—"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() =>
                setSets((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== si)))
              }
              aria-label={`Remove set ${si + 1}`}
              disabled={sets.length <= 1}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setSets((prev) => [
              ...prev,
              prev[prev.length - 1] ? { ...prev[prev.length - 1] } : { reps: "", weight: "", rpe: "" },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add set
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim() || totalReady === 0}
        >
          <Save className="mr-1 h-4 w-4" />
          {save.isPending ? "Saving…" : `Save ${totalReady || ""} set${totalReady === 1 ? "" : "s"}`.trim()}
        </Button>
      </div>
    </div>
  );
}
