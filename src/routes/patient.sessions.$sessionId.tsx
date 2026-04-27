import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  const [painAfter, setPainAfter] = useState("");
  const [stiffness, setStiffness] = useState("");
  const [swelling, setSwelling] = useState("");
  const [sleep, setSleep] = useState("");
  const [comments, setComments] = useState("");

  useEffect(() => {
    const f = feedbackQuery.data;
    if (f) {
      setPainAfter(String(f.pain_after ?? ""));
      setStiffness(String(f.stiffness ?? ""));
      setSwelling(String(f.swelling ?? ""));
      setSleep(String(f.sleep_quality ?? ""));
      setComments(f.comments ?? "");
    }
  }, [feedbackQuery.data]);

  const saveFeedback = useMutation({
    mutationFn: async () => {
      const payload = {
        session_id: sessionId,
        patient_id: patientId,
        pain_after: painAfter === "" ? null : Number(painAfter),
        stiffness: stiffness === "" ? null : Number(stiffness),
        swelling: swelling === "" ? null : Number(swelling),
        sleep_quality: sleep === "" ? null : Number(sleep),
        comments: comments || null,
      };
      const { error } = await supabase
        .from("patient_session_feedback")
        .upsert(payload, { onConflict: "session_id,patient_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rehab-feedback", sessionId, patientId] });
      toast.success("Feedback saved");
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

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/patient">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>

      <div>
        <div className="text-xs text-muted-foreground">
          {new Date(s.session_date).toLocaleDateString()} · {s.status}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {s.title ?? "Rehab session"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your exercises</CardTitle>
          <CardDescription>Follow the prescription from your physiotherapist.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(exercisesQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No exercises yet.</p>
          )}
          {(exercisesQuery.data ?? []).map((ex) => (
            <div key={ex.id} className="rounded-md border border-border p-3 text-sm">
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
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How did it go?</CardTitle>
          <CardDescription>
            Log how you felt after the session. 0 = none, 10 = worst.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumField label="Pain after" value={painAfter} onChange={setPainAfter} />
            <NumField label="Stiffness" value={stiffness} onChange={setStiffness} />
            <NumField label="Swelling" value={swelling} onChange={setSwelling} />
            <NumField label="Sleep quality" value={sleep} onChange={setSleep} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              placeholder="Anything your physio should know?"
            />
          </div>
          <Button onClick={() => saveFeedback.mutate()} disabled={saveFeedback.isPending}>
            {saveFeedback.isPending ? "Saving…" : "Save feedback"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} max={10} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
