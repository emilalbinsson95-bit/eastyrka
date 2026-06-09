import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, Flame, Snowflake, Repeat, Watch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  type Discipline,
  type StepInput,
  disciplineEmoji,
  disciplineLabel,
  formatDuration,
  totalPlannedSeconds,
} from "@/lib/endurance";
import { estimateForRpe, type AthleteBenchmarks } from "@/lib/endurancePaceHr";
import { MarkEnduranceDoneButton } from "@/components/MarkEnduranceDoneButton";

interface Session {
  id: string;
  date: string;
  discipline: Discipline;
  title: string | null;
  mode: string;
  status: string;
  planned_total_seconds: number | null;
  planned_avg_rpe: number | null;
  notes: string | null;
}

interface Step extends StepInput {
  id: string;
  parent_id: string | null;
}

type Profile = AthleteBenchmarks;

interface RowLine {
  kind: "warmup" | "main" | "cooldown" | "work" | "recovery" | "group";
  label: string;
  duration: number | null;
  rpe: number | null;
  pace: string | null;
  hr: string | null;
  notes: string | null;
  depth: number;
  repeatCount?: number;
  /** For group header rows, an aggregate per-rep duration sum. */
  groupSeconds?: number;
}

function classifyStep(
  step: Step,
  index: number,
  total: number,
): RowLine["kind"] {
  const note = (step.notes ?? "").toLowerCase();
  if (note.includes("warm")) return "warmup";
  if (note.includes("cool")) return "cooldown";
  if (note.includes("recov") || note.includes("rest") || note.includes("easy"))
    return "recovery";
  if (note.includes("work") || note.includes("hard") || note.includes("tempo"))
    return "work";
  if (index === 0) return "warmup";
  if (index === total - 1) return "cooldown";
  return "main";
}

function buildRows(
  steps: Step[],
  discipline: Discipline,
  prof: Profile,
): RowLine[] {
  const byParent = new Map<string | null, Step[]>();
  for (const s of steps) {
    const key = s.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.order_index - b.order_index);

  const out: RowLine[] = [];
  function walk(parentId: string | null, depth: number) {
    const kids = byParent.get(parentId) ?? [];
    kids.forEach((k, i) => {
      if (k.is_group) {
        const childSeconds = totalPlannedSeconds(
          (byParent.get(k.id) ?? []).map((c) => ({ ...c })),
        );
        out.push({
          kind: "group",
          label: k.notes ?? `${k.repeat_count}× set`,
          duration: childSeconds * k.repeat_count,
          rpe: null,
          pace: null,
          hr: null,
          notes: null,
          depth,
          repeatCount: k.repeat_count,
          groupSeconds: childSeconds,
        });
        walk(k.id, depth + 1);
      } else {
        const kind = classifyStep(k, i, kids.length);
        const stepDisc = (k.discipline ?? discipline) as Discipline;
        const est = estimateForRpe(stepDisc, k.target_rpe, prof);
        out.push({
          kind,
          label: k.notes ?? defaultLabel(kind),
          duration: k.duration_seconds,
          rpe: k.target_rpe,
          pace: est.paceLabel ?? est.wattLabel ?? null,
          hr: est.hrLabel ?? null,
          notes: null,
          depth,
        });
      }
    });
  }
  walk(null, 0);
  return out;
}

function defaultLabel(kind: RowLine["kind"]): string {
  switch (kind) {
    case "warmup":
      return "Warm-up";
    case "cooldown":
      return "Cool-down";
    case "work":
      return "Work";
    case "recovery":
      return "Recovery";
    default:
      return "Main";
  }
}

function kindBadge(kind: RowLine["kind"]) {
  switch (kind) {
    case "warmup":
      return {
        cls: "bg-status-peaking/25 text-status-peaking-foreground border-transparent",
        icon: <Flame className="h-3 w-3" />,
        label: "Warm-up",
      };
    case "cooldown":
      return {
        cls: "bg-primary/15 text-primary border-transparent",
        icon: <Snowflake className="h-3 w-3" />,
        label: "Cool-down",
      };
    case "work":
      return {
        cls: "bg-status-exhausted/25 text-status-exhausted-foreground border-transparent",
        icon: null,
        label: "Work",
      };
    case "recovery":
      return {
        cls: "bg-muted text-muted-foreground border-transparent",
        icon: null,
        label: "Recovery",
      };
    case "group":
      return {
        cls: "bg-accent text-accent-foreground border-transparent",
        icon: <Repeat className="h-3 w-3" />,
        label: "Repeat",
      };
    default:
      return {
        cls: "bg-secondary text-secondary-foreground border-transparent",
        icon: null,
        label: "Main",
      };
  }
}

