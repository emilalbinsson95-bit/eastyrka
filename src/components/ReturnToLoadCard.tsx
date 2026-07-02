import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { HeartPulse, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchUnavailability } from "@/lib/unavailability";
import { deriveBaselinesFromLogs } from "@/lib/baselineFromLogs";
import { autoFloatBaselines } from "@/lib/baselineAutofloat.functions";

const CORE_KEYWORDS = ["squat", "bench", "deadlift", "press", "row", "pull"];
const RETURN_TO_LOAD_TAG = "[return-to-load]";

type BaselineRow = { exercise: string; oneRmKg: number; source: "coach" | "derived" };

/**
 * A conservative "get the body used to load again" session, auto-suggested
 * on the first day after a sick/injured period.
 *
 * Prescription: 60% × 3×5, RPE cap 6, rounded to 2.5 kg.
 * Rationale: 2–4 wk detraining drops maximal strength ~5–10% in trained
 * lifters (Mujika & Padilla 2001). 60% × 5 sits near RPE 5–6 for a fully
 * detrained lifter — enough to re-groove pattern and rekindle CNS drive
 * without spiking soreness/ACWR.
 */
export function ReturnToLoadCard({ athleteId, dateStr }: { athleteId: string; dateStr: string }) {
  const qc = useQueryClient();
  const today = parseISO(dateStr);

  const unavailQuery = useQuery({
    queryKey: ["unavailability", athleteId, format(today, "yyyy-MM")],
    queryFn: () => fetchUnavailability(athleteId, today),
  });

  // Find a period that ended in the last 7 days AND today is >= endDate + 1.
  const activeReturn = useMemo(() => {
    const list = unavailQuery.data ?? [];
    return list
      .filter((u) => {
        const end = parseISO(u.endDate);
        const daysSince = differenceInCalendarDays(today, end);
        return daysSince >= 1 && daysSince <= 7;
      })
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  }, [unavailQuery.data, today]);

  // Merge coach baselines + log-derived baselines. Coach baseline wins if > 0;
  // otherwise we fall back to the athlete's own recent form so the return-to-load
  // prescription is grounded in real, current output — not a stale/absent input.
  const baselinesQuery = useQuery({
    queryKey: ["baselines-merged", athleteId],
    queryFn: async (): Promise<BaselineRow[]> => {
      const [coachRes, derived] = await Promise.all([
        supabase.from("baselines").select("exercise, one_rm_kg").eq("athlete_id", athleteId),
        deriveBaselinesFromLogs(athleteId),
      ]);
      if (coachRes.error) throw coachRes.error;
      const coachMap = new Map<string, number>();
      for (const r of coachRes.data ?? []) {
        coachMap.set(r.exercise as string, Number(r.one_rm_kg));
      }
      const rows: BaselineRow[] = [];
      const seen = new Set<string>();
      for (const [exercise, oneRmKg] of coachMap) {
        if (oneRmKg > 0) {
          rows.push({ exercise, oneRmKg, source: "coach" });
          seen.add(exercise);
        }
      }
      for (const d of derived) {
        if (seen.has(d.exercise)) continue;
        rows.push({ exercise: d.exercise, oneRmKg: d.oneRmKg, source: "derived" });
      }
      return rows;
    },
    enabled: !!activeReturn,
  });

  const alreadyLoggedQuery = useQuery({
    queryKey: ["return-to-load-logged", athleteId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("id, comment")
        .eq("athlete_id", athleteId)
        .eq("date", dateStr);
      if (error) throw error;
      return (data ?? []).some((r) => (r.comment as string | null)?.includes(RETURN_TO_LOAD_TAG));
    },
    enabled: !!activeReturn,
  });

  const [dismissed, setDismissed] = useState(false);
  const [posting, setPosting] = useState(false);

  const prescription = useMemo(() => {
    const rows = baselinesQuery.data ?? [];
    if (rows.length === 0) return [];
    const core = rows.filter((r) => CORE_KEYWORDS.some((k) => r.exercise.toLowerCase().includes(k)));
    const chosen = (core.length > 0 ? core : [...rows].sort((a, b) => b.oneRmKg - a.oneRmKg)).slice(0, 5);
    return chosen.map((r) => {
      const raw = r.oneRmKg * 0.6;
      const weight = Math.round(raw / 2.5) * 2.5;
      return { exercise: r.exercise, weight, sets: 3, reps: 5, oneRm: r.oneRmKg, source: r.source };
    });
  }, [baselinesQuery.data]);

  const hasDerived = prescription.some((p) => p.source === "derived");
  const autoFloat = useServerFn(autoFloatBaselines);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshBaselines() {
    setRefreshing(true);
    try {
      const res = await autoFloat({ data: { athleteId } });
      qc.invalidateQueries({ queryKey: ["baselines-merged", athleteId] });
      qc.invalidateQueries({ queryKey: ["baselines", athleteId] });
      if (res.updated.length === 0) {
        toast.info("Baselines already match your recent form.");
      } else {
        toast.success(
          `Updated ${res.updated.length} baseline${res.updated.length === 1 ? "" : "s"} from recent form.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh baselines");
    } finally {
      setRefreshing(false);
    }
  }

  if (!activeReturn) return null;
  if (dismissed) return null;
  if (alreadyLoggedQuery.data) return null;

  const daysSince = differenceInCalendarDays(today, parseISO(activeReturn.endDate));
  const reasonLabel = activeReturn.reason === "injured" ? "injury" : activeReturn.reason === "sick" ? "illness" : "break";

  async function logAll() {
    if (prescription.length === 0) {
      toast.error("Add 1RM baselines first so I can prescribe loads.");
      return;
    }
    setPosting(true);
    try {
      const rows: Array<{
        athlete_id: string; date: string; exercise: string;
        set_number: number; reps: number; weight_kg: number; rpe: number;
        comment: string;
      }> = [];
      for (const p of prescription) {
        for (let s = 1; s <= p.sets; s++) {
          rows.push({
            athlete_id: athleteId,
            date: dateStr,
            exercise: p.exercise,
            set_number: s,
            reps: p.reps,
            weight_kg: p.weight,
            rpe: 6,
            comment: `${RETURN_TO_LOAD_TAG} 60% × 3×5 · post-${reasonLabel}`,
          });
        }
      }
      const { error } = await supabase.from("training_logs").insert(rows);
      if (error) throw error;
      toast.success("Return-to-load session logged");
      qc.invalidateQueries({ queryKey: ["logs-today", athleteId] });
      qc.invalidateQueries({ queryKey: ["return-to-load-logged", athleteId, dateStr] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log sets");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
              Setpoint · Return to load
            </p>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HeartPulse className="h-5 w-5 text-primary" />
              Ease back in after your {reasonLabel}
            </CardTitle>
            <CardDescription>
              Ended {daysSince === 1 ? "yesterday" : `${daysSince} days ago`} ({format(parseISO(activeReturn.endDate), "MMM d")}).
              Full-body primer at <span className="font-medium">60% × 3×5, RPE ≤6</span> — re-grooves pattern
              without spiking fatigue.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-[0.16em]">Auto</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {baselinesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading baselines…</p>
        ) : prescription.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No 1RM baselines yet — add them on your profile so I can prescribe loads.
          </p>
        ) : (
          <div className="rounded-md border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Exercise</th>
                  <th className="px-3 py-2 text-right">Sets × Reps</th>
                  <th className="px-3 py-2 text-right">Load</th>
                  <th className="px-3 py-2 text-right">RPE</th>
                </tr>
              </thead>
              <tbody>
                {prescription.map((p) => (
                  <tr key={p.exercise} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{p.exercise}</span>
                        {p.source === "derived" && (
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                            from recent form
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{p.sets} × {p.reps}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{p.weight} kg</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">≤6</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasDerived && (
          <p className="text-xs text-muted-foreground">
            Some loads use a baseline derived from your last ~120 days of set-1 logs
            (trimmed median of top E1RMs × 0.98). Accept it as your coach baseline to
            lock it in — future EAk readings will use the same number.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={logAll} disabled={posting || prescription.length === 0}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {posting ? "Logging…" : "Log this session"}
          </Button>
          <Button
            variant="outline"
            onClick={refreshBaselines}
            disabled={refreshing}
            title="Update coach baselines from your recent peak logs (autoFloat)"
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh baselines from form"}
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(true)}>Skip today</Button>
        </div>
      </CardContent>
    </Card>
  );
}

