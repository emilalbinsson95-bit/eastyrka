// Intensity helpers — convert RPE / RIR + reps to %1RM (Helms / RTS-style table)
// and compute prescribed weight from an athlete's 1RM.

export type IntensityMetric = "rpe" | "rir";

// RPE/Reps -> %1RM (RPE 10 @ 1 rep = 100%). Standard RTS table.
// Source: Mike Tuchscherer / Eric Helms RPE chart.
const RPE_REPS_PCT: Record<number, Record<number, number>> = {
  10: { 1: 100, 2: 95.5, 3: 92.2, 4: 89.2, 5: 86.3, 6: 83.7, 7: 81.1, 8: 78.6, 9: 76.2, 10: 73.9, 11: 70.7, 12: 67.5 },
  9.5: { 1: 97.8, 2: 93.9, 3: 90.7, 4: 87.8, 5: 85.0, 6: 82.4, 7: 79.9, 8: 77.4, 9: 75.1, 10: 72.3, 11: 69.4, 12: 66.4 },
  9: { 1: 95.5, 2: 92.2, 3: 89.2, 4: 86.3, 5: 83.7, 6: 81.1, 7: 78.6, 8: 76.2, 9: 73.9, 10: 70.7, 11: 67.5, 12: 65.0 },
  8.5: { 1: 93.9, 2: 90.7, 3: 87.8, 4: 85.0, 5: 82.4, 6: 79.9, 7: 77.4, 8: 75.1, 9: 72.3, 10: 69.4, 11: 66.4, 12: 63.9 },
  8: { 1: 92.2, 2: 89.2, 3: 86.3, 4: 83.7, 5: 81.1, 6: 78.6, 7: 76.2, 8: 73.9, 9: 70.7, 10: 67.5, 11: 65.0, 12: 62.6 },
  7.5: { 1: 90.7, 2: 87.8, 3: 85.0, 4: 82.4, 5: 79.9, 6: 77.4, 7: 75.1, 8: 72.3, 9: 69.4, 10: 66.4, 11: 63.9, 12: 61.3 },
  7: { 1: 89.2, 2: 86.3, 3: 83.7, 4: 81.1, 5: 78.6, 6: 76.2, 7: 73.9, 8: 70.7, 9: 67.5, 10: 65.0, 11: 62.6, 12: 60.0 },
  6.5: { 1: 87.8, 2: 85.0, 3: 82.4, 4: 79.9, 5: 77.4, 6: 75.1, 7: 72.3, 8: 69.4, 9: 66.4, 10: 63.9, 11: 61.3, 12: 58.7 },
  6: { 1: 86.3, 2: 83.7, 3: 81.1, 4: 78.6, 5: 76.2, 6: 73.9, 7: 70.7, 8: 67.5, 9: 65.0, 10: 62.6, 11: 60.0, 12: 57.4 },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Round RPE down to nearest 0.5 in [6, 10]. */
function snapRpe(rpe: number): number {
  const clamped = clamp(rpe, 6, 10);
  return Math.round(clamped * 2) / 2;
}

/** Convert RIR to RPE: RPE = 10 - RIR (clamped). */
export function rirToRpe(rir: number): number {
  return clamp(10 - rir, 6, 10);
}

/** Convert RPE to RIR. */
export function rpeToRir(rpe: number): number {
  return clamp(10 - rpe, 0, 4);
}

/**
 * Get %1RM for a given RPE and reps. Returns null if outside the table.
 * Uses the snapped RPE.
 */
export function pctOf1RM(rpe: number, reps: number): number | null {
  const r = snapRpe(rpe);
  const repClamp = clamp(Math.round(reps), 1, 12);
  return RPE_REPS_PCT[r]?.[repClamp] ?? null;
}

/** Same but accepts RIR. */
export function pctOf1RMFromRir(rir: number, reps: number): number | null {
  return pctOf1RM(rirToRpe(rir), reps);
}

/**
 * Compute prescribed weight (kg) from 1RM × intensity, rounded to nearest `roundTo` kg.
 * Returns null if we can't compute (no 1RM, out-of-table inputs).
 */
export function prescribedWeightKg(input: {
  oneRmKg: number;
  reps: number;
  metric: IntensityMetric;
  rpe?: number | null;
  rir?: number | null;
  roundTo?: number;
}): number | null {
  const { oneRmKg, reps, metric, rpe, rir, roundTo = 2.5 } = input;
  if (!oneRmKg || oneRmKg <= 0) return null;
  let pct: number | null = null;
  if (metric === "rpe" && rpe != null) pct = pctOf1RM(rpe, reps);
  else if (metric === "rir" && rir != null) pct = pctOf1RMFromRir(rir, reps);
  if (pct == null) return null;
  const raw = (oneRmKg * pct) / 100;
  return Math.round(raw / roundTo) * roundTo;
}
