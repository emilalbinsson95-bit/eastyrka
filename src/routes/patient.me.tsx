import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, Stethoscope } from "lucide-react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/patient/me")({
  head: () => ({
    meta: [
      { title: "My account — EA Physio" },
      { name: "description", content: "Your patient profile and connected physios." },
    ],
  }),
  component: PatientMePage,
});

function PatientMePage() {
  const { user } = useAuth();
  const patientId = user!.id;

  const profileQuery = useQuery({
    queryKey: ["profile", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const physiosQuery = useQuery({
    queryKey: ["patient-me-physios", patientId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("physio_patients")
        .select("physio_id")
        .eq("patient_id", patientId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.physio_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return ids.map((id) => ({ physio_id: id, full_name: map.get(id) ?? "Unnamed physio" }));
    },
  });

  const physios = physiosQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">
          Your patient profile and the physios connected to you.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Your patient code
          </CardTitle>
          <CardDescription>
            Share this code with your physio so they can connect your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs sm:text-sm">
              {patientId}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(patientId);
                toast.success("Patient code copied");
              }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Name: </span>
            <span className="font-medium">{profileQuery.data?.full_name ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Role: </span>
            <span className="font-medium">Patient</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            My physios ({physios.length})
          </CardTitle>
          <CardDescription>Physios linked to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {physiosQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : physios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No physios linked yet. Share your patient code above with your physio.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {physios.map((p) => (
                <li key={p.physio_id} className="py-2 text-sm font-medium">
                  {p.full_name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/me">Open athlete profile (baselines & benchmarks)</Link>
        </Button>
      </div>
    </div>
  );
}
