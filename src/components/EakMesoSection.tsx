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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { DEFAULT_STRATEGY, weeklySessionLoad } from "@/lib/eakSignal";
import { toast } from "sonner";

const LIFTS = [
  { key: "squat", label: "Knäböj" },
  { key: "bench", label: "Bänk" },
  { key: "deadlift", label: "Mark" },
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  green: { label: "Enligt plan", cls: "bg-status-adapting text-status-adapting-foreground" },
  yellow: { label: "Bevaka", cls: "bg-status-peaking text-status-peaking-foreground" },
  red: { label: "Bromsa", cls: "bg-status-exhausted text-status-exhausted-foreground" },
  red_strong: { label: "Bromsa nu", cls: "bg-status-exhausted text-status-exhausted-foreground" },
  push: { label: "Redo för mer", cls: "bg-status-undertrained text-status-undertrained-foreground" },
  low_confidence: { label: "Ovanligt brusigt block", cls: "bg-status-peaking text-status-peaking-foreground" },
  insufficient_data: { label: "För lite data", cls: "bg-muted text-muted-foreground" },
};

function stabilityBadge(te: number | null): { label: string; cls: string } {
  if (te == null) return { label: "Brusunderlaget byggs upp", cls: "bg-muted text-muted-foreground" };
  if (te < 2) return { label: "Stabil signal", cls: "bg-status-adapting text-status-adapting-foreground" };
  if (te <= 3.5) return { label: "Normal", cls: "bg-status-peaking text-status-peaking-foreground" };
  return { label: "Brusig signal", cls: "bg-status-exhausted text-status-exhausted-foreground" };
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
  sem_pool: number | null;
  noise_ratio: number | null;
  supporting_signals: { readiness?: boolean; subjective?: boolean; warmupDrift?: boolean } | null;
  strategy_snapshot: { noiseRatioFlag?: number } | null;
  nfor_flag: boolean;
  plan_changed: boolean | null;
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

  const loadQuery = useQuery({
    queryKey: ["eak-session-load", athleteId],
    queryFn: async () => {
      const since = new Date(); since.setUTCDate(since.getUTCDate() - 84);
      const { data, error } = await supabase.from("strength_session_feedback").select("date,session_rpe,duration_min").eq("athlete_id", athleteId).gte("date", since.toISOString().slice(0, 10)).order("date");
      if (error) throw error;
      return weeklySessionLoad((data ?? []).filter((r) => r.session_rpe != null && r.duration_min != null).map((r) => ({ date: r.date, sessionRpe: Number(r.session_rpe), durationMin: Number(r.duration_min), sport: "strength" })));
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
    const changed = planChanged[ev.id];
    if (changed === undefined) { toast.error("Svara ja eller nej på om beslutet ändrade planen."); return; }
    setBusy(ev.id);
    try {
      await decide({ data: { evaluationId: ev.id, decision, note: note[ev.id]?.trim() || undefined, planChanged: changed } });
      toast.success(
        decision === "approved" ? "Förslaget godkänt." : decision === "rejected" ? "Förslaget avvisat." : "Beslut sparat med justering.",
      );
      qc.invalidateQueries({ queryKey: ["eak-evals", athleteId] });
      qc.invalidateQueries({ queryKey: ["eak-decision-summary"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara beslutet");
    } finally {
      setBusy(null);
    }
  }

  async function handlePushBaseline(ev: EvalRow) {
    if (ev.l_m == null) return;
    const changed = planChanged[ev.id];
    if (changed === undefined) { toast.error("Svara ja eller nej på om beslutet ändrade planen."); return; }
    const kg = Math.round(ev.l_m / 2.5) * 2.5;
    setBusy(ev.id);
    try {
      await applyBaseline({
        data: { athleteId, lift: ev.lift as "squat" | "bench" | "deadlift", valueKg: kg, source: "push_signal", note: `Push-signal: L_M ${ev.l_m.toFixed(1)} kg` },
      });
      await decide({ data: { evaluationId: ev.id, decision: "approved", planChanged: changed } });
      toast.success(`Baseline uppdaterad till ${kg} kg.`);
      qc.invalidateQueries({ queryKey: ["eak-evals", athleteId] });
      qc.invalidateQueries({ queryKey: ["eak-decision-summary"] });
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
        <div className="space-y-1 border-b pb-3">
          <h3 className="text-sm font-medium">Belastning (sRPE × min)</h3>
          {loadQuery.isError ? <p role="alert" className="text-xs text-destructive">Kunde inte hämta passbelastningen.</p> : loadQuery.data?.length ? <>
            <div className="h-20 w-full" role="img" aria-label="Veckobelastning för styrkepass">
              <ResponsiveContainer width="100%" height="100%"><LineChart data={loadQuery.data}><Line type="monotone" dataKey="load" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} /><Tooltip labelFormatter={(_: unknown, payload: ReadonlyArray<{ payload?: { weekStart?: string } }>) => payload?.[0]?.payload?.weekStart ?? ""} formatter={(value: number | string | Array<number | string>) => [value, "Belastning"]} contentStyle={{ background: "var(--color-popover)", borderColor: "var(--color-border)", color: "var(--color-popover-foreground)" }} /></LineChart></ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground">Senaste veckan: {loadQuery.data.at(-1)?.load.toFixed(0)} · Mot föregående fyra veckor: {loadQuery.data.at(-1)?.changePct == null ? "—" : `${loadQuery.data.at(-1)?.changePct?.toFixed(1)} %`}</p>
          </> : <p className="text-xs text-muted-foreground">Inga pass med både pass-RPE och tid ännu.</p>}
        </div>
        {!anyData && !evalsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">
            För lite data ännu — signalerna byggs upp när atleten loggat minst fyra pass per lyft.
          </p>
        )}
        {LIFTS.map(({ key, label }) => {
          const ev = latestByLift.get(key);
          if (!ev) return null;
          const st = STATUS[ev.status] ?? STATUS.insufficient_data;
          const stab = stabilityBadge(ev.sem_pool ?? ev.te_i);
          const noisy = ev.noise_ratio != null && ev.noise_ratio > (ev.strategy_snapshot?.noiseRatioFlag ?? DEFAULT_STRATEGY.noiseRatioFlag);
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
                    {ev.plan_changed != null && ` · Ändrade planen: ${ev.plan_changed ? "ja" : "nej"}`}
                  </span>
                )}
              </div>
              {ev.nfor_flag && <div role="alert" className="rounded-md border border-destructive bg-status-exhausted p-3 text-sm text-status-exhausted-foreground"><strong>Utred återhämtningen</strong><p>Prestationen återhämtar sig inte och atletens mående är sämre sedan över två veckor – utred återhämtningen (sömn, energiintag, sjukdom), inte bara programmet.</p></div>}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground sm:grid-cols-3">
                <span>L_M: {ev.l_m != null ? `${ev.l_m.toFixed(1)} kg` : "—"}</span>
                <span>ΔL_M: {ev.dl_m != null ? `${ev.dl_m > 0 ? "+" : ""}${ev.dl_m.toFixed(1)} %` : "—"}</span>
                <span>EAk_M: {ev.eak_m != null ? `${ev.eak_m.toFixed(1)} %` : "—"}</span>
                <span>Lutning: {ev.slope != null ? `${ev.slope > 0 ? "+" : ""}${ev.slope.toFixed(2)} %/pass` : "—"}</span>
                <span>Pass: {ev.n_sessions}</span>
                <span>Tröskel: {ev.threshold_i != null ? `±${ev.threshold_i.toFixed(1)} %` : "—"}</span>
              </div>
              <p className="text-xs text-muted-foreground">Signalbrus: SEM_pool {ev.sem_pool == null ? "— (underlaget byggs upp)" : `${ev.sem_pool.toFixed(2)} %`} · Blockets bruskvot {ev.noise_ratio == null ? "—" : ev.noise_ratio.toFixed(2)}</p>
              {noisy && <p role="alert" className="text-xs font-medium text-status-peaking-foreground">Ovanligt brusigt block – dra inte slutsatser för snabbt.</p>}
              <div className="flex flex-wrap gap-2">{[
                { label: "Readiness", on: ev.supporting_signals?.readiness ?? ev.readiness_signal },
                { label: "Mående", on: ev.supporting_signals?.subjective ?? ev.athlete_signal },
                { label: "Uppvärmnings-RPE", on: ev.supporting_signals?.warmupDrift ?? false },
              ].map((s) => <span key={s.label} className={`rounded-full px-2 py-1 text-[11px] ${s.on ? "bg-status-peaking text-status-peaking-foreground" : "bg-muted text-muted-foreground"}`}>{s.label}: {s.on ? "på" : "av"}</span>)}</div>
              {rebound && (
                <p className="text-xs text-muted-foreground">
                  Rebound efter deload ({rebound.deload_week_start}):{" "}
                  {rebound.r_value != null ? `R = ${rebound.r_value.toFixed(2)}` : "—"}{" "}
                  {rebound.passed ? "– återhämtningen ser bra ut" : "– svag återhämtning, bevaka"}
                </p>
              )}
              {ev.suggestion_text && <p className="text-sm">{ev.suggestion_text}</p>}
              {pending && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" disabled={busy === ev.id || planChanged[ev.id] === undefined} onClick={() => handleDecision(ev, "approved")}>
                    Godkänn
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === ev.id || planChanged[ev.id] === undefined} onClick={() => handleDecision(ev, "rejected")}>
                    Avvisa
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === ev.id || planChanged[ev.id] === undefined} onClick={() => handleDecision(ev, "modified")}>
                    Justera
                  </Button>
                  <Input
                    placeholder="Notering (valfritt)"
                    value={note[ev.id] ?? ""}
                    onChange={(e) => setNote((s) => ({ ...s, [ev.id]: e.target.value }))}
                    className="h-8 w-48 text-xs"
                  />
                  <div className="w-full space-y-2">
                    <p id={`plan-question-${ev.id}`} className="text-xs font-medium">Ändrade det planen?</p>
                    <RadioGroup aria-labelledby={`plan-question-${ev.id}`} value={planChanged[ev.id] === undefined ? "" : planChanged[ev.id] ? "yes" : "no"} onValueChange={(value) => setPlanChanged((s) => ({ ...s, [ev.id]: value === "yes" }))} className="flex gap-4">
                      {[{ value: "yes", label: "Ja" }, { value: "no", label: "Nej" }].map((o) => <div key={o.value} className="flex items-center gap-1.5"><RadioGroupItem id={`plan-${ev.id}-${o.value}`} value={o.value} /><Label htmlFor={`plan-${ev.id}-${o.value}`}>{o.label}</Label></div>)}
                    </RadioGroup>
                  </div>
                  {ev.status === "push" && ev.l_m != null && (
                    <Button size="sm" variant="secondary" disabled={busy === ev.id || planChanged[ev.id] === undefined} onClick={() => handlePushBaseline(ev)}>
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
