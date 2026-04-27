import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserPlus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/physio/invites")({
  head: () => ({
    meta: [
      { title: "Invite patients — EA Physio" },
      { name: "description", content: "Connect patients to monitor their rehab." },
    ],
  }),
  component: InvitesPage,
});

function InvitesPage() {
  const { user } = useAuth();
  const physioId = user!.id;
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState("");

  const linksQuery = useQuery({
    queryKey: ["physio-links", physioId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("physio_patients")
        .select("id, patient_id, created_at")
        .eq("physio_id", physioId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.patient_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (links ?? []).map((l) => ({
        ...l,
        full_name: profMap.get(l.patient_id) ?? null,
      }));
    },
  });

  const connect = useMutation({
    mutationFn: async (id: string) => {
      const trimmed = id.trim();
      if (!/^[0-9a-f-]{36}$/i.test(trimmed)) {
        throw new Error("That doesn't look like a valid user ID (UUID)");
      }
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", trimmed)
        .eq("role", "patient");
      if (rolesErr) throw rolesErr;
      if (!roles || roles.length === 0) {
        throw new Error("No patient account found with that ID");
      }
      const { error } = await supabase
        .from("physio_patients")
        .insert({ physio_id: physioId, patient_id: trimmed });
      if (error) {
        if (error.code === "23505") throw new Error("Patient is already linked");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Patient connected");
      qc.invalidateQueries({ queryKey: ["physio-links", physioId] });
      qc.invalidateQueries({ queryKey: ["physio-roster", physioId] });
      setPatientId("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("physio_patients")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Patient removed");
      qc.invalidateQueries({ queryKey: ["physio-links", physioId] });
      qc.invalidateQueries({ queryKey: ["physio-roster", physioId] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect patients</h1>
        <p className="text-sm text-muted-foreground">
          Ask the patient to sign up first, then paste their User ID below to connect.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Connect by User ID
          </CardTitle>
          <CardDescription>
            The patient can find their User ID after signing up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="patient-id">Patient User ID</Label>
              <Input
                id="patient-id"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
            <Button
              onClick={() => connect.mutate(patientId)}
              disabled={connect.isPending || !patientId.trim()}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              {connect.isPending ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked patients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {linksQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!linksQuery.isLoading && (linksQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No patients connected yet.</p>
          )}
          {(linksQuery.data ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
            >
              <div>
                <div className="font-semibold">{l.full_name ?? "Unnamed"}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {l.patient_id}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(l.patient_id);
                    toast.success("ID copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(l.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
