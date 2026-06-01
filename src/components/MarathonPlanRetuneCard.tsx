import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { Sparkles, TrendingDown, TrendingUp, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  acwr,
  recentQualityDrift,
  volumeAdjustmentForAcwr,
  sessionLoad,
  type LoadSession,
  type DriftSession,
} from "@/lib/enduranceLoad";

/**
 * Adaptive re-tune card for a long-running marathon (or any) plan.
 *
 * Soft re-tune (Nivå A) + coach-bekräftad apply (Nivå B):
 * Reads the athlete's last 35 days of completed sessions, computes
 * RPE-drift and ACWR, combines them into a single volume multiplier,
 * and lets the coach (or athlete) scale all upcoming "planned" sessions
 * in the next 28 days. Completed/in-progress sessions are never touched.
 */
export function MarathonPlanRetuneCard({
  athleteId,
  canApply = true,
}: {
  athleteId: string;
  canApply?: boolean;
}) {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const horizonEnd = format(addDays(new Date(), 28), "yyyy-MM-dd");
  const lookbackStart = format(addDays(new Date(), -35), "yyyy-MM-dd");

  // Recent history for drift + ACWR
  const history = useQuery({
    queryKey: ["retune-history", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select("id, date, discipline, status, planned_total_seconds, actual_total_seconds, planned_avg_rpe, overall_rpe, peak_rpe")
        .eq("athlete_id", athleteId)
        .gte("date", lookbackStart)
        .lte("date", today)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Upcoming non-completed planned sessions
  const upcoming = useQuery({
    queryKey: ["retune-upcoming", athleteId],
    queryFn: async () => {
      const fromDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select("id, date, title, planned_total_seconds, planned_avg_rpe, status")
        .eq("athlete_id", athleteId)
        .gte("date", fromDate)
        .lte("date", horizonEnd)
        .eq("status", "planned")
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((s) => (s.planned_total_seconds ?? 0) > 0);
    },
  });

  const analysis = useMemo(() => {
    const rows = history.data ?? [];
    const load: LoadSession[] = rows.map((r) => ({
      date: r.date,
      discipline: r.discipline,
      actual_total_seconds: r.actual_total_seconds,
      planned_total_seconds: r.planned_total_seconds,
      overall_rpe: r.overall_rpe,
      peak_rpe: r.peak_rpe,
      planned_avg_rpe: r.planned_avg_rpe,
    }));
    const drift: DriftSession[] = rows.map((r) => ({
      date: r.date,
      planned_avg_rpe: r.planned_avg_rpe,
      overall_rpe: r.overall_rpe,
      peak_rpe: r.peak_rpe,
      status: r.status,
    }));
    const a = acwr(load);
    const d = recentQualityDrift(drift, 5);
    const acwrMult = volumeAdjustmentForAcwr(a.ratio);
    // Safety-first: the more conservative multiplier wins.
    const combined = Math.min(d.volumeMultiplier, acwrMult);
    const finalMult = Math.max(0.75, Math.min(1.10, combined));
    return { acwr: a, drift: d, acwrMult, finalMult };
  }, [history.data]);

  const apply = useMutation({
    mutationFn: async () => {
      const ids = (upcoming.data ?? []).map((s) => s.id);
      if (ids.length === 0) throw new Error("Inga kommande pass att justera.");
      const mult = analysis.finalMult;

      // Update planned_total_seconds on sessions one-by-one (Supabase has no bulk-multiply).
      for (const s of upcoming.data ?? []) {
        const next = Math.max(60, Math.round((s.planned_total_seconds ?? 0) * mult / 30) * 30);
        const { error } = await supabase
          .from("endurance_sessions")
          .update({ planned_total_seconds: next })
          .eq("id", s.id);
        if (error) throw error;
      }

      // Scale duration_seconds of all leaf steps under those sessions.
      const { data: steps, error: stepsErr } = await supabase
        .from("endurance_steps")
        .select("id, duration_seconds, is_group")
        .in("session_id", ids)
        .eq("is_group", false);
      if (stepsErr) throw stepsErr;
      for (const st of steps ?? []) {
        if (!st.duration_seconds) continue;
        const next = Math.max(30, Math.round(st.duration_seconds * mult / 15) * 15);
        const { error } = await supabase
          .from("endurance_steps")
          .update({ duration_seconds: next })
          .eq("id", st.id);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => {
      const pct = Math.round((analysis.finalMult - 1) * 100);
      toast.success(`Justerade ${n} pass med ${pct >= 0 ? "+" : ""}${pct}% volym`);
      qc.invalidateQueries({ queryKey: ["coach-endurance", athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-endurance"] });
      qc.invalidateQueries({ queryKey: ["week-endurance"] });
      qc.invalidateQueries({ queryKey: ["retune-upcoming", athleteId] });
      qc.invalidateQueries({ queryKey: ["endurance-sessions"] });
      qc.invalidateQueries({ queryKey: ["cycle-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (history.isLoading || upcoming.isLoading) return null;

  const { acwr: a, drift, acwrMult, finalMult } = analysis;
  const pct = Math.round((finalMult - 1) * 100);
  const noChange = Math.abs(pct) < 3;
  const upcomingCount = upcoming.data?.length ?? 0;

  // If nothing to do, render a calm "all clear" state instead of hiding entirely
  // — the coach should see that the system is actively monitoring.
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Adaptiv plan-justering
          <Badge variant="outline" className="ml-auto text-[10px]">
            {upcomingCount} kommande pass
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Metric
            label="ACWR (7d/28d)"
            value={(a.ratio ?? 0).toFixed(2)}
            sub={a.zone}
            tone={a.zone === "optimal" ? "ok" : a.zone === "low" ? "warn" : a.zone === "high" ? "warn" : "bad"}
          />
          <Metric
            label="RPE-drift"
            value={drift.inspected > 0 ? `${drift.avgDelta >= 0 ? "+" : ""}${drift.avgDelta}` : "—"}
            sub={`${drift.drifted}/${drift.inspected} pass`}
            tone={drift.recommendation === "hold" ? "ok" : drift.recommendation === "easy_week" ? "warn" : "bad"}
          />
          <Metric
            label="Föreslagen volym"
            value={`${pct >= 0 ? "+" : ""}${pct}%`}
            sub={noChange ? "på spår" : pct < 0 ? "deload" : "ramp"}
            tone={noChange ? "ok" : pct < 0 ? "warn" : "ok"}
          />
        </div>

        <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
          {noChange ? (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Form, ACWR och RPE-respons är inom plan. Inga ändringar rekommenderade.
            </span>
          ) : pct < 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
              {drift.recommendation === "reduce_volume"
                ? "Konsekvent RPE-överskott — föreslår tydlig deload."
                : drift.recommendation === "easy_week"
                ? "RPE driver över plan — föreslår lättare vecka."
                : `Hög ACWR (${(a.ratio ?? 0).toFixed(2)}) — föreslår mjukare ramp.`}
              {" "}Skalas på {upcomingCount} pass (–28d framåt) som ännu inte loggats.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              Låg ACWR ({(a.ratio ?? 0).toFixed(2)}) — det finns utrymme att rampa upp +{pct}%.
            </span>
          )}
        </div>

        {canApply && (
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              {upcomingCount > 0
                ? <>Skalar <strong>{upcomingCount}</strong> planerade pass de närmsta 4 veckorna med <strong>×{finalMult.toFixed(2)}</strong>. Loggade pass rörs aldrig.</>
                : "Inga planerade pass i fönstret 4 veckor framåt."}
            </div>
            <Button
              size="sm"
              variant={noChange ? "outline" : "default"}
              onClick={() => apply.mutate()}
              disabled={apply.isPending || upcomingCount === 0 || noChange}
              title={noChange ? "Inget att justera — multiplikatorn är 1.00" : undefined}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {apply.isPending ? "Re-tunar…" : "Re-tune kommande 4 veckor"}
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function Metric({
  label, value, sub, tone,
}: {
  label: string; value: string; sub?: string;
  tone: "ok" | "warn" | "bad";
}) {
  const toneClass =
    tone === "ok" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-destructive";
  return (
    <div className="rounded border border-border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// keep tree-shaker honest
void sessionLoad;
