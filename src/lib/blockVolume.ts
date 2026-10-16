import { volumeCategory, type TemplateWeek } from "@/lib/strengthTemplates";
import { countsForEAk, dailyE1RM, pickMeasurementSet } from "@/lib/eakoefficient";

/**
 * Volume that adapts between blocks (coach's design choice, not a research
 * rule). Per lift, the last block (default 28 days) is evaluated:
 *  +1 set/week: ≤ 4 % drop vs the measurement set in ≥ 75 % of sessions AND
 *               the 3-session EAk trend was stable or rising.
 *  −1 set/week: trend fell below 97 % of baseline, or ≥ 5 % drop in more than
 *               a third of sessions.
 *  otherwise unchanged. Without data, the athlete's volume tolerance
 *  (low / normal / high → −1 / 0 / +1) is the starting value.
 */

export type Lift = "squat" | "bench" | "deadlift";
export type VolumeTolerance = "low" | "normal" | "high";
export const LIFT_CAT: Record<Lift, string> = { squat: "squat", bench: "horizontal-press", deadlift: "hinge" };
const COMP: Record<Lift, RegExp> = {
  squat: /^(back )?squat$/i,
  bench: /^bench press$/i,
  deadlift: /^((sumo|conventional) )?deadlift$/i,
};
export const SESSION_LIFT_LIMIT = 6;
const MIN_SESSIONS = 4;

export interface BlockLog { date: string; exercise: string; reps: number; weight_kg: number; rpe: number | null; set_number?: number }
export interface LiftEvaluation { lift: Lift; delta: -1 | 0 | 1; sessions: number; source: "data" | "tolerance"; reason: string }

export function toleranceDelta(t: VolumeTolerance | null | undefined): -1 | 0 | 1 {
  return t === "low" ? -1 : t === "high" ? 1 : 0;
}

export function evaluateBlock(
  logs: BlockLog[],
  baselines: Record<string, number>,
  tolerance: VolumeTolerance,
  today: string,
  days = 28,
): LiftEvaluation[] {
  const since = new Date(new Date(today).getTime() - days * 864e5).toISOString().slice(0, 10);
  return (Object.keys(COMP) as Lift[]).map((lift) => {
    const rows = logs.filter((l) => l.date >= since && COMP[lift].test(l.exercise.trim()) && l.rpe != null)
      .map((l, i) => ({ ...l, rpe: Number(l.rpe), reps: Number(l.reps), weight_kg: Number(l.weight_kg), set_number: l.set_number ?? i + 1 }));
    const byDate = new Map<string, typeof rows>();
    for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    const sessions = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) => {
      const m = pickMeasurementSet(g);
      if (!m) return null;
      const e = dailyE1RM(m);
      const later = g.filter((s) => s !== m && s.set_number > m.set_number && countsForEAk(s));
      const drop = later.length ? Math.max(...later.map((s) => ((e - dailyE1RM(s)) / e) * 100)) : 0;
      return { e, drop, exercise: m.exercise };
    }).filter((s): s is NonNullable<typeof s> => !!s);

    if (sessions.length < MIN_SESSIONS) {
      const d = toleranceDelta(tolerance);
      return { lift, delta: d, sessions: sessions.length, source: "tolerance", reason: `För lite data (${sessions.length} pass) — volymtolerans "${tolerance}" används.` };
    }
    const ma = sessions.map((_, i) => {
      const s = sessions.slice(Math.max(0, i - 2), i + 1);
      return s.reduce((a, b) => a + b.e, 0) / s.length;
    });
    const baseline = baselines[sessions[0].exercise] ?? 0;
    const lastTrendPct = baseline > 0 ? (ma[ma.length - 1] / baseline) * 100 : 100;
    const rising = ma[ma.length - 1] >= ma[Math.min(2, ma.length - 1)] * 0.99;
    const good = sessions.filter((s) => s.drop <= 4).length / sessions.length;
    const bad = sessions.filter((s) => s.drop >= 5).length / sessions.length;
    if (lastTrendPct < 97 || bad > 1 / 3)
      return { lift, delta: -1, sessions: sessions.length, source: "data", reason: `EAk-trend ${lastTrendPct.toFixed(0)} %, tapp ≥ 5 % i ${Math.round(bad * 100)} % av passen → −1 set/vecka.` };
    if (good >= 0.75 && rising)
      return { lift, delta: 1, sessions: sessions.length, source: "data", reason: `Tapp ≤ 4 % i ${Math.round(good * 100)} % av passen och stabil/stigande trend → +1 set/vecka.` };
    return { lift, delta: 0, sessions: sessions.length, source: "data", reason: "Mittemellan — volymen lämnas oförändrad." };
  });
}

