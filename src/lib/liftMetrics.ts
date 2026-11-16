import { pctOf1RM } from "@/lib/intensity";
import { compLiftKey, competitionExerciseName, COMP_NAME, type CompLift } from "@/lib/liftIdentity";
import { lookupBaseline } from "@/lib/eakoefficient";

/**
 * Lift metrics per main lift (steg 1 i "tre vägar till utveckling").
 * Display only: nothing here changes generation, guards, EAk, push or peaking.
 *
 *  - Hårda set: RPE ≥ 6 (logged RPE, otherwise estimated from the RTS table).
 *  - Lätta set: under RPE 6.
 *  - Mängd: Σ weight ÷ competition-lift baseline × reps. Variants count to their main lift.
 *  - Tunga set: weight ≥ 85 % of baseline.
 */
export const HARD_SET_RPE = 6;
export const HEAVY_SET_PCT = 85;
export const LIFTS: CompLift[] = ["squat", "bench", "deadlift"];

const ACCESSORY =
  /leg press|benpress|hack|split|bulgar|goblet|dumbbell|hantel|\bdb\b|smith|machine|maskin|belt squat|bältesböj|sissy|jump|hopp|romanian|rdl|stiff|good morning|hip thrust|back extension|ryggresning|incline|lutande|overhead|military|militärpress|row|rodd|curl|dips/i;

/** Main lift the set belongs to; variants count, accessories never. */
export function metricLiftKey(exercise: string, variation?: string | null): CompLift | null {
  const direct = compLiftKey(exercise);
  if (direct) return direct;
  const name = exercise.toLowerCase();
  if (ACCESSORY.test(name)) return null;
  if (/squat|knäböj|\bböj\b/.test(name)) return "squat";
  if (/bench|bänk|spoto|larsen|board press|pin press|floor press/.test(name)) return "bench";
  if (/deadlift|marklyft|\bmark\b|block pull|rack pull/.test(name)) return "deadlift";
  void variation;
  return null;
}

/** Competition baseline used for Mängd: stance-specific deadlift first, then the generic name. */
export function compBaseline(
  baselines: Record<string, number>,
  lift: CompLift,
  exercise: string,
  variation?: string | null,
): number | null {
  const stance = lift === "deadlift" ? competitionExerciseName(exercise, variation) : null;
  const value =
    (stance ? lookupBaseline(baselines, stance) : undefined) ??
    lookupBaseline(baselines, COMP_NAME[lift]) ??
    (lift === "deadlift"
      ? lookupBaseline(baselines, "Sumo deadlift") ?? lookupBaseline(baselines, "Conventional deadlift")
      : undefined);
  return value && value > 0 ? value : null;
}

/**
 * Estimated RPE for a set without logged RPE: nearest RTS value for weight ÷ baseline
 * and reps (column 12 above 12 reps). Returns null when below the RPE 6 value.
 */
export function estimateRpe(weightKg: number, reps: number, baselineKg: number): number | null {
  if (!(weightKg > 0) || !(reps > 0) || !(baselineKg > 0)) return null;
  const pct = (weightKg / baselineKg) * 100;
  const r = Math.min(12, Math.max(1, Math.round(reps)));
  const floor = pctOf1RM(HARD_SET_RPE, r) ?? 0;
  if (pct < floor) return null;
  let best = HARD_SET_RPE;
  let bestDiff = Infinity;
  for (let rpe = 6; rpe <= 10; rpe += 0.5) {
    const diff = Math.abs((pctOf1RM(rpe, r) ?? 0) - pct);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rpe;
    }
  }
  return best;
}

export interface MetricSet {
  exercise: string;
  variation?: string | null;
  reps: number;
  weight_kg: number | null;
  /** Logged or target RPE; 0/null means not given. */
  rpe?: number | null;
  is_warmup_reference?: boolean;
  is_technique?: boolean;
  /** Planned RPE-steered rows are always hard sets. */
  rpeSteered?: boolean;
}

export interface LiftMetrics {
  hardSets: number;
  lightSets: number;
  /** null when the competition baseline is missing. */
  volume: number | null;
  heavySets: number | null;
  baselineMissing: boolean;
}

