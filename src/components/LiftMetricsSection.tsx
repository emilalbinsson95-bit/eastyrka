import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { plannedSessionDate } from "@/lib/planned-session-dates";
import { chartStrengthSeries, type ChartLog } from "@/lib/chartMetrics";
import { compLiftKey, isCompLift, type CompLift } from "@/lib/liftIdentity";
import {
  LIFTS,
  LIGHT_PHASES,
  liftMetrics,
  missingHeavyStreaks,
  plannedRowSets,
  round1,
  type LiftMetrics,
  type LiftMetricsByLift,
  type MetricSet,
} from "@/lib/liftMetrics";

const LIFT_LABEL: Record<CompLift, string> = { squat: "Knäböj", bench: "Bänkpress", deadlift: "Marklyft" };


type Log = ChartLog & { variation?: string | null; is_warmup_reference?: boolean; is_technique?: boolean };

const weekKey = (date: string) => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (n: number | null, d = 1) => (n == null ? "—" : n.toFixed(d).replace(".", ","));

function sumMetrics(list: LiftMetrics[]): LiftMetrics {
  const missing = list.some((m) => m.baselineMissing);
  return {
    hardSets: list.reduce((a, m) => a + m.hardSets, 0),
    lightSets: list.reduce((a, m) => a + m.lightSets, 0),
    volume: missing ? null : list.reduce((a, m) => a + (m.volume ?? 0), 0),
    heavySets: missing ? null : list.reduce((a, m) => a + (m.heavySets ?? 0), 0),
    baselineMissing: missing,
  };
}