/**
 * Add/remove sets per week on the competition lift (fallback: first exercise
 * of the category). Added sets go to existing sessions; once a session reaches
 * ~6 working sets on the lift the set is not added and a warning is returned
 * suggesting another day or spreading the volume. `weeklyCap` is the coach's
 * total weekly ceiling per lift.
 */
export function applyBlockVolume(
  weeks: TemplateWeek[],
  evals: LiftEvaluation[],
  weeklyCap?: number | null,
): { weeks: TemplateWeek[]; warnings: string[] } {
  const warnings = new Set<string>();
  const out = weeks.map((week) => {
    if (/deload|taper|peak|återhämt|toppning/i.test(week.label)) return week;
    const sessions = week.sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e })) }));
    for (const ev of evals) {
      if (!ev.delta) continue;
      const cat = LIFT_CAT[ev.lift];
      const items = sessions.flatMap((s) => s.exercises.filter((e) => volumeCategory(e) === cat).map((e) => ({ s, e })));
      if (!items.length) continue;
      const comp = items.filter((x) => COMP[ev.lift].test(x.e.exercise.trim()));
      const pool = comp.length ? comp : items;
      const weekSum = items.reduce((a, x) => a + x.e.target_sets, 0);
      if (ev.delta > 0) {
        if (weeklyCap && weekSum >= weeklyCap) continue;
        const liftSets = (s: (typeof sessions)[number]) => s.exercises.filter((e) => volumeCategory(e) === cat).reduce((a, e) => a + e.target_sets, 0);
        const target = [...pool].sort((a, b) => liftSets(a.s) - liftSets(b.s))[0];
        if (liftSets(target.s) >= SESSION_LIFT_LIMIT) {
          warnings.add(`${ev.lift}: passen har redan ~${SESSION_LIFT_LIMIT} arbetsset — lägg till en träningsdag eller sprid volymen i stället för fler set.`);
          continue;
        }
        target.e.target_sets += 1;
      } else {
        const target = [...pool].sort((a, b) => b.e.target_sets - a.e.target_sets)[0];
        if (target.e.target_sets > 2) target.e.target_sets -= 1;
      }
    }
    return { ...week, sessions };
  });
  return { weeks: out, warnings: [...warnings] };
}

/**
 * In-session extra sets (fatigue stop): after the planned sets, another set
 * on the same weight is allowed while the drop vs the measurement set is
 * ≤ 4 % and RPE is at most target + 1. Stop at ≥ 5 % drop or planned + 2.
 */
export function canAddExtraSet(input: {
  plannedSets: number;
  doneSets: Array<{ reps: number; weight_kg: number; rpe: number; set_number: number }>;
  targetRpe: number | null;
  isLightOrSingle: boolean;
}): { allowed: boolean; reason: string } {
  const { plannedSets, doneSets, targetRpe, isLightOrSingle } = input;
  if (isLightOrSingle) return { allowed: false, reason: "" };
  if (doneSets.length < plannedSets) return { allowed: false, reason: "" };
  if (doneSets.length >= plannedSets + 2) return { allowed: false, reason: "Tak nått: planerat + 2 set." };
  const m = pickMeasurementSet(doneSets);
  const last = [...doneSets].sort((a, b) => b.set_number - a.set_number)[0];
  if (!m || !last || !countsForEAk(last)) return { allowed: false, reason: "" };
  const drop = ((dailyE1RM(m) - dailyE1RM(last)) / dailyE1RM(m)) * 100;
  if (drop >= 5) return { allowed: false, reason: `Tapp ${drop.toFixed(1)} % — stanna här.` };
  if (drop > 4) return { allowed: false, reason: `Tapp ${drop.toFixed(1)} % — inga fler set.` };
  if (targetRpe != null && last.rpe > targetRpe + 1) return { allowed: false, reason: "RPE mer än 1 över målet — stanna här." };
  return { allowed: true, reason: `Tapp ${Math.max(0, drop).toFixed(1)} % mot mätsetet — du får köra ett set till på samma vikt.` };
}
