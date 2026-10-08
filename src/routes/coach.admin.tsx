import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Search, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoachingAvailabilityEditor } from "@/components/CoachingAvailabilityEditor";

export const Route = createFileRoute("/coach/admin")({
  head: () => ({ meta: [
    { title: "Administration — SETPOINT" },
    { name: "description", content: "Manage roles and inspect athlete activity in SETPOINT." },
    { property: "og:title", content: "Administration — SETPOINT" },
    { property: "og:description", content: "Manage roles and inspect athlete activity in SETPOINT." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminPage,
});

const MANAGEABLE_ROLES: AppRole[] = ["coach", "athlete", "physio", "patient"];

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string | null;
  roles: string[];
}

interface AthleteDiagnostic {
  id: string;
  full_name: string | null;
  email: string | null;
  last_training_date: string | null;
  training_set_count: number;
  plan_count: number;
  coaches: string[];
}

interface AthleteInspection {
  recent_logs: { date: string; exercise: string; reps: number; weight_kg: number; rpe: number }[];
  recent_plans: { week_start_date: string; status: string; is_deload: boolean }[];
  recent_readiness: { date: string; daily_form: number }[];
}

function AdminPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin" as AppRole);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteDiagnostic | null>(null);

  const inspectionQuery = useQuery({
    queryKey: ["admin-athlete-inspection", selectedAthlete?.id],
    enabled: isAdmin && !!selectedAthlete,
    queryFn: async () => {
      if (!selectedAthlete) throw new Error("Select an athlete first");
      const { data, error } = await supabase.rpc("admin_inspect_athlete", { _athlete_id: selectedAthlete.id });
      if (error) throw error;
      return data as unknown as AthleteInspection;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users", query],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users", {
        _query: query.trim() || undefined,
      });
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });
  const athletesQuery = useQuery({
    queryKey: ["admin-athletes", query],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_athlete_diagnostics", { _query: query.trim() || undefined });
      if (error) throw error;
      return (data ?? []) as AthleteDiagnostic[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
      grant,
    }: {
      userId: string;
      role: AppRole;
      grant: boolean;
    }) => {
      const { error } = await supabase.rpc(
        grant ? "admin_grant_role" : "admin_revoke_role",
        { _user_id: userId, _role: role },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`${v.grant ? "Granted" : "Revoked"} ${v.role}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          This page is only available to admins.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <CoachingAvailabilityEditor />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…" className="pl-9" />
      </div>
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Users className="h-5 w-5 text-primary" /> All athletes</h1>
        <p className="text-sm text-muted-foreground">Account and activity overview for troubleshooting. Only your own connected athletes can be opened for editing.</p>
        {athletesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {athletesQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load athletes.</p>}
        {!athletesQuery.isLoading && !athletesQuery.isError && (athletesQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No athletes found.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(athletesQuery.data ?? []).map((a) => (
            <div key={a.id} className="rounded-md border border-border p-4 text-sm">
              <p className="font-semibold">{a.full_name || "Unnamed athlete"}</p>
              <p className="break-all text-muted-foreground">{a.email}</p>
              <p className="mt-2 text-muted-foreground">{a.training_set_count} sets · {a.plan_count} plans</p>
              <p className="text-muted-foreground">Last session: {a.last_training_date ?? "None"}</p>
               <p className="text-muted-foreground">Coach: {a.coaches.length ? a.coaches.join(", ") : "None"}</p>
               <Button size="sm" variant="outline" className="mt-3" onClick={() => setSelectedAthlete(a)}>Inspect activity</Button>
            </div>
          ))}
        </div>
        {selectedAthlete && <Card>
          <CardHeader><CardTitle className="flex items-center justify-between gap-2 text-base">Read-only activity: {selectedAthlete.full_name || "Unnamed athlete"}<Button size="sm" variant="ghost" onClick={() => setSelectedAthlete(null)}>Close</Button></CardTitle></CardHeader>
          <CardContent className="grid gap-5 text-sm md:grid-cols-3">
            {inspectionQuery.isLoading && <p>Loading activity…</p>}
            {inspectionQuery.isError && <p role="alert" className="text-destructive">Could not load athlete activity.</p>}
            {inspectionQuery.data && <>
              <div><h2 className="mb-2 font-semibold">Recent training sets</h2>{inspectionQuery.data.recent_logs.length ? inspectionQuery.data.recent_logs.map((log, i) => <p key={i} className="border-t py-1">{log.date} · {log.exercise} · {log.weight_kg} kg × {log.reps} · RPE {log.rpe}</p>) : <p className="text-muted-foreground">No sets logged.</p>}</div>
              <div><h2 className="mb-2 font-semibold">Recent plans</h2>{inspectionQuery.data.recent_plans.length ? inspectionQuery.data.recent_plans.map((plan, i) => <p key={i} className="border-t py-1">{plan.week_start_date} · {plan.status}{plan.is_deload ? " · Planned light" : ""}</p>) : <p className="text-muted-foreground">No plans.</p>}</div>
              <div><h2 className="mb-2 font-semibold">Recent daily form</h2>{inspectionQuery.data.recent_readiness.length ? inspectionQuery.data.recent_readiness.map((item, i) => <p key={i} className="border-t py-1">{item.date} · {item.daily_form}/10</p>) : <p className="text-muted-foreground">No check-ins.</p>}</div>
            </>}
          </CardContent>
        </Card>}
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            User administration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Search for a user and toggle their roles. Granting{" "}
            <span className="font-medium text-foreground">coach</span> lets an
            athlete coach others while still being coached by you.
          </p>
          {usersQuery.isError && <p role="alert" className="text-sm text-destructive">Could not load users.</p>}
          {usersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(usersQuery.data ?? []).map((u) => (
                <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.full_name || "(no name)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MANAGEABLE_ROLES.map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <Button
                          key={r}
                          size="sm"
                          variant={has ? "default" : "outline"}
                          className="h-7 px-2 text-xs capitalize"
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({
                              userId: u.id,
                              role: r,
                              grant: !has,
                            })
                          }
                        >
                          {r}
                        </Button>
                      );
                    })}
                    {u.roles.includes("admin") && (
                      <Badge variant="secondary" className="text-xs">
                        admin
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
              {(usersQuery.data ?? []).length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  No users found.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
