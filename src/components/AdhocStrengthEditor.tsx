import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  const [blocks, setBlocks] = useState<ExerciseBlock[]>([
    { name: "", sets: [{ reps: "", weight: "", rpe: "" }] },
  ]);

  // Hydrate from existing rows
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
      // Wipe existing ad-hoc rows for this day, then insert fresh.
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
      qc.invalidateQueries({ queryKey: ["calendar-items", athleteId] });
      qc.invalidateQueries({ queryKey: ["endurance-weekly", athleteId] });
      onClose?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totalSets = blocks.reduce(
    (acc, b) => acc + b.sets.filter((s) => s.reps && s.rpe).length,
    0,
  );
  const avgRpe = (() => {
    const all = blocks.flatMap((b) => b.sets.map((s) => Number(s.rpe))).filter((n) => n > 0);
    if (!all.length) return null;
    return Math.round((all.reduce((a, n) => a + n, 0) / all.length) * 10) / 10;
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="h-4 w-4" /> Strength workout · {date}
          </CardTitle>
          <div className="flex items-center gap-2">
            {totalSets > 0 && <Badge variant="secondary">{totalSets} sets</Badge>}
            {avgRpe != null && <Badge variant="secondary">avg RPE {avgRpe}</Badge>}
          </div>
        </div>
        <CardDescription>
          Log exercises you did. Each set takes reps, weight (kg) and RPE — feeds your weekly load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {blocks.map((block, bi) => (
          <div key={bi} className="space-y-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Input
                value={block.name}
                onChange={(e) => {
                  const next = [...blocks];
                  next[bi] = { ...block, name: e.target.value };
                  setBlocks(next);
                }}
                placeholder="Exercise (e.g. Back squat, Bench press)"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setBlocks(blocks.filter((_, i) => i !== bi))}
                aria-label="Remove exercise"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-[auto,1fr,1fr,1fr,auto] items-center gap-2 text-xs">
              <span className="text-muted-foreground">#</span>
              <Label className="text-xs">Reps</Label>
              <Label className="text-xs">Weight kg</Label>
              <Label className="text-xs">RPE</Label>
              <span />
              {block.sets.map((s, si) => (
                <SetInputs
                  key={si}
                  index={si + 1}
                  set={s}
                  onChange={(next) => {
                    const nb = [...blocks];
                    const ns = [...block.sets];
                    ns[si] = next;
                    nb[bi] = { ...block, sets: ns };
                    setBlocks(nb);
                  }}
                  onRemove={() => {
                    const nb = [...blocks];
                    nb[bi] = { ...block, sets: block.sets.filter((_, i) => i !== si) };
                    setBlocks(nb);
                  }}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const last = block.sets[block.sets.length - 1];
                const nb = [...blocks];
                nb[bi] = {
                  ...block,
                  sets: [...block.sets, last ? { ...last } : { reps: "", weight: "", rpe: "" }],
                };
                setBlocks(nb);
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Add set
            </Button>
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setBlocks([...blocks, { name: "", sets: [{ reps: "", weight: "", rpe: "" }] }])
          }
        >
          <Plus className="mr-1 h-3 w-3" /> Add exercise
        </Button>

        <div className="flex items-center justify-between pt-2">
          {logsQuery.data && logsQuery.data.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete workout
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-1 h-4 w-4" /> Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SetInputs({
  index,
  set,
  onChange,
  onRemove,
}: {
  index: number;
  set: SetRow;
  onChange: (s: SetRow) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <span className="text-xs text-muted-foreground">{index}</span>
      <Input
        type="number"
        min={0}
        value={set.reps}
        onChange={(e) => onChange({ ...set, reps: e.target.value })}
        className="h-8"
      />
      <Input
        type="number"
        min={0}
        step={0.5}
        value={set.weight}
        onChange={(e) => onChange({ ...set, weight: e.target.value })}
        className="h-8"
      />
      <Input
        type="number"
        min={1}
        max={10}
        step={0.5}
        value={set.rpe}
        onChange={(e) => onChange({ ...set, rpe: e.target.value })}
        className="h-8"
      />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} aria-label="Remove set">
        <Trash2 className="h-3 w-3" />
      </Button>
    </>
  );
}
