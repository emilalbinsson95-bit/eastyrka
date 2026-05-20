import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays, addDays } from "date-fns";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DISCIPLINES,
  type Discipline,
  formatDuration,
  disciplineEmoji,
  disciplineLabel,
} from "@/lib/endurance";

/** Returns "drift" info comparing actual vs plan. Null if not enough info. */
export function sessionDrift(s: {
  planned_total_seconds: number | null;
  actual_total_seconds: number | null;
  planned_avg_rpe: number | null;
  peak_rpe: number | null;
  overall_rpe: number | null;
}): { tone: "ok" | "warn" | "alert"; label: string } | null {
  if (s.actual_total_seconds == null && s.overall_rpe == null && s.peak_rpe == null) return null;
  const parts: string[] = [];
  let worst: "ok" | "warn" | "alert" = "ok";
  if (s.planned_total_seconds && s.actual_total_seconds) {
    const diffPct = ((s.actual_total_seconds - s.planned_total_seconds) / s.planned_total_seconds) * 100;
    if (Math.abs(diffPct) >= 10) {
      parts.push(`${diffPct > 0 ? "+" : ""}${Math.round(diffPct)}% time`);
      worst = Math.abs(diffPct) >= 25 ? "alert" : "warn";
    }
  }
  const rpeRef = s.planned_avg_rpe;
  const rpeAct = s.peak_rpe ?? s.overall_rpe;
  if (rpeRef != null && rpeAct != null) {
    const diff = rpeAct - rpeRef;
    if (Math.abs(diff) >= 1.5) {
      parts.push(`${diff > 0 ? "+" : ""}${diff.toFixed(1)} RPE`);
      const sev = Math.abs(diff) >= 2.5 ? "alert" : "warn";
      if (sev === "alert" || worst === "ok") worst = sev;
    }
  }
  if (parts.length === 0) return { tone: "ok", label: "On plan" };
  return { tone: worst, label: parts.join(" · ") };
}

export function driftBadgeClasses(tone: "ok" | "warn" | "alert"): string {
  if (tone === "ok") return "bg-status-peaking/30 text-status-peaking-foreground border-transparent";
  if (tone === "warn") return "bg-status-adapting/30 text-status-adapting-foreground border-transparent";
  return "bg-status-exhausted/30 text-status-exhausted-foreground border-transparent";
}

interface Row {
  id: string;
  date: string;
  discipline: Discipline;
  mode: string;
  title: string | null;
  status: string;
  planned_total_seconds: number | null;
  planned_avg_rpe: number | null;
  actual_total_seconds: number | null;
  overall_rpe: number | null;
  peak_rpe: number | null;
}

function isCompleted(r: Row): boolean {
  return (
    r.status === "completed" ||
    r.actual_total_seconds != null ||
    r.overall_rpe != null ||
    r.peak_rpe != null
  );
}

type TotalsMap = Record<Discipline, { minutes: number; count: number; rpeSum: number; rpeN: number }>;

function emptyTotals(): TotalsMap {
  return {
    run: { minutes: 0, count: 0, rpeSum: 0, rpeN: 0 },
    bike: { minutes: 0, count: 0, rpeSum: 0, rpeN: 0 },
    swim: { minutes: 0, count: 0, rpeSum: 0, rpeN: 0 },
    other: { minutes: 0, count: 0, rpeSum: 0, rpeN: 0 },
  };
}