export function LiftMetricsSection({
  athleteId,
  logs,
  baselines,
  days,
}: {
  athleteId: string;
  logs: Log[];
  baselines: Record<string, number>;
  days: number;
}) {
  const [lift, setLift] = useState<CompLift>("squat");

  const planQuery = useQuery({
    queryKey: ["lift-metrics-plan", athleteId],
    queryFn: async () => {
      const since = format(addDays(new Date(), -400), "yyyy-MM-dd");
      const [weeksRes, mesoRes] = await Promise.all([
        supabase
          .from("week_plans")
          .select("id, week_start_date, status, is_deload, training_phase, mesocycle_id, planned_sessions(id, day_of_week, title, planned_exercises(exercise, variation, target_sets, target_reps, target_weight_kg, target_rpe, is_technique))")
          .eq("athlete_id", athleteId)
          .eq("status", "published")
          .gte("week_start_date", since)
          .order("week_start_date"),
        supabase
          .from("mesocycles")
          .select("id, name, start_date, total_weeks, status")
          .eq("athlete_id", athleteId)
          .gte("start_date", since)
          .order("start_date", { ascending: false }),
      ]);
      if (weeksRes.error) throw weeksRes.error;
      if (mesoRes.error) throw mesoRes.error;
      return { weeks: weeksRes.data ?? [], mesocycles: mesoRes.data ?? [] };
    },
  });

  const weeks = planQuery.data?.weeks ?? [];
  const mesocycles = planQuery.data?.mesocycles ?? [];

  // Week metadata: working week unless the published plan marks it light.
  const weekInfo = useMemo(() => {
    const info = new Map<string, { working: boolean; mesocycleId: string | null }>();
    for (const w of weeks) {
      const key = weekKey(w.week_start_date);
      const light = w.is_deload || LIGHT_PHASES.has((w.training_phase ?? "").toLowerCase());
      const prev = info.get(key);
      info.set(key, { working: (prev?.working ?? true) && !light, mesocycleId: w.mesocycle_id ?? prev?.mesocycleId ?? null });
    }
    return info;
  }, [weeks]);

  const plannedByWeek = useMemo(() => {
    const map = new Map<string, MetricSet[]>();
    for (const w of weeks) {
      for (const s of w.planned_sessions ?? []) {
        const date = plannedSessionDate(w.week_start_date, s, w.planned_sessions);
        const key = weekKey(date);
        const list = map.get(key) ?? [];
        for (const row of s.planned_exercises ?? []) list.push(...plannedRowSets(row, baselines));
        map.set(key, list);
      }
    }
    return map;
  }, [weeks, baselines]);

  const loggedByWeek = useMemo(() => {
    const map = new Map<string, MetricSet[]>();
    for (const l of logs) {
      const key = weekKey(l.date);
      const list = map.get(key) ?? [];
      list.push(l);
      map.set(key, list);
    }
    return map;
  }, [logs]);

  const cutoff = format(addDays(new Date(), -days), "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

  const weekly = useMemo(() => {
    const keys = new Set<string>();
    for (const k of loggedByWeek.keys()) if (k >= weekKey(cutoff) && k <= today) keys.add(k);
    for (const k of plannedByWeek.keys()) if (k >= weekKey(cutoff) && k <= today) keys.add(k);
    return [...keys].sort().map((week) => ({
      week,
      working: weekInfo.get(week)?.working ?? true,
      planned: plannedByWeek.has(week) ? liftMetrics(plannedByWeek.get(week)!, baselines) : null,
      metrics: liftMetrics(loggedByWeek.get(week) ?? [], baselines),
    }));
  }, [loggedByWeek, plannedByWeek, weekInfo, baselines, cutoff, today]);

  const missingHeavy = useMemo(() => missingHeavyStreaks(weekly), [weekly]);

  // Strength trend per comp lift (shared chart measurement + 3-session rolling EAk).
  const series = useMemo(
    () => chartStrengthSeries(logs.filter((l) => isCompLift(l.exercise, l.variation)), baselines)
      .map((p) => ({ ...p, lift: compLiftKey(p.exercise) }))
      .filter((p): p is typeof p & { lift: CompLift } => p.lift !== null),
    [logs, baselines],
  );

  const blocks = useMemo(() => {
    return mesocycles
      .filter((m) => m.start_date <= today)
      .map((m) => {
        const end = format(addDays(parseISO(m.start_date), m.total_weeks * 7 - 1), "yyyy-MM-dd");
        const blockWeeks = [...new Set(weeks.filter((w) => w.mesocycle_id === m.id).map((w) => weekKey(w.week_start_date)))]
          .filter((k) => k <= today);
        const working = blockWeeks.filter((k) => weekInfo.get(k)?.working ?? true);
        const perLift = LIFTS.map((l) => {
          const perWeek = working.map((k) => liftMetrics(loggedByWeek.get(k) ?? [], baselines)[l]);
          const total = sumMetrics(perWeek);
          const n = Math.max(1, working.length);
          const pts = series.filter((p) => p.lift === l && p.date >= m.start_date && p.date <= end);
          const eakPts = pts.filter((p) => p.eak != null);
          return {
            lift: l,
            hard: total.hardSets / n,
            light: total.lightSets / n,
            volume: total.volume == null ? null : total.volume / n,
            heavy: total.heavySets == null ? null : total.heavySets / n,
            eakStart: eakPts[0]?.eak ?? null,
            eakEnd: eakPts.length > 1 ? eakPts[eakPts.length - 1].eak : null,
            // Up to three measurements at each end, never overlapping.
            e1Start: pts.length >= 2 ? median(pts.slice(0, Math.min(3, Math.floor(pts.length / 2))).map((p) => p.e1rm)) : null,
            e1End: pts.length >= 2 ? median(pts.slice(-Math.min(3, Math.floor(pts.length / 2))).map((p) => p.e1rm)) : null,
          };
        });
        return { id: m.id, name: m.name, start: m.start_date, end, workingWeeks: working.length, perLift };
      })
      .filter((b) => b.workingWeeks > 0);
  }, [mesocycles, weeks, weekInfo, loggedByWeek, baselines, series, today]);

  const rows = [...weekly].reverse();
  const cell = (planned: number | null | undefined, done: number | null, d = 0) => (
    <span className="font-mono">
      <span className="text-muted-foreground">{planned === undefined ? "–" : fmt(planned ?? null, d)} / </span>
      {fmt(done, d)}
    </span>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hårda set, lätta set, mängd och tunga set</CardTitle>
          <CardDescription>
            Per huvudlyft och vecka, ordinerat / genomfört. Hårt set = RPE 6 eller mer (loggad RPE, annars uppskattad ur RTS-tabellen). Mängd = vikt ÷ baslinje × reps; varianter räknas till huvudlyftet. Tungt set = minst 85 % av baslinjen. Bara visning, inget i generatorn ändras.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {LIFTS.map((l) => (
              <Button key={l} size="sm" variant={l === lift ? "default" : "outline"} onClick={() => setLift(l)}>
                {LIFT_LABEL[l]}
                {missingHeavy[l].length > 0 && <span className="ml-1.5 h-2 w-2 rounded-full bg-destructive" aria-label="Saknar tunga set" />}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen träning i perioden.</p>
          ) : (
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Vecka</th>
                  <th className="px-2 py-2 text-center">Hårda set</th>
                  <th className="px-2 py-2 text-center">Lätta set</th>
                  <th className="px-2 py-2 text-center">Mängd</th>
                  <th className="px-2 py-2 text-center">Tunga set</th>
                  <th className="px-3 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const m = w.metrics[lift];
                  const p = w.planned?.[lift];
                  const flagged = missingHeavy[lift].includes(w.week);
                  const empty = m.hardSets + m.lightSets === 0 && (!p || p.hardSets + p.lightSets === 0);
                  if (empty) return null;
                  return (
                    <tr key={w.week} className={cn("border-t border-border", !w.working && "text-muted-foreground")}>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {format(parseISO(w.week), "d MMM", { locale: sv })}
                        {!w.working && <span className="ml-1 text-xs">(lätt vecka)</span>}
                      </td>
                      <td className="px-2 py-2 text-center">{cell(p ? p.hardSets : undefined, m.hardSets)}</td>
                      <td className="px-2 py-2 text-center">{cell(p ? p.lightSets : undefined, m.lightSets)}</td>
                      <td className="px-2 py-2 text-center">{cell(p ? round1(p.volume) : undefined, round1(m.volume), 1)}</td>
                      <td className="px-2 py-2 text-center">{cell(p ? p.heavySets : undefined, m.heavySets)}</td>
                      <td className="px-3 py-2 text-xs">
                        {m.baselineMissing && <span className="text-muted-foreground">Baslinje saknas</span>}
                        {flagged && <Badge variant="destructive" className="ml-1">Inga tunga set två veckor i rad</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Blockjämförelse</CardTitle>
          <CardDescription>
            Genomfört snitt per arbetsvecka i varje block med publicerade veckor, med EAk-trend vid blockets första och sista mätpass och e1RM-median (tre mätpass) i början och slutet. Nyaste blocket överst. Lätta veckor räknas inte.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {planQuery.isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Laddar…</p>
          ) : blocks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Inga publicerade block med arbetsveckor det senaste året.</p>
          ) : (
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Block / lyft</th>
                  <th className="px-2 py-2 text-center">Hårda</th>
                  <th className="px-2 py-2 text-center">Lätta</th>
                  <th className="px-2 py-2 text-center">Mängd</th>
                  <th className="px-2 py-2 text-center">Tunga</th>
                  <th className="px-2 py-2 text-center">EAk</th>
                  <th className="px-2 py-2 text-center">e1RM</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <Fragment key={b.id}>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={7} className="px-3 py-2 text-xs font-semibold">
                        {b.name} · {format(parseISO(b.start), "d MMM yyyy", { locale: sv })} · {b.workingWeeks} arbetsveckor
                      </td>
                    </tr>
                    {b.perLift.map((r) => (
                      <tr key={`${b.id}-${r.lift}`} className="border-t border-border">
                        <td className="px-3 py-2">{LIFT_LABEL[r.lift]}</td>
                        <td className="px-2 py-2 text-center font-mono">{fmt(r.hard)}</td>
                        <td className="px-2 py-2 text-center font-mono">{fmt(r.light)}</td>
                        <td className="px-2 py-2 text-center font-mono">{fmt(r.volume)}</td>
                        <td className="px-2 py-2 text-center font-mono">{fmt(r.heavy)}</td>
                        <td className="px-2 py-2 text-center font-mono whitespace-nowrap">
                          {r.eakStart == null ? "—" : r.eakEnd == null ? `${fmt(r.eakStart, 0)} %` : `${fmt(r.eakStart, 0)} → ${fmt(r.eakEnd, 0)} %`}
                        </td>
                        <td className="px-2 py-2 text-center font-mono whitespace-nowrap">
                          {r.e1Start == null ? "—" : `${fmt(r.e1Start, 0)} → ${fmt(r.e1End, 0)}`}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
