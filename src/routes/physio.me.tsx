import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/physio/me")({
  head: () => ({
    meta: [
      { title: "My account — EA Physio" },
      {
        name: "description",
        content: "Your physio profile and connected patients.",
      },
    ],
  }),
  component: PhysioMePage,
});

function PhysioMePage() {
  const { user } = useAuth();
  const physioId = user!.id;

  const profileQuery = useQuery({
    queryKey: ["profile", physioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", physioId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const patientsQuery = useQuery({
    queryKey: ["physio-me-patients", physioId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("physio_patients")
        .select("patient_id, created_at")
        .eq("physio_id", physioId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.patient_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (links ?? []).map((l) => ({
        patient_id: l.patient_id,
        full_name: map.get(l.patient_id) ?? "Unnamed patient",
      }));
    },
  });

  const patients = patientsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">
          Your physio profile and the patients connected to you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Name: </span>
            <span className="font-medium">
              {profileQuery.data?.full_name ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Role: </span>
            <span className="font-medium">Physio</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            My patients ({patients.length})
          </CardTitle>
          <CardDescription>
            Patients linked to your physio account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patientsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : patients.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You don't have any patients yet.
              </p>
              <Button asChild size="sm">
                <Link to="/physio/invites">
                  <UserPlus className="mr-1 h-4 w-4" /> Invite patient
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {patients.map((p) => (
                <li key={p.patient_id}>
                  <Link
                    to="/physio/patients/$patientId"
                    params={{ patientId: p.patient_id }}
                    className="flex items-center justify-between py-2 text-sm hover:text-primary"
                  >
                    <span className="font-medium">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground">View →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
