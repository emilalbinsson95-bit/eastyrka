import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, ChevronRight, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/physio/")({
  head: () => ({
    meta: [
      { title: "Patients — EA Physio" },
      { name: "description", content: "Monitor your patients' rehab progress." },
    ],
  }),
  component: PhysioRoster,
});

function PhysioRoster() {
  const { user } = useAuth();
  const physioId = user!.id;

  const rosterQuery = useQuery({
    queryKey: ["physio-roster", physioId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("physio_patients")
        .select("id, patient_id, created_at")
        .eq("physio_id", physioId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.patient_id);
      if (ids.length === 0) return [];
      const [{ data: profiles }, { data: sessions }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", ids),
        supabase
          .from("rehab_sessions")
          .select("patient_id, session_date, overall_pain")
          .in("patient_id", ids)
          .order("session_date", { ascending: false }),
      ]);
      const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      const lastByPatient = new Map<string, { date: string; pain: number | null }>();
      for (const s of sessions ?? []) {
        if (!lastByPatient.has(s.patient_id)) {
          lastByPatient.set(s.patient_id, { date: s.session_date, pain: s.overall_pain });
        }
      }
      return (links ?? []).map((l) => ({
        ...l,
        full_name: profMap.get(l.patient_id) ?? null,
        last: lastByPatient.get(l.patient_id) ?? null,
      }));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your patients</h1>
          <p className="text-sm text-muted-foreground">
            Track rehab sessions, exercise tolerance and patient-reported outcomes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/physio/invites">Invite patient</Link>
        </Button>
      </div>

      {rosterQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!rosterQuery.isLoading && (rosterQuery.data ?? []).length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> No patients yet
            </CardTitle>
            <CardDescription>
              Invite a patient to start tracking their rehab progress.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/physio/invites">Invite a patient</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(rosterQuery.data ?? []).map((p) => (
          <Link
            key={p.id}
            to="/physio/patients/$patientId"
            params={{ patientId: p.patient_id }}
            className="group"
          >
            <Card className="transition-colors group-hover:border-primary">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {p.full_name ?? "Unnamed patient"}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    {p.last
                      ? `Last session ${new Date(p.last.date).toLocaleDateString()}${
                          p.last.pain != null ? ` · pain ${p.last.pain}/10` : ""
                        }`
                      : "No sessions yet"}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
