import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute(
  "/physio/patients/$patientId/sessions/$sessionId",
)({
  head: () => ({
    meta: [
      { title: "Rehab session — EA Physio" },
      { name: "description", content: "Edit a rehab session and its exercises." },
    ],
  }),
  component: PhysioSession,
});

function PhysioSession() {
  const { patientId, sessionId } = Route.useParams();
  const { user } = useAuth();
  const physioId = user!.id;
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["rehab-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const exercisesQuery = useQuery({
    queryKey: ["rehab-exercises", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_exercises")
        .select("*")
        .eq("session_id", sessionId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const feedbackQuery = useQuery({
    queryKey: ["rehab-feedback", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_session_feedback")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [hold, setHold] = useState("");
  const [load, setLoad] = useState("");
  const [bandId, setBandId] = useState("");
  const [notes, setNotes] = useState("");

  const bandsQuery = useQuery({
    queryKey: ["resistance-bands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resistance_bands")
        .select("id, color, label, min_kg, max_kg, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addExercise = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Exercise name required");
      const order = (exercisesQuery.data ?? []).length;
      const band = (bandsQuery.data ?? []).find((b) => b.id === bandId);
      const { error } = await supabase.from("rehab_exercises").insert({
        session_id: sessionId,
        order_index: order,
        name: name.trim(),
        sets: sets === "" ? null : Number(sets),
        reps: reps === "" ? null : Number(reps),
        hold_seconds: hold === "" ? null : Number(hold),
        load_kg: load === "" ? null : Number(load),
        resistance_band: band?.label ?? null,
        band_id: band?.id ?? null,
        band_min_kg: band ? Number(band.min_kg) : null,
        band_max_kg: band ? Number(band.max_kg) : null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rehab-exercises", sessionId] });
      setName("");
      setSets("");
      setReps("");
      setHold("");
      setLoad("");
      setBandId("");
      setNotes("");
      toast.success("Exercise added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateExercise = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ExercisePatch;
    }) => {
      const { error } = await supabase
        .from("rehab_exercises")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["rehab-exercises", sessionId] }),
  });

  const removeExercise = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rehab_exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["rehab-exercises", sessionId] }),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("rehab_sessions")
        .update({ status })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rehab-session", sessionId] });
      toast.success("Status updated");
    },
  });

  if (sessionQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!sessionQuery.data) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }
  const s = sessionQuery.data;
  const isPhysio = s.physio_id === physioId;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link
          to="/physio/patients/$patientId"
          params={{ patientId }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to patient
        </Link>
      </Button>

      <div>
        <div className="text-xs text-muted-foreground">
          {new Date(s.session_date).toLocaleDateString()} · status: {s.status}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {s.title ?? "Rehab session"}
        </h1>
        {s.overall_pain != null && (
          <p className="text-sm text-muted-foreground">
            Baseline pain: {s.overall_pain}/10
          </p>
        )}
      </div>

      {(s.subjective_notes || s.objective_notes) && (
        <Card>
          <CardHeader>
            <CardTitle>SOAP notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {s.subjective_notes && (
              <p>
                <span className="font-semibold">S:</span> {s.subjective_notes}
              </p>
            )}
            {s.objective_notes && (
              <p>
                <span className="font-semibold">O:</span> {s.objective_notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prescribed exercises</CardTitle>
          <CardDescription>
            Each exercise can capture sets/reps, load, pain (0–10), perceived exertion (0–10),
            tolerance and ROM notes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(exercisesQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No exercises yet.</p>
          )}
          {(exercisesQuery.data ?? []).map((ex) => (
            <ExerciseRow
              key={ex.id}
              ex={ex}
              canEdit={isPhysio}
              onUpdate={(patch) =>
                updateExercise.mutate({ id: ex.id, patch })
              }
              onRemove={() => removeExercise.mutate(ex.id)}
            />
          ))}

          {isPhysio && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="ex-name">Exercise</Label>
                  <Input
                    id="ex-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Single-leg squat"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <div>
                    <Label className="text-xs">Sets</Label>
                    <Input value={sets} onChange={(e) => setSets(e.target.value)} type="number" min={0} />
                  </div>
                  <div>
                    <Label className="text-xs">Reps</Label>
                    <Input value={reps} onChange={(e) => setReps(e.target.value)} type="number" min={0} />
                  </div>
                  <div>
                    <Label className="text-xs">Hold (s)</Label>
                    <Input value={hold} onChange={(e) => setHold(e.target.value)} type="number" min={0} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Load (kg)</Label>
                  <Input value={load} onChange={(e) => setLoad(e.target.value)} type="number" min={0} step="0.5" />
                </div>
                <div>
                  <Label className="text-xs">Band</Label>
                  <select
                    value={bandId}
                    onChange={(e) => setBandId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— none —</option>
                    {(bandsQuery.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} ({Number(b.min_kg)}–{Number(b.max_kg)} kg)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => addExercise.mutate()}
                disabled={addExercise.isPending}
              >
                <Plus className="mr-1 h-4 w-4" /> Add exercise
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isPhysio && (
        <Card>
          <CardHeader>
            <CardTitle>Session status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(["planned", "in_progress", "completed", "cancelled"] as const).map(
              (st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={s.status === st ? "default" : "outline"}
                  onClick={() => setStatus.mutate(st)}
                >
                  {st.replace("_", " ")}
                </Button>
              ),
            )}
          </CardContent>
        </Card>
      )}

      {feedbackQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle>Patient feedback</CardTitle>
            <CardDescription>How the patient felt after the session.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Pain after" value={feedbackQuery.data.pain_after} />
            <Stat label="Stiffness" value={feedbackQuery.data.stiffness} />
            <Stat label="Swelling" value={feedbackQuery.data.swelling} />
            <Stat label="Sleep quality" value={feedbackQuery.data.sleep_quality} />
            {feedbackQuery.data.comments && (
              <p className="col-span-full text-muted-foreground">
                “{feedbackQuery.data.comments}”
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value ?? "—"}{value != null && "/10"}</div>
    </div>
  );
}

interface RehabExercise {
  id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
  load_kg: number | null;
  resistance_band: string | null;
  pain_rating: number | null;
  perceived_exertion: number | null;
  rom_notes: string | null;
  tolerance: string | null;
  notes: string | null;
}

type ExercisePatch = Partial<Pick<RehabExercise, "pain_rating" | "perceived_exertion" | "tolerance" | "rom_notes">>;

function ExerciseRow({
  ex,
  canEdit,
  onUpdate,
  onRemove,
}: {
  ex: RehabExercise;
  canEdit: boolean;
  onUpdate: (patch: ExercisePatch) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{ex.name}</div>
          <div className="text-xs text-muted-foreground">
            {[
              ex.sets != null && `${ex.sets} sets`,
              ex.reps != null && `${ex.reps} reps`,
              ex.hold_seconds != null && `${ex.hold_seconds}s hold`,
              ex.load_kg != null && `${ex.load_kg} kg`,
              ex.resistance_band && `band: ${ex.resistance_band}`,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          {ex.notes && <p className="mt-1 text-xs">{ex.notes}</p>}
        </div>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumField
          label="Pain (0–10)"
          value={ex.pain_rating}
          onChange={(v) => canEdit && onUpdate({ pain_rating: v })}
          disabled={!canEdit}
        />
        <NumField
          label="RPE (0–10)"
          value={ex.perceived_exertion}
          onChange={(v) => canEdit && onUpdate({ perceived_exertion: v })}
          disabled={!canEdit}
        />
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Tolerance</Label>
          <select
            disabled={!canEdit}
            value={ex.tolerance ?? ""}
            onChange={(e) => onUpdate({ tolerance: e.target.value || null })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">—</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">ROM notes</Label>
          <Input
            disabled={!canEdit}
            defaultValue={ex.rom_notes ?? ""}
            onBlur={(e) => {
              if (canEdit && e.target.value !== (ex.rom_notes ?? "")) {
                onUpdate({ rom_notes: e.target.value || null });
              }
            }}
            placeholder="e.g. full ROM"
          />
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        max={10}
        defaultValue={value ?? ""}
        disabled={disabled}
        onBlur={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          if (v !== value) onChange(v);
        }}
      />
    </div>
  );
}
