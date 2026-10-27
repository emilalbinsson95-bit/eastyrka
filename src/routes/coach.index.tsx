import { isReadinessLift, lookupBaseline } from "@/lib/eakoefficient";
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
  countsForEAk,
  dailyE1RM,
  measurementE1RMBySession,
  readinessFromEAk,
} from "@/lib/eakoefficient";

import { cn } from "@/lib/utils";
import { EakDecisionPanel } from "@/components/EakDecisionPanel";

export const Route = createFileRoute("/coach/")({
  head: () => ({
    meta: [
      { title: "My Athletes — SETPOINT Coach" },
      {
        name: "description",
        content: "Roster of your athletes with current readiness status.",
      },
      { property: "og:title", content: "My Athletes — SETPOINT Coach" },
      {
        property: "og:description",
        content: "Manage your athlete roster, baselines and weekly programming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  eak_signals: Map<string, { status: string; pending: boolean }> | null;
}

const LIFT_CHIP: Record<string, string> = { squat: "Knäböj", bench: "Bänk", deadlift: "Mark" };

const SIGNAL_CHIP: Record<string, { label: string; cls: string }> = {
  green: { label: "Enligt plan", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  yellow: { label: "Bevaka", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  red: { label: "Bromsa", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  red_strong: { label: "Bromsa nu", cls: "bg-red-600/20 text-red-700 dark:text-red-300" },
  push: { label: "Redo för mer", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  insufficient_data: { label: "För lite data", cls: "bg-muted text-muted-foreground" },
  low_confidence: { label: "Ovanligt brusigt block", cls: "bg-status-peaking text-status-peaking-foreground" },
};

function CoachRosterPage() {
  const { user } = useAuth();
  const coachId = user?.id;

  const rosterQuery = useQuery({
    queryKey: ["coach-roster", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<AthleteRow[]> => {
      if (!coachId) return [];
      // 1. Get linked athletes with tags
      const { data: links, error: linkErr } = await supabase
        .from("coach_athletes")
        .select("athlete_id, tag")
        .eq("coach_id", coachId)
        .eq("status", "accepted");
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

      // 3. Recent logs (120d) to compute latest EAkoefficient per athlete
      const since = new Date();
      since.setDate(since.getDate() - 120);
      const sinceIso = since.toISOString().slice(0, 10);

      const { data: recentLogs, error: logsError } = await supabase
        .from("training_logs")
        .select("athlete_id, date, exercise, set_number, reps, weight_kg, rpe")
        .in("athlete_id", athleteIds)
        .gte("date", sinceIso)
        .order("date", { ascending: false })
        .order("set_number", { ascending: true })
        .limit(3000);
      if (logsError) throw logsError;

      const { data: baselines, error: baselineError } = await supabase
        .from("baselines")
        .select("athlete_id, exercise, one_rm_kg")
        .in("athlete_id", athleteIds);
      if (baselineError) throw baselineError;
      const baselineMap = new Map<string, Record<string, number>>();
      for (const b of baselines ?? []) {
        const m = baselineMap.get(b.athlete_id) ?? {};
        m[b.exercise] = Number(b.one_rm_kg);
        baselineMap.set(b.athlete_id, m);
      }

      // Derive per-athlete/exercise baselines from set-1 logs (median of top 5 × 0.98)
      const e1rmPool = new Map<string, number[]>();
      for (const log of recentLogs ?? []) {
        if (Number(log.set_number) !== 1) continue;
        if (!countsForEAk({ reps: Number(log.reps), weight_kg: Number(log.weight_kg), rpe: Number(log.rpe) })) continue;
        const e1rm = dailyE1RM({
          reps: Number(log.reps),
          weight_kg: Number(log.weight_kg),
          rpe: Number(log.rpe),
        });
        if (!isFinite(e1rm) || e1rm <= 0) continue;
        const key = `${log.athlete_id}::${log.exercise}`;
        const arr = e1rmPool.get(key) ?? [];
        arr.push(e1rm);
        e1rmPool.set(key, arr);
      }
      const derived = new Map<string, number>();
      for (const [key, arr] of e1rmPool) {
        arr.sort((a, b) => b - a);
        const top = arr.slice(0, Math.min(5, arr.length)).sort((a, b) => a - b);
        const mid = Math.floor(top.length / 2);
        const median = top.length % 2 ? top[mid] : (top[mid - 1] + top[mid]) / 2;
        derived.set(key, Math.round(median * 0.98 * 2) / 2);
      }

      const baselineFor = (athleteId: string, exercise: string) =>
        lookupBaseline(baselineMap.get(athleteId), exercise) ??
        derived.get(`${athleteId}::${exercise}`) ??
        0;

      // Current session uses its measurement set, not the 3-session trend.
      const measurementMap = measurementE1RMBySession(
        (recentLogs ?? []).map((l) => ({
          date: l.date as string,
          exercise: `${l.athlete_id}::${l.exercise}`,
          reps: Number(l.reps),
          weight_kg: Number(l.weight_kg),
          rpe: Number(l.rpe),
          set_number: Number(l.set_number),
        })),
      );
      // Latest session per athlete: one measurement per eligible lift.
      const latestByAthlete = new Map<string, { date: string; byEx: Map<string, number> }>();
      for (const log of recentLogs ?? []) {
        const current = latestByAthlete.get(log.athlete_id);
        if (current && current.date !== log.date) continue;
        const baseline = baselineFor(log.athlete_id, log.exercise as string);
        if (baseline <= 0 || !isReadinessLift(log.exercise as string)) {
          if (!current) latestByAthlete.set(log.athlete_id, { date: log.date, byEx: new Map() });
          continue;
        }
        const measurement = measurementMap.get(`${log.date}::${log.athlete_id}::${log.exercise}`) ?? 0;
        if (measurement <= 0) continue;
        const eak = (measurement / baseline) * 100;
        const entry = current ?? { date: log.date, byEx: new Map<string, number>() };
        const exKey = log.exercise as string;
        entry.byEx.set(exKey, Math.max(entry.byEx.get(exKey) ?? 0, eak));
        latestByAthlete.set(log.athlete_id, entry);
      }

      // 4. Latest daily form from readiness surveys
      const { data: surveys } = await supabase
        .from("readiness_surveys")
        .select("athlete_id, date, daily_form")
        .in("athlete_id", athleteIds)
        .order("date", { ascending: false })
        .limit(500);
      const formMap = new Map<string, number>();
      for (const s of surveys ?? []) {
        if (formMap.has(s.athlete_id) || s.daily_form == null) continue;
        formMap.set(s.athlete_id, Number(s.daily_form));
      }

      // 5. Latest pending EAk mesocycle signal per athlete + lift
      const { data: eakEvals } = await supabase
        .from("eak_meso_evaluations")
        .select("athlete_id, lift, status, coach_decision, created_at")
        .in("athlete_id", athleteIds)
        .order("created_at", { ascending: false })
        .limit(600);
      const signalMap = new Map<string, Map<string, { status: string; pending: boolean }>>();
      for (const e of eakEvals ?? []) {
        let byLift = signalMap.get(e.athlete_id);
        if (!byLift) {
          byLift = new Map();
          signalMap.set(e.athlete_id, byLift);
        }
        if (byLift.has(e.lift)) continue; // newest first wins
        byLift.set(e.lift, {
          status: e.status,
          pending: e.coach_decision === "pending",
        });
      }

      return athleteIds.map((id) => {
        const latest = latestByAthlete.get(id);
        const eaks = latest ? Array.from(latest.byEx.values()) : [];
        return {
          athlete_id: id,
          full_name: profileMap.get(id) ?? null,
          tag: tagMap.get(id) ?? null,
          last_log_date: latest?.date ?? null,
          last_eak: eaks.length
            ? eaks.reduce((a, b) => a + b, 0) / eaks.length
            : null,
          last_form: formMap.get(id) ?? null,
          eak_signals: signalMap.get(id) ?? null,
        };
      });

    },
  });

  const athletes = rosterQuery.data ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const qc = useQueryClient();

  const signalRank = (a: AthleteRow): number => {
    if (!a.eak_signals) return 4;
    const sigs = Array.from(a.eak_signals.values());
    const pending = sigs.filter((s) => s.pending);
    if (pending.some((s) => s.status === "red_strong" || s.status === "red")) return 0;
    if (pending.some((s) => s.status === "push")) return 1;
    if (pending.some((s) => s.status === "yellow")) return 2;
    if (pending.length > 0) return 3;
    return 4;
  };

  const filteredAthletes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = [...athletes].sort((x, y) => signalRank(x) - signalRank(y));
    if (!q) return base;
    return base.filter(
      (a) =>
        (a.full_name ?? "").toLowerCase().includes(q) ||
        (a.tag ?? "").toLowerCase().includes(q),
    );
  }, [athletes, searchQuery]);

  const updateTagMutation = useMutation({
    mutationFn: async ({ athleteId, tag }: { athleteId: string; tag: string }) => {
      if (!coachId) throw new Error("Du behöver vara inloggad.");
      const { error } = await supabase
        .from("coach_athletes")
        .update({ tag: tag.trim() || null })
        .eq("coach_id", coachId)
        .eq("athlete_id", athleteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach-roster", coachId] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            Roster · Readiness
          </p>
          <h1 className="text-2xl font-bold tracking-tight">My athletes</h1>
          <p className="text-sm text-muted-foreground">
            Click an athlete to see their EAkoefficient dashboard, set baselines, and
            build their week.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or tag…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:w-56"
            />
          </div>
          <Button asChild className="shrink-0">
            <Link to="/coach/invites">
              <Mail className="mr-1 h-4 w-4" /> Invite athlete
            </Link>
          </Button>
        </div>
      </div>

      {rosterQuery.isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {rosterQuery.isError && (
        <p role="alert" className="text-sm text-destructive">Kunde inte hämta atletöversikten. Försök igen.</p>
      )}

      {!rosterQuery.isLoading && !rosterQuery.isError && athletes.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> No athletes yet
            </CardTitle>
            <CardDescription>
               Send a request from Connect athletes. They appear here once they accept.
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

      {!rosterQuery.isLoading && athletes.length > 0 && filteredAthletes.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No athletes match your search.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAthletes.map((a) => (
          <AthleteCard
            key={a.athlete_id}
            athlete={a}
            onUpdateTag={(tag) =>
              updateTagMutation.mutate({ athleteId: a.athlete_id, tag })
            }
            isUpdatingTag={updateTagMutation.isPending}
          />
        ))}
      </div>
      <EakDecisionPanel athletes={athletes} />
    </div>
  );
}

function AthleteCard({
  athlete,
  onUpdateTag,
  isUpdatingTag,
}: {
  athlete: AthleteRow;
  onUpdateTag: (tag: string) => void;
  isUpdatingTag: boolean;
}) {
  const [isEditingTag, setIsEditingTag] = useState(false);
  const [tagInput, setTagInput] = useState(athlete.tag ?? "");

  const status = readinessFromEAk(athlete.last_eak ?? 0);
  const daysSince =
    athlete.last_log_date != null
      ? differenceInDays(new Date(), parseISO(athlete.last_log_date))
      : null;
  const needsAttention =
    status === "exhausted" || (daysSince !== null && daysSince > 5);

  const handleSaveTag = () => {
    onUpdateTag(tagInput);
    setIsEditingTag(false);
  };

  const handleCancelTag = () => {
    setTagInput(athlete.tag ?? "");
    setIsEditingTag(false);
  };

  return (
    <Link
      to="/coach/athletes/$athleteId"
      params={{ athleteId: athlete.athlete_id }}
      className="group"
    >
      <Card className="h-full transition-all group-hover:border-primary/40 group-hover:shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate">{athlete.full_name ?? "Unnamed athlete"}</span>
              {isEditingTag ? (
                <span
                  className="inline-flex items-center gap-1"
                  onClick={(e) => e.preventDefault()}
                >
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="#tag"
                    className="h-6 w-24 text-xs px-1.5 py-0"
                    disabled={isUpdatingTag}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTag();
                      if (e.key === "Escape") handleCancelTag();
                    }}
                    autoFocus
                    onBlur={handleSaveTag}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSaveTag();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleCancelTag();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : athlete.tag ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsEditingTag(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Tag className="h-3 w-3" />
                  {athlete.tag}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsEditingTag(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Tag className="h-3 w-3" />
                  Add tag
                </button>
              )}
            </span>
            {needsAttention && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            )}
          </CardTitle>
          <CardDescription>
            {athlete.last_log_date
              ? `Last set: ${format(parseISO(athlete.last_log_date), "MMM d")}${
                  daysSince !== null && daysSince > 0
                    ? ` (${daysSince}d ago)`
                    : ""
                }`
              : "No sets logged yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              EAk
            </span>
            {athlete.last_eak && athlete.last_eak > 0 ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px]",
                  readinessClasses(status),
                )}
              >
                {athlete.last_eak.toFixed(0)}% · {readinessLabel(status)}
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">—</span>
            )}
          </div>
          {athlete.eak_signals && athlete.eak_signals.size > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {(["squat", "bench", "deadlift"] as const).map((lift) => {
                const sig = athlete.eak_signals?.get(lift);
                if (!sig) return null;
                const chip = SIGNAL_CHIP[sig.status] ?? SIGNAL_CHIP.insufficient_data;
                return (
                  <span
                    key={lift}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px]",
                      chip.cls,
                      sig.pending ? "ring-1 ring-current" : "opacity-70",
                    )}
                    title={sig.pending ? "Väntar på ditt beslut" : "Beslutad"}
                  >
                    {LIFT_CHIP[lift]}: {chip.label}
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Form
            </span>
            <span className="font-mono tabular-nums text-sm font-medium">
              {athlete.last_form != null ? `${athlete.last_form}/10` : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
