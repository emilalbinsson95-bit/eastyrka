import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Mail } from "lucide-react";
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

export const Route = createFileRoute("/coach/me")({
  head: () => ({
    meta: [
      { title: "My Account — SETPOINT Coach" },
      {
        name: "description",
        content: "Your coach account, profile, and roster overview.",
      },
    ],
  }),
  component: CoachMePage,
});

function CoachMePage() {
  const { user } = useAuth();
  const coachId = user!.id;

  const profileQuery = useQuery({
    queryKey: ["profile", coachId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", coachId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const athletesQuery = useQuery({
    queryKey: ["coach-me-athletes", coachId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("coach_athletes")
        .select("athlete_id, created_at")
        .eq("coach_id", coachId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.athlete_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return (links ?? []).map((l) => ({
        athlete_id: l.athlete_id,
        full_name: map.get(l.athlete_id) ?? "Unnamed athlete",
        created_at: l.created_at,
      }));
    },
  });

  const athletes = athletesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">
          Your coach profile and the athletes connected to you.
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
            <span className="font-medium">Coach</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            My athletes ({athletes.length})
          </CardTitle>
          <CardDescription>
            Athletes linked to your coach account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {athletesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : athletes.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You don't have any athletes yet.
              </p>
              <Button asChild size="sm">
                <Link to="/coach/invites">
                  <Mail className="mr-1 h-4 w-4" /> Invite athlete
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {athletes.map((a) => (
                <li key={a.athlete_id}>
                  <Link
                    to="/coach/athletes/$athleteId"
                    params={{ athleteId: a.athlete_id }}
                    className="flex items-center justify-between py-2 text-sm hover:text-primary"
                  >
                    <span className="font-medium">{a.full_name}</span>
                    <span className="text-xs text-muted-foreground">
                      View →
                    </span>
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
