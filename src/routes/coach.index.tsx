import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInDays, format, parseISO } from "date-fns";
import { Users, AlertTriangle, Mail, Search, Tag, Check, X } from "lucide-react";
import { useState, useMemo } from "react";
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
import {
  readinessClasses,
  readinessLabel,
  eaKoefficient,
  readinessFromEAk,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/coach/")({
  head: () => ({
    meta: [
      { title: "My Athletes — EA Training System Coach" },
      {
        name: "description",
        content: "Roster of your athletes with current readiness status.",
      },
      { property: "og:title", content: "My Athletes — EA Training System Coach" },
      {
        property: "og:description",
        content: "Manage your athlete roster, baselines and weekly programming.",
      },
    ],
  }),
  component: CoachRosterPage,
});

interface AthleteRow {
  athlete_id: string;
  full_name: string | null;
  tag: string | null;
  last_log_date: string | null;
  last_eak: number | null;
  last_form: number | null;
}

function CoachRosterPage() {
  const { user } = useAuth();
  const coachId = user!.id;

  const rosterQuery = useQuery({
    queryKey: ["coach-roster", coachId],
    queryFn: async (): Promise<AthleteRow[]> => {
      // 1. Get linked athletes with tags
      const { data: links, error: linkErr } = await supabase
        .from("coach_athletes")
        .select("athlete_id, tag")
        .eq("coach_id", coachId);
      if (linkErr) throw linkErr;
      const athleteIds = (links ?? []).map((l) => l.athlete_id);
      if (athleteIds.length === 0) return [];
      const tagMap = new Map((links ?? []).map((l) => [l.athlete_id, l.tag as string | null]));

      // 2. Profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", athleteIds);
      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name]),
      );

      // 3. Recent logs to compute latest EAkoefficient per athlete
      const { data: recentLogs } = await supabase
        .from("training_logs")
        .select("athlete_id, date, exercise, set_number, reps, weight_kg, rpe, form_score, created_at")
        .in("athlete_id", athleteIds)
        .order("created_at", { ascending: false })
        .limit(500);

      const { data: baselines } = await supabase
        .from("baselines")
        .select("athlete_id, exercise, one_rm_kg")
        .in("athlete_id", athleteIds);
      const baselineMap = new Map<string, Record<string, number>>();
      for (const b of baselines ?? []) {
        const m = baselineMap.get(b.athlete_id) ?? {};
        m[b.exercise] = Number(b.one_rm_kg);
        baselineMap.set(b.athlete_id, m);
      }

      const latestByAthlete = new Map<string, { date: string; eak: number; form: number | null }>();
      for (const log of recentLogs ?? []) {
        if (latestByAthlete.has(log.athlete_id)) continue;
        const baseline =
          baselineMap.get(log.athlete_id)?.[log.exercise] ?? 0;
        const eak = baseline > 0
          ? eaKoefficient(
              {
                weight_kg: Number(log.weight_kg),
                reps: log.reps,
                rpe: Number(log.rpe),
              },
              baseline,
            )
          : 0;
        latestByAthlete.set(log.athlete_id, {
          date: log.date,
          eak,
          form: log.form_score,
        });
      }

      return athleteIds.map((id) => ({
        athlete_id: id,
        full_name: profileMap.get(id) ?? null,
        tag: tagMap.get(id) ?? null,
        last_log_date: latestByAthlete.get(id)?.date ?? null,
        last_eak: latestByAthlete.get(id)?.eak ?? null,
        last_form: latestByAthlete.get(id)?.form ?? null,
      }));
    },
  });

  const athletes = rosterQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My athletes</h1>
          <p className="text-sm text-muted-foreground">
            Click an athlete to see their EAkoefficient dashboard, set baselines, and
            build their week.
          </p>
        </div>
        <Button asChild>
          <Link to="/coach/invites">
            <Mail className="mr-1 h-4 w-4" /> Invite athlete
          </Link>
        </Button>
      </div>

      {rosterQuery.isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!rosterQuery.isLoading && athletes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> No athletes yet
            </CardTitle>
            <CardDescription>
              Invite athletes by email — once they sign up, they'll appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/coach/invites">
                <Mail className="mr-1 h-4 w-4" /> Invite first athlete
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {athletes.map((a) => {
          const status = readinessFromEAk(a.last_eak ?? 0);
          const daysSince =
            a.last_log_date != null
              ? differenceInDays(new Date(), parseISO(a.last_log_date))
              : null;
          const needsAttention =
            status === "exhausted" || (daysSince !== null && daysSince > 5);

          return (
            <Link
              key={a.athlete_id}
              to="/coach/athletes/$athleteId"
              params={{ athleteId: a.athlete_id }}
              className="group"
            >
              <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{a.full_name ?? "Unnamed athlete"}</span>
                    {needsAttention && (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    {a.last_log_date
                      ? `Last set: ${format(parseISO(a.last_log_date), "MMM d")}${
                          daysSince !== null && daysSince > 0
                            ? ` (${daysSince}d ago)`
                            : ""
                        }`
                      : "No sets logged yet"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last EAkoeff</span>
                    {a.last_eak && a.last_eak > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          readinessClasses(status),
                        )}
                      >
                        {a.last_eak.toFixed(0)}% · {readinessLabel(status)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Form</span>
                    <span className="font-medium">
                      {a.last_form != null ? `${a.last_form}/10` : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
