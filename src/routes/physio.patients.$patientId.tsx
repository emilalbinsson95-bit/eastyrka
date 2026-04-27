import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, ChevronRight, Activity, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/physio/patients/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient — EA Physio" },
      { name: "description", content: "Patient rehab progress and session history." },
    ],
  }),
  component: PatientDetail,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const { user } = useAuth();
  const physioId = user!.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["patient-profile", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["physio-patient-sessions", physioId, patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_sessions")
        .select("id, session_date, title, status, overall_pain")
        .eq("patient_id", patientId)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [overallPain, setOverallPain] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("rehab_sessions")
        .insert({
          physio_id: physioId,
          patient_id: patientId,
          session_date: date,
          title: title || null,
          subjective_notes: subjective || null,
          objective_notes: objective || null,
          overall_pain: overallPain === "" ? null : Number(overallPain),
          status: "planned",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success("Session created");
      qc.invalidateQueries({ queryKey: ["physio-patient-sessions", physioId, patientId] });
      qc.invalidateQueries({ queryKey: ["physio-roster", physioId] });
      setTitle("");
      setSubjective("");
      setObjective("");
      setOverallPain("");
      navigate({
        to: "/physio/patients/$patientId/sessions/$sessionId",
        params: { patientId, sessionId: d.id },
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rehab_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session removed");
      qc.invalidateQueries({ queryKey: ["physio-patient-sessions", physioId, patientId] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/physio">
            <ArrowLeft className="mr-1 h-4 w-4" /> Patients
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/messages">
            <MessageCircle className="mr-1 h-4 w-4" /> Message
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {profileQuery.data?.full_name ?? "Patient"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Rehab progress, sessions and patient-reported outcomes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> New rehab session
          </CardTitle>
          <CardDescription>
            Create a session, then add the prescribed exercises inside it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Week 3 — knee strengthening"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="overallpain">Baseline pain (0–10)</Label>
            <Input
              id="overallpain"
              type="number"
              min={0}
              max={10}
              value={overallPain}
              onChange={(e) => setOverallPain(e.target.value)}
              className="max-w-[120px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="subjective">Subjective (S)</Label>
            <Textarea
              id="subjective"
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="Patient report, symptoms, function…"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="objective">Objective (O)</Label>
            <Textarea
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="ROM, strength, special tests, observations…"
              rows={2}
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create session"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessionsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!sessionsQuery.isLoading && (sessionsQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          )}
          {(sessionsQuery.data ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <Link
                to="/physio/patients/$patientId/sessions/$sessionId"
                params={{ patientId, sessionId: s.id }}
                className="flex flex-1 items-center gap-3"
              >
                <Activity className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.title ?? "Session"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.session_date).toLocaleDateString()}
                    {s.overall_pain != null && ` · pain ${s.overall_pain}/10`}
                    {" · "}
                    {s.status}
                  </div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeSession.mutate(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
