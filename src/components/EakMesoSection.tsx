/**
 * EAk – mesocykel: coachens beslutsyta per tävlingslyft.
 * Kör utvärderingen (lagrar nya fönster som väntande förslag) och visar
 * status, siffror, signalstabilitet, rebound-test och förslag med
 * Godkänn/Avvisa/Justera. Inget ändras i planen förrän coachen beslutar.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runEakEvaluation, decideEakEvaluation, applyBaselineChange } from "@/lib/eakSignal.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const LIFTS = [
  { key: "squat", label: "Knäböj" },
  { key: "bench", label: "Bänk" },
  { key: "deadlift", label: "Mark" },
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  green: { label: "Enligt plan", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  yellow: { label: "Bevaka", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  red: { label: "Bromsa", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  red_strong: { label: "Bromsa nu", cls: "bg-red-600/20 text-red-700 dark:text-red-300" },
  push: { label: "Redo för mer", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  insufficient_data: { label: "För lite data", cls: "bg-muted text-muted-foreground" },
};

function stabilityBadge(te: number | null): { label: string; cls: string } {
  if (te == null) return { label: "Räknas fram efter 8 pass", cls: "bg-muted text-muted-foreground" };
  if (te < 2) return { label: "Stabil signal", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
  if (te <= 3.5) return { label: "Normal", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  return { label: "Brusig signal – väg in readiness och atletens input mer", cls: "bg-red-500/15 text-red-600 dark:text-red-400" };
}

interface EvalRow {
  id: string;
  lift: string;
  window_start: string | null;
  window_end: string | null;
  n_sessions: number;
  l_m: number | null;
  dl_m: number | null;
  eak_m: number | null;
  slope: number | null;
  te_i: number | null;
  threshold_i: number | null;
  readiness_signal: boolean;
  athlete_signal: boolean;
  status: string;
  suggestion_text: string | null;
  coach_decision: string;
  coach_note: string | null;
}

interface ReboundRow {
  id: string;
  lift: string;
  deload_week_start: string;
  r_value: number | null;
  passed: boolean;
}

export function EakMesoSection({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const runEval = useServerFn(runEakEvaluation);
  const decide = useServerFn(decideEakEvaluation);
  const applyBaseline = useServerFn(applyBaselineChange);
  const [note, setNote] = useState<Record<string, string>>({});
  const [correctKg, setCorrectKg] = useState<Record<string, string>>({});
  const [planChanged, setPlanChanged] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Kör utvärderingen en gång per visning — lagrar nya fönster som pending.
  useEffect(() => {
    runEval({ data: { athleteId } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["eak-evals", athleteId] });
        qc.invalidateQueries({ queryKey: ["eak-rebounds", athleteId] });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const evalsQuery = useQuery({
    queryKey: ["eak-evals", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eak_meso_evaluations")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as EvalRow[];
    },
  });

  const reboundsQuery = useQuery({
    queryKey: ["eak-rebounds", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rebound_tests")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ReboundRow[];
    },
  });

  const latestByLift = useMemo(() => {
    const m = new Map<string, EvalRow>();
    for (const e of evalsQuery.data ?? []) if (!m.has(e.lift)) m.set(e.lift, e);
    return m;
  }, [evalsQuery.data]);

  const reboundByLift = useMemo(() => {
    const m = new Map<string, ReboundRow>();
    for (const r of reboundsQuery.data ?? []) if (!m.has(r.lift)) m.set(r.lift, r);
    return m;
  }, [reboundsQuery.data]);

  async function handleDecision(ev: EvalRow, decision: "approved" | "rejected" | "modified") {
    setBusy(ev.id);
    try {
      await decide({ data: { evaluationId: ev.id, decision, note: note[ev.id]?.trim() || undefined, planChanged: planChanged[ev.id] ?? false } });
      toast.success(
        decision === "approved" ? "Förslaget godkänt." : decision === "rejected" ? "Förslaget avvisat." : "Beslut sparat med justering.",
      );
      qc.invalidateQueries({ queryKey: ["eak-evals", athleteId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara beslutet");
    } finally {
      setBusy(null);
    }
  }

  async function handlePushBaseline(ev: EvalRow) {
    if (ev.l_m == null) return;
    const kg = Math.round(ev.l_m / 2.5) * 2.5;
    setBusy(ev.id);
    try {
      await applyBaseline({
        data: { athleteId, lift: ev.lift as "squat" | "bench" | "deadlift", valueKg: kg, source: "push_signal", note: `Push-signal: L_M ${ev.l_m.toFixed(1)} kg` },
      });
      await decide({ data: { evaluationId: ev.id, decision: "approved" } });
      toast.success(`Baseline uppdaterad till ${kg} kg.`);
      qc.invalidateQueries({ queryKey: ["eak-evals", athleteId] });
      qc.invalidateQueries({ queryKey: ["analytics-baselines", athleteId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte uppdatera baseline");
    } finally {
      setBusy(null);
    }
  }

  async function handleCorrection(lift: "squat" | "bench" | "deadlift") {
    const raw = (correctKg[lift] ?? "").replace(",", ".");
    const kg = Number(raw);
    if (!kg || kg <= 0) {
      toast.error("Ange en vikt i kg.");
      return;
    }
    setBusy(lift);
    try {
      await applyBaseline({ data: { athleteId, lift, valueKg: kg, source: "manual_correction" } });
      toast.success(`Baseline korrigerad till ${kg} kg.`);
      setCorrectKg((s) => ({ ...s, [lift]: "" }));
      qc.invalidateQueries({ queryKey: ["analytics-baselines", athleteId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte korrigera baseline");
    } finally {
      setBusy(null);
    }
  }

  const anyData = latestByLift.size > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">EAk – mesocykel</CardTitle>
        <CardDescription>
          Signal per tävlingslyft över de senaste passen. Förslag ändrar inget förrän du godkänner dem.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!anyData && !evalsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">
            För lite data ännu — signalerna byggs upp när atleten loggat minst fyra pass per lyft.
          </p>
        )}
        {LIFTS.map(({ key, label }) => {
          const ev = latestByLift.get(key);
          if (!ev) return null;
          const st = STATUS[ev.status] ?? STATUS.insufficient_data;
          const stab = stabilityBadge(ev.te_i);
          const rebound = reboundByLift.get(key);
          const pending = ev.coach_decision === "pending";
          return (
            <div key={key} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${stab.cls}`}>{stab.label}</span>
                {!pending && (
                  <span className="text-[11px] text-muted-foreground">
                    Beslut: {ev.coach_decision === "approved" ? "godkänt" : ev.coach_decision === "rejected" ? "avvisat" : "justerat"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground sm:grid-cols-3">
                <span>L_M: {ev.l_m != null ? `${ev.l_m.toFixed(1)} kg` : "—"}</span>
                <span>ΔL_M: {ev.dl_m != null ? `${ev.dl_m > 0 ? "+" : ""}${ev.dl_m.toFixed(1)} %` : "—"}</span>
                <span>EAk_M: {ev.eak_m != null ? `${ev.eak_m.toFixed(1)} %` : "—"}</span>
                <span>Lutning: {ev.slope != null ? `${ev.slope > 0 ? "+" : ""}${ev.slope.toFixed(2)} %/pass` : "—"}</span>
                <span>Pass: {ev.n_sessions}</span>
                <span>Tröskel: {ev.threshold_i != null ? `±${ev.threshold_i.toFixed(1)} %` : "—"}</span>
              </div>
              {(ev.readiness_signal || ev.athlete_signal) && (
                <p className="text-xs text-muted-foreground">
                  Stödsignaler: {[ev.readiness_signal ? "readiness" : null, ev.athlete_signal ? "atletens input" : null].filter(Boolean).join(", ")}
                </p>
              )}
              {rebound && (
                <p className="text-xs text-muted-foreground">
                  Rebound efter deload ({rebound.deload_week_start}):{" "}
                  {rebound.r_value != null ? `${rebound.r_value > 0 ? "+" : ""}${rebound.r_value.toFixed(1)} %` : "—"}{" "}
                  {rebound.passed ? "– återhämtningen ser bra ut" : "– svag återhämtning, bevaka"}
                </p>
              )}
              {ev.suggestion_text && <p className="text-sm">{ev.suggestion_text}</p>}
              {pending && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" disabled={busy === ev.id} onClick={() => handleDecision(ev, "approved")}>
                    Godkänn
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === ev.id} onClick={() => handleDecision(ev, "rejected")}>
                    Avvisa
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === ev.id} onClick={() => handleDecision(ev, "modified")}>
                    Justera
                  </Button>
                  <Input
                    placeholder="Notering (valfritt)"
                    value={note[ev.id] ?? ""}
                    onChange={(e) => setNote((s) => ({ ...s, [ev.id]: e.target.value }))}
                    className="h-8 w-48 text-xs"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={planChanged[ev.id] ?? false}
                      onChange={(e) => setPlanChanged((s) => ({ ...s, [ev.id]: e.target.checked }))}
                    />
                    Jag ändrade planen
                  </label>
                  {ev.status === "push" && ev.l_m != null && (
                    <Button size="sm" variant="secondary" disabled={busy === ev.id} onClick={() => handlePushBaseline(ev)}>
                      Uppdatera baseline till {(Math.round(ev.l_m / 2.5) * 2.5).toFixed(1)} kg
                    </Button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  placeholder="Korrigera baseline, kg"
                  value={correctKg[key] ?? ""}
                  onChange={(e) => setCorrectKg((s) => ({ ...s, [key]: e.target.value }))}
                  className="h-8 w-40 text-xs"
                  inputMode="decimal"
                />
                <Button size="sm" variant="ghost" disabled={busy === key} onClick={() => handleCorrection(key)}>
                  Spara korrigering
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
