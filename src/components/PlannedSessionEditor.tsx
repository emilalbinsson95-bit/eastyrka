import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  intensity_metric: "rpe" | "rir";
  target_weight_kg: number | null;
  notes: string | null;
  order_index: number;
}

interface ExerciseLibRow {
  id: string;
  name: string;
  default_intensity_metric: "rpe" | "rir" | null;
}

/**
 * Editor for a single planned strength session. Used by coaches from the
 * calendar preview so they can adjust one session without opening the whole
 * week editor. Writes go straight to planned_sessions / planned_exercises,
 * so changes apply to the published program immediately.
 */
export function PlannedSessionEditor({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["planned-session-edit", sessionId],
    queryFn: async () => {
      const { data: session, error: e1 } = await supabase
        .from("planned_sessions")
        .select("id, title, notes")
        .eq("id", sessionId)
        .maybeSingle();
      if (e1) throw e1;
      const { data: exes, error: e2 } = await supabase
        .from("planned_exercises")
        .select(
          "id, planned_session_id, exercise_id, exercise, variation, target_sets, target_reps, target_rpe, target_rir, intensity_metric, target_weight_kg, notes, order_index",
        )
        .eq("planned_session_id", sessionId)
        .order("order_index");
      if (e2) throw e2;
      return {
        session,
        exercises: (exes ?? []) as PlannedExerciseRow[],
      };
    },
  });

  const exerciseLibQuery = useQuery({
    queryKey: ["exercise-lib"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, name, default_intensity_metric")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseLibRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["planned-session-edit", sessionId] });
    qc.invalidateQueries({ queryKey: ["calendar-items"] });
    qc.invalidateQueries({ queryKey: ["calendar-preview"] });
    qc.invalidateQueries({ queryKey: ["week-sessions"] });
  };

  const updateSession = useMutation({
    mutationFn: async (patch: { title?: string; notes?: string | null }) => {
      const { error } = await supabase
        .from("planned_sessions")
        .update(patch)
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Passet uppdaterat");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateExercise = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<PlannedExerciseRow> }) => {
      const { error } = await supabase
        .from("planned_exercises")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteExercise = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planned_exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const [newExerciseId, setNewExerciseId] = useState("");
  const addExercise = useMutation({
    mutationFn: async () => {
      const lib = (exerciseLibQuery.data ?? []).find((e) => e.id === newExerciseId);
      if (!lib) throw new Error("Välj en övning");
      const metric = lib.default_intensity_metric ?? "rpe";
      const { error } = await supabase.from("planned_exercises").insert({
        planned_session_id: sessionId,
        exercise_id: lib.id,
        exercise: lib.name,
        target_sets: 3,
        target_reps: metric === "rir" ? 10 : 5,
        intensity_metric: metric,
        target_rpe: metric === "rpe" ? 7 : null,
        target_rir: metric === "rir" ? 2 : null,
        order_index: (sessionQuery.data?.exercises ?? []).length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewExerciseId("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (sessionQuery.isLoading) {
    return <p className="py-6 text-sm text-muted-foreground">Laddar pass…</p>;
  }
  if (!sessionQuery.data?.session) {
    return <p className="py-6 text-sm text-muted-foreground">Passet hittades inte.</p>;
  }

  const { session, exercises } = sessionQuery.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Titel</Label>
          <Input
            defaultValue={session.title ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (session.title ?? "")) updateSession.mutate({ title: v });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Anteckningar</Label>
          <Textarea
            rows={1}
            defaultValue={session.notes ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (session.notes ?? "")) updateSession.mutate({ notes: v || null });
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {exercises.length === 0 && (
          <p className="text-sm text-muted-foreground">Inga övningar ännu.</p>
        )}
        {exercises.map((ex) => (
          <div key={ex.id} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-sm">
                {ex.exercise}
                {ex.variation && <span className="text-muted-foreground"> — {ex.variation}</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteExercise.mutate(ex.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <NumField
                label="Set"
                value={ex.target_sets}
                onChange={(v) => v != null && updateExercise.mutate({ id: ex.id, patch: { target_sets: v } })}
              />
              <NumField
                label="Reps"
                value={ex.target_reps}
                onChange={(v) => v != null && updateExercise.mutate({ id: ex.id, patch: { target_reps: v } })}
              />
              {ex.intensity_metric === "rir" ? (
                <NumField
                  label="RIR"
                  value={ex.target_rir}
                  step={0.5}
                  onChange={(v) => updateExercise.mutate({ id: ex.id, patch: { target_rir: v } })}
                />
              ) : (
                <NumField
                  label="RPE"
                  value={ex.target_rpe}
                  step={0.5}
                  onChange={(v) => updateExercise.mutate({ id: ex.id, patch: { target_rpe: v } })}
                />
              )}
              <NumField
                label="Vikt (kg)"
                value={ex.target_weight_kg}
                step={2.5}
                onChange={(v) => updateExercise.mutate({ id: ex.id, patch: { target_weight_kg: v } })}
              />
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs">Notering</Label>
                <Input
                  defaultValue={ex.notes ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (ex.notes ?? "")) {
                      updateExercise.mutate({ id: ex.id, patch: { notes: v || null } });
                    }
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Lägg till övning</Label>
          <select
            value={newExerciseId}
            onChange={(e) => setNewExerciseId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— välj övning —</option>
            {(exerciseLibQuery.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          onClick={() => addExercise.mutate()}
          disabled={!newExerciseId || addExercise.isPending}
        >
          <Plus className="mr-1 h-4 w-4" /> Lägg till
        </Button>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>Stäng</Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          if (v !== value) onChange(v);
        }}
      />
    </div>
  );
}