export function EnduranceSummaryCard({ athleteId }: { athleteId: string }) {
  const today = new Date();
  const todayIso = format(today, "yyyy-MM-dd");
  const pastSinceIso = format(subDays(today, 7), "yyyy-MM-dd");
  const upcomingUntilIso = format(addDays(today, 7), "yyyy-MM-dd");

  const q = useQuery({
    queryKey: ["coach-endurance-summary", athleteId, pastSinceIso, upcomingUntilIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select(
          "id, date, discipline, mode, title, planned_total_seconds, planned_avg_rpe, actual_total_seconds, overall_rpe, peak_rpe",
        )
        .eq("athlete_id", athleteId)
        .gte("date", pastSinceIso)
        .lte("date", upcomingUntilIso)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];
  if (q.isLoading || rows.length === 0) return null;

  const past: Row[] = [];
  const upcoming: Row[] = [];
  for (const r of rows) {
    if (r.date < todayIso) past.push(r);
    else upcoming.push(r);
  }
  // Past stays newest-first (query order). Upcoming should be soonest-first.
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  // Past totals: actual minutes + avg peak RPE
  const pastTotals = emptyTotals();
  for (const r of past) {
    const t = pastTotals[r.discipline] ?? pastTotals.other;
    t.count += 1;
    if (r.actual_total_seconds) t.minutes += Math.round(r.actual_total_seconds / 60);
    const rpe = r.peak_rpe ?? r.overall_rpe;
    if (rpe != null) {
      t.rpeSum += Number(rpe);
      t.rpeN += 1;
    }
  }

  // Upcoming totals: planned minutes + avg planned RPE
  const upcomingTotals = emptyTotals();
  for (const r of upcoming) {
    const t = upcomingTotals[r.discipline] ?? upcomingTotals.other;
    t.count += 1;
    if (r.planned_total_seconds) t.minutes += Math.round(r.planned_total_seconds / 60);
    if (r.planned_avg_rpe != null) {
      t.rpeSum += Number(r.planned_avg_rpe);
      t.rpeN += 1;
    }
  }

  const recentPast = past.slice(0, 5);
  const nextUpcoming = upcoming.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Endurance — 7-day window
        </CardTitle>
        <CardDescription>RPE-based load. No GPS or pace targets.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <EnduranceWindow
          label="Past 7 days"
          emptyText="No completed sessions in the last 7 days."
          totals={pastTotals}
          rows={recentPast}
          mode="past"
        />
        <EnduranceWindow
          label="Coming 7 days"
          emptyText="No planned sessions in the next 7 days."
          totals={upcomingTotals}
          rows={nextUpcoming}
          mode="upcoming"
        />
      </CardContent>
    </Card>
  );
}

function EnduranceWindow({
  label,
  emptyText,
  totals,
  rows,
  mode,
}: {
  label: string;
  emptyText: string;
  totals: TotalsMap;
  rows: Row[];
  mode: "past" | "upcoming";
}) {
  const hasAny = rows.length > 0;
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {hasAny ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {DISCIPLINES.map((d) => {
              const t = totals[d.value];
              if (t.count === 0) return null;
              const avgRpe = t.rpeN > 0 ? (t.rpeSum / t.rpeN).toFixed(1) : "—";
              return (
                <div key={d.value} className="rounded border border-border bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {d.emoji} {disciplineLabel(d.value)}
                  </div>
                  <div className="text-sm font-semibold">
                    {t.minutes > 0
                      ? `${t.minutes} min`
                      : `${t.count} planned`}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.count} session{t.count === 1 ? "" : "s"} ·{" "}
                    {mode === "past" ? "avg RPE" : "planned RPE"} {avgRpe}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            {rows.map((s) => {
              const drift = mode === "past" ? sessionDrift(s) : null;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span>{disciplineEmoji(s.discipline)}</span>
                    <span className="text-muted-foreground">
                      {format(parseISO(s.date), "EEE MMM d")}
                    </span>
                    <span className="font-medium">{s.title ?? "Session"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {mode === "past" ? (
                      s.actual_total_seconds ? (
                        <Badge variant="secondary">{formatDuration(s.actual_total_seconds)}</Badge>
                      ) : (
                        <Badge variant="outline">plan {formatDuration(s.planned_total_seconds)}</Badge>
                      )
                    ) : (
                      <Badge variant="outline">plan {formatDuration(s.planned_total_seconds)}</Badge>
                    )}
                    {mode === "past" && s.peak_rpe != null && (
                      <Badge variant="outline">peak {s.peak_rpe}</Badge>
                    )}
                    {mode === "upcoming" && s.planned_avg_rpe != null && (
                      <Badge variant="outline">RPE {s.planned_avg_rpe}</Badge>
                    )}
                    {drift && drift.tone !== "ok" && (
                      <Badge className={driftBadgeClasses(drift.tone)}>{drift.label}</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}
