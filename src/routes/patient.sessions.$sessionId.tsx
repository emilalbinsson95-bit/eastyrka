import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/sessions/$sessionId")({
  head: () => ({
    meta: [
      { title: "Rehab session — EA" },
      { name: "description", content: "Your prescribed exercises and feedback." },
    ],
  }),
  component: PatientSession,
});

function PatientSession() {
  const { sessionId } = Route.useParams();
  const { user } = useAuth();
  const patientId = user!.id;
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
    queryKey: ["rehab-feedback", sessionId, patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_session_feedback")
        .select("*")
        .eq("session_id", sessionId)
        .eq("patient_id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Local "checked off" state per exercise — UI only, helps the patient
  // track what they've completed during the session.
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const [painAfter, setPainAfter] = useState<number | null>(null);
  const [stiffness, setStiffness] = useState<number | null>(null);
  const [swelling, setSwelling] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    const f = feedbackQuery.data;
    if (f) {
      setPainAfter(f.pain_after ?? null);
      setStiffness(f.stiffness ?? null);
      setSwelling(f.swelling ?? null);
      setSleep(f.sleep_quality ?? null);
      setComments(f.comments ?? "");
      if (f.stiffness != null || f.swelling != null || f.sleep_quality != null) {
        setShowMore(true);
      }
    }
  }, [feedbackQuery.data]);

  const saveFeedback = useMutation({
    mutationFn: async () => {
      const payload = {
        session_id: sessionId,
        patient_id: patientId,
        pain_after: painAfter,
        stiffness,
        swelling,
        sleep_quality: sleep,
        comments: comments || null,
      };
      const { error } = await supabase
        .from("patient_session_feedback")
        .upsert(payload, { onConflict: "session_id,patient_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rehab-feedback", sessionId, patientId] });
      qc.invalidateQueries({ queryKey: ["patient-feedback-all", patientId] });
      toast.success("Nice work — feedback saved 🎉");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (sessionQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!sessionQuery.data) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }
  const s = sessionQuery.data;
  const exs = exercisesQuery.data ?? [];
  const completedCount = exs.filter((e) => checked[e.id]).length;
  const allDone = exs.length > 0 && completedCount === exs.length;
  const alreadyLogged = !!feedbackQuery.data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/patient">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>

      <div>
        <div className="text-xs text-muted-foreground">
          {new Date(s.session_date).toLocaleDateString(undefined, {
            weekday: "long", month: "short", day: "numeric",
          })}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {s.title ?? "Rehab session"}
        </h1>
        {alreadyLogged && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" /> You've logged this session
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" /> Your exercises
            </span>
            {exs.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {completedCount}/{exs.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>Tap each one as you finish it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {exs.length === 0 && (
            <p className="text-sm text-muted-foreground">No exercises yet.</p>
          )}
          {exs.map((ex) => {
            const isChecked = !!checked[ex.id];
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => setChecked((c) => ({ ...c, [ex.id]: !c[ex.id] }))}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                  isChecked
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-border hover:border-primary",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    isChecked
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-muted-foreground/40",
                  )}
                >
                  {isChecked && <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-semibold", isChecked && "line-through opacity-70")}>
                    {ex.name}
                  </div>
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
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How did it feel?</CardTitle>
          <CardDescription>
            {allDone ? "Great job! " : ""}A quick check-in helps your physio adjust your plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ScaleField
            label="Pain during / after"
            hint="0 = none, 10 = worst"
            value={painAfter}
            onChange={setPainAfter}
            colorScheme="pain"
          />

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showMore ? "Hide extra check-ins" : "Add stiffness, swelling, sleep"}
          </button>

          {showMore && (
            <div className="space-y-5 border-l-2 border-border pl-3">
              <ScaleField label="Stiffness" hint="0 = none, 10 = locked up" value={stiffness} onChange={setStiffness} colorScheme="pain" />
              <ScaleField label="Swelling" hint="0 = none, 10 = very swollen" value={swelling} onChange={setSwelling} colorScheme="pain" />
              <ScaleField label="Sleep quality last night" hint="0 = terrible, 10 = great" value={sleep} onChange={setSleep} colorScheme="good" />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="comments">Anything to share?</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              placeholder="Optional — e.g. 'felt strong today' or 'right knee twinged on lunges'"
            />
          </div>
          <Button
            onClick={() => saveFeedback.mutate()}
            disabled={saveFeedback.isPending}
            className="w-full sm:w-auto"
          >
            {saveFeedback.isPending ? "Saving…" : alreadyLogged ? "Update feedback" : "Save & finish"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ScaleField({
  label,
  hint,
  value,
  onChange,
  colorScheme,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number) => void;
  colorScheme: "pain" | "good";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{hint}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from({ length: 11 }).map((_, n) => {
          const selected = value === n;
          // Color scale: for "pain", lower = green, higher = red. For "good", reversed.
          const intensity = colorScheme === "pain" ? n / 10 : (10 - n) / 10;
          const tone =
            intensity < 0.34
              ? "border-green-500/40 text-green-700 dark:text-green-400"
              : intensity < 0.67
                ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                : "border-destructive/40 text-destructive";
          const filled =
            intensity < 0.34
              ? "bg-green-500 text-white border-green-500"
              : intensity < 0.67
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-destructive text-destructive-foreground border-destructive";
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "h-9 w-9 rounded-md border text-sm font-medium transition-colors",
                selected ? filled : `bg-card hover:bg-muted ${tone}`,
              )}
              aria-pressed={selected}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