export function EnduranceTodayCard({
  athleteId,
  dateStr,
}: {
  athleteId: string;
  dateStr: string;
}) {
  const sessionsQuery = useQuery({
    queryKey: ["today-endurance", athleteId, dateStr],
    queryFn: async () => {
      const { data: sessions, error } = await supabase
        .from("endurance_sessions")
        .select(
          "id, date, discipline, title, mode, status, planned_total_seconds, planned_avg_rpe, notes",
        )
        .eq("athlete_id", athleteId)
        .eq("date", dateStr);
      if (error) throw error;
      return (sessions ?? []) as Session[];
    },
  });

  const sessionIds = sessionsQuery.data?.map((s) => s.id) ?? [];

  const stepsQuery = useQuery({
    queryKey: ["today-endurance-steps", sessionIds.join(",")],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_steps")
        .select(
          "id, session_id, parent_id, order_index, is_group, repeat_count, discipline, duration_seconds, target_rpe, notes",
        )
        .in("session_id", sessionIds);
      if (error) throw error;
      return (data ?? []) as (Step & { session_id: string })[];
    },
  });

  const profileQuery = useQuery({
    queryKey: ["today-endurance-profile", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("max_hr, resting_hr, ten_k_pb_seconds, css_per_100m_seconds, ftp_watts")
        .eq("id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        max_hr: null,
        resting_hr: null,
        ten_k_pb_seconds: null,
        css_per_100m_seconds: null,
        ftp_watts: null,
      }) as Profile;
    },
  });

  const sessions = sessionsQuery.data ?? [];
  const stepsBySession = useMemo(() => {
    const m = new Map<string, Step[]>();
    for (const s of stepsQuery.data ?? []) {
      const arr = m.get(s.session_id) ?? [];
      arr.push(s);
      m.set(s.session_id, arr);
    }
    return m;
  }, [stepsQuery.data]);

  if (sessionsQuery.isLoading) return null;
  if (sessions.length === 0) return null;

  const prof = profileQuery.data ?? {
    max_hr: null,
    resting_hr: null,
    ten_k_pb_seconds: null,
    css_per_100m_seconds: null,
    ftp_watts: null,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Watch className="h-4 w-4 text-primary" />
          Today's endurance session{sessions.length > 1 ? "s" : ""}
        </CardTitle>
        <CardDescription>
          Built so you can copy the steps straight into your watch — duration,
          target RPE, estimated pace & HR.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.map((s) => {
          const steps = stepsBySession.get(s.id) ?? [];
          const rows = buildRows(steps, s.discipline, prof);
          const total =
            s.planned_total_seconds ??
            totalPlannedSeconds(steps as StepInput[]);
          return (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-card/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{disciplineEmoji(s.discipline)}</span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {s.title ?? `${disciplineLabel(s.discipline)} session`}
                    </div>
                    {s.notes && (
                      <div className="text-xs text-muted-foreground truncate">
                        {s.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary">{formatDuration(total)}</Badge>
                  {s.planned_avg_rpe != null && (
                    <Badge variant="outline">avg RPE {s.planned_avg_rpe}</Badge>
                  )}
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No structured steps. Open the{" "}
                  <Link to="/endurance" className="underline">
                    endurance editor
                  </Link>{" "}
                  to add warm-up / intervals / cool-down.
                </div>
              ) : (
                <ol className="divide-y divide-border">
                  {rows.map((r, i) => {
                    const b = kindBadge(r.kind);
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                        style={{ paddingLeft: 12 + r.depth * 16 }}
                      >
                        <Badge
                          className={`flex items-center gap-1 ${b.cls}`}
                        >
                          {b.icon}
                          {r.kind === "group"
                            ? `${r.repeatCount}× ${formatDuration(r.groupSeconds ?? 0)}`
                            : b.label}
                        </Badge>
                        <span className="font-medium">{r.label}</span>
                        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                          {r.duration != null && r.kind !== "group" && (
                            <span className="rounded bg-muted px-2 py-0.5 font-semibold">
                              {formatDuration(r.duration)}
                            </span>
                          )}
                          {r.rpe != null && (
                            <span className="rounded border border-border px-2 py-0.5">
                              RPE {r.rpe}
                            </span>
                          )}
                          {r.pace && (
                            <span className="rounded border border-border px-2 py-0.5">
                              {r.pace}
                            </span>
                          )}
                          {r.hr && (
                            <span className="rounded border border-border px-2 py-0.5">
                              {r.hr}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {!prof.max_hr && !prof.ten_k_pb_seconds && (
                <div className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                  Add max HR and a recent 10k PB on your{" "}
                  <Link to="/me" className="underline">
                    profile
                  </Link>{" "}
                  to see pace and HR estimates here.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                {s.status !== "completed" && (
                  <MarkEnduranceDoneButton
                    sessionId={s.id}
                    plannedSeconds={s.planned_total_seconds}
                    plannedAvgRpe={s.planned_avg_rpe}
                    invalidateKeys={[
                      ["today-endurance", athleteId, dateStr],
                      ["endurance-sessions", athleteId],
                    ]}
                  />
                )}
                <Link
                  to="/endurance"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Open in editor
                </Link>
              </div>
            </div>
          );
        })}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Activity className="h-3 w-3" />
          Pace & HR are estimates from your profile (max HR, 10k PB, CSS, FTP).
          Use them as guard-rails, then trust feel/RPE on the day.
        </p>
      </CardContent>
    </Card>
  );
}