export type LiftMetricsByLift = Record<CompLift, LiftMetrics>;

const empty = (): LiftMetrics => ({ hardSets: 0, lightSets: 0, volume: 0, heavySets: 0, baselineMissing: false });

export function emptyLiftMetrics(): LiftMetricsByLift {
  return { squat: empty(), bench: empty(), deadlift: empty() };
}

/** Hard/light/Mängd/heavy per main lift for any set collection (planned or logged). */
export function liftMetrics(sets: MetricSet[], baselines: Record<string, number>): LiftMetricsByLift {
  const out = emptyLiftMetrics();
  for (const s of sets) {
    if (s.is_warmup_reference || s.is_technique || !(s.reps > 0)) continue;
    const lift = metricLiftKey(s.exercise, s.variation);
    if (!lift) continue;
    const m = out[lift];
    const base = compBaseline(baselines, lift, s.exercise, s.variation);
    const own = lookupBaseline(baselines, s.exercise);
    const ownBase = own && own > 0 ? own : base;
    const weight = Number(s.weight_kg ?? 0);
    const rpe = Number(s.rpe ?? 0);
    const hard =
      rpe > 0 ? rpe >= HARD_SET_RPE
      : s.rpeSteered ? true
      : ownBase && weight > 0 ? estimateRpe(weight, s.reps, ownBase) !== null
      : true;
    if (hard) m.hardSets += 1;
    else m.lightSets += 1;
    if (!base) {
      m.baselineMissing = true;
      continue;
    }
    if (weight > 0) {
      m.volume = (m.volume ?? 0) + (weight / base) * s.reps;
      if ((weight / (ownBase ?? base)) * 100 >= HEAVY_SET_PCT) m.heavySets = (m.heavySets ?? 0) + 1;
    }
  }
  for (const lift of LIFTS) {
    if (out[lift].baselineMissing) {
      out[lift].volume = null;
      out[lift].heavySets = null;
    }
  }
  return out;
}

/** Expand a planned row (sets × reps @ weight/RPE) into metric sets. */
export function plannedRowSets(row: {
  exercise: string;
  variation?: string | null;
  target_sets: number;
  target_reps: number;
  target_weight_kg?: number | null;
  target_rpe?: number | null;
  is_technique?: boolean;
}, baselines: Record<string, number>): MetricSet[] {
  const lift = metricLiftKey(row.exercise, row.variation);
  let weight = row.target_weight_kg != null ? Number(row.target_weight_kg) : null;
  const rpe = row.target_rpe != null ? Number(row.target_rpe) : null;
  if ((weight == null || weight <= 0) && lift && rpe != null && row.target_reps > 0) {
    const own = lookupBaseline(baselines, row.exercise) ?? compBaseline(baselines, lift, row.exercise, row.variation);
    const pct = pctOf1RM(rpe, row.target_reps);
    if (own && pct) weight = Math.round((own * pct) / 100 / 2.5) * 2.5;
  }
  const n = Math.max(0, Math.round(Number(row.target_sets) || 0));
  return Array.from({ length: n }, () => ({
    exercise: row.exercise,
    variation: row.variation,
    reps: Number(row.target_reps) || 0,
    weight_kg: weight,
    rpe,
    is_technique: row.is_technique,
    rpeSteered: rpe != null,
  }));
}

/** Weeks (in order) where a lift had no heavy set in two consecutive working weeks. */
export function missingHeavyStreaks(
  weeks: Array<{ week: string; working: boolean; metrics: LiftMetricsByLift }>,
): Record<CompLift, string[]> {
  const out: Record<CompLift, string[]> = { squat: [], bench: [], deadlift: [] };
  for (const lift of LIFTS) {
    let prev: string | null = null;
    for (const w of weeks) {
      if (!w.working) continue;
      const m = w.metrics[lift];
      const trained = m.hardSets + m.lightSets > 0;
      const none = trained && m.heavySets === 0;
      if (none && prev) out[lift].push(w.week);
      prev = none ? w.week : null;
    }
  }
  return out;
}

export const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
