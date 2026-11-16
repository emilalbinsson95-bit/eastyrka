import { pctOf1RM } from "@/lib/intensity";

/**
 * Procent som styrning per rad (steg 2 i "tre vägar").
 * A row with target_pct is steered by a fixed percent of the exercise baseline:
 * every set gets the same weight, the RPE slider never touches it, and the
 * athlete's following sets are not adjusted after RPE.
 */
export const PCT_MIN = 30;
export const PCT_MAX = 105;
export const PCT_STEP = 0.5;
/** Rows with this many equal sets get "Logga alla set som planerat". */
export const BULK_LOG_MIN_SETS = 4;
export const HARD_SET_RPE = 6;

export const isPercentRow = (row: { target_pct?: number | null }) => row.target_pct != null && Number(row.target_pct) > 0;

/** Clamp to 30–105 in steps of 0.5; null for empty/invalid input. */
export function normalizePct(value: number | string | null | undefined): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) return null;
  return Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(n / PCT_STEP) * PCT_STEP));
}

/** Weight = baseline × percent, rounded to the coach's step (2.5 / 1.25 / 1 kg). */
export function pctWeightKg(baselineKg: number | null | undefined, pct: number, stepKg = 2.5): number | null {
  if (!baselineKg || !(baselineKg > 0) || !(pct > 0)) return null;
  const step = stepKg > 0 ? stepKg : 2.5;
  return Math.round(((baselineKg * pct) / 100) / step) * step;
}

/**
 * Estimated RPE for a percent and rep count (nearest RTS value, column 12 above
 * 12 reps). Returns null when below the RPE 6 value, i.e. a light set.
 */
export function estimatedRpeFromPct(pct: number, reps: number): number | null {
  if (!(pct > 0) || !(reps > 0)) return null;
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

/** A percent row whose estimated RPE is under 6 is light; RPE/RIR rows are always hard. */
export function isLightPercentRow(row: { target_pct?: number | null; target_reps: number }): boolean {
  return isPercentRow(row) && estimatedRpeFromPct(Number(row.target_pct), row.target_reps) === null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** "10 × 10 · 92,5 kg (58 %)" or "10 × 10 · 58 % – baslinje saknas". */
export function pctRowLabel(row: { target_sets: number; target_reps: number; target_pct?: number | null; target_weight_kg?: number | null }): string {
  const pct = Number(row.target_pct);
  const head = `${row.target_sets} × ${row.target_reps}`;
  if (row.target_weight_kg != null && Number(row.target_weight_kg) > 0) return `${head} · ${fmt(Number(row.target_weight_kg))} kg (${fmt(pct)} %)`;
  return `${head} · ${fmt(pct)} % – baslinje saknas`;
}

/**
 * Frivillig RPE (steg 3b). Loggade set får sakna RPE, men bara på procentrader:
 * första setet kräver RPE när den uppskattade RPE:n är 7 eller mer; övriga set
 * och lätta förstaset får loggas utan. RPE/RIR-rader kräver alltid RPE.
 */
export const RPE_REQUIRED_FROM = 7;
export function rpeRequired(row: { target_pct?: number | null; target_reps: number }, setNumber: number): boolean {
  if (!isPercentRow(row)) return true;
  if (setNumber !== 1) return false;
  const est = estimatedRpeFromPct(Number(row.target_pct), row.target_reps);
  return est != null && est >= RPE_REQUIRED_FROM;
}

/** A logged RPE counts only when it is a real rating (unrated sets are NULL, or 0 after Number()). */
export const isRatedRpe = (v: unknown): v is number | string => v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;

/** Average over rated sets only; null when no set was rated. */
export function avgRatedRpe(rows: { rpe?: unknown }[]): number | null {
  const vals = rows.filter((r) => isRatedRpe(r.rpe)).map((r) => Number(r.rpe));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** "8,5" or "–" for an unrated set. */
export const loggedRpeText = (v: unknown) => (isRatedRpe(v) ? String(Math.round(Number(v) * 10) / 10).replace(".", ",") : "–");
