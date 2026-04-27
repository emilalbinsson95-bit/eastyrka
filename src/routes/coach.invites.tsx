import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, UserPlus, Copy, Trash2 } from "lucide-react";
import { z } from "zod";
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

export const Route = createFileRoute("/coach/invites")({
  head: () => ({
    meta: [
      { title: "Invite athletes — EA Training System Coach" },
      { name: "description", content: "Connect with athletes to coach them." },
    ],
  }),
  component: InvitesPage,
});

const linkSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255),
});

function InvitesPage() {
  const { user } = useAuth();
  const coachId = user!.id;
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const linksQuery = useQuery({
    queryKey: ["coach-links", coachId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("coach_athletes")
        .select("id, athlete_id, created_at")
        .eq("coach_id", coachId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.athlete_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (links ?? []).map((l) => ({
        ...l,
        full_name: profMap.get(l.athlete_id) ?? null,
      }));
    },
  });

  // Connect by email — looks up existing user by email via profiles. Since we
  // can't query auth.users from the client, we look up profiles whose owner has
  // a matching email by attempting a connect-by-id flow only after the athlete
  // signs up. For v1 we connect by athlete user id (athlete shares it from /me).
  // Simpler real flow: ask the athlete to sign up first, then paste their User
  // ID here.
  const connectMutation = useMutation({
    mutationFn: async (athleteUserId: string) => {
      const trimmed = athleteUserId.trim();
      if (!/^[0-9a-f-]{36}$/i.test(trimmed)) {
        throw new Error("That doesn't look like a valid user ID (UUID)");
      }
      // Verify athlete profile exists & has athlete role
      const { data: rolesData, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", trimmed)
        .eq("role", "athlete");
      if (rolesErr) throw rolesErr;
      if (!rolesData || rolesData.length === 0) {
        throw new Error("No athlete account found with that ID");
      }
      const { error } = await supabase
        .from("coach_athletes")
        .insert({ coach_id: coachId, athlete_id: trimmed });
      if (error) {
        if (error.code === "23505") throw new Error("Athlete is already linked");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Athlete connected");
      queryClient.invalidateQueries({ queryKey: ["coach-links", coachId] });
      queryClient.invalidateQueries({ queryKey: ["coach-roster", coachId] });
      setEmail("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("coach_athletes")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Athlete removed");
      queryClient.invalidateQueries({ queryKey: ["coach-links", coachId] });
      queryClient.invalidateQueries({ queryKey: ["coach-roster", coachId] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect athletes</h1>
        <p className="text-sm text-muted-foreground">
          Ask your athlete to sign up at this app first — then paste their User ID
          here to connect.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Connect by User ID
          </CardTitle>
          <CardDescription>
            Your athlete can find their User ID on their <em>Me</em> tab after signing
            up. (Email-based invites coming soon.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="athlete-id">Athlete User ID</Label>
              <Input
                id="athlete-id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
            <Button
              onClick={() => connectMutation.mutate(email)}
              disabled={connectMutation.isPending || !email.trim()}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              {connectMutation.isPending ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked athletes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {linksQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {!linksQuery.isLoading && (linksQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No athletes connected yet.</p>
          )}
          {(linksQuery.data ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
            >
              <div>
                <div className="font-semibold">{l.full_name ?? "Unnamed"}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {l.athlete_id}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(l.athlete_id);
                    toast.success("ID copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMutation.mutate(l.id)}
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
