/**
 * EAkoefficient — autoregulation engine.
 *
 * Translates a logged set into:
 *  - Daily Estimated 1RM (E1RM)
 *  - EAkoefficient % (today's E1RM ÷ baseline 1RM)
 *  - Readiness status (Exhausted / Undertrained / Adapting / Peaking)
 *  - Intra-set volume quality vs. set 1 of the day for that exercise
 *
 * Same formulas as the source prototype, kept in one place so athlete UI
 * and coach analytics never drift.
 */

export type ReadinessStatus =
  | "exhausted"
  | "undertrained"
  | "adapting"
  | "peaking"
  | "unknown";

export type VolumeQuality =
  | "baseline"
  | "optimal"
  | "acceptable"
  | "fatigue_limit"
  | "sandbag"
  | "unknown";

/**
 * Threshold (percent) above set 1's E1RM that a later set must exceed to be
 * flagged as a probable "set 1 sandbag" — i.e. the athlete underperformed
 * set 1 (skipped warm-up, low effort, mis-logged RPE) and a later, harder
 * set produced a clearly higher E1RM than physiologically plausible within
 * the same session.
 */
export const SANDBAG_SET1_THRESHOLD_PCT = 2;

export interface SetInput {
  reps: number;
  weight_kg: number;
  rpe: number;
}

/**
 * Daily Estimated 1RM using the prototype's RPE-adjusted Epley:
 *   cappedReps = min(reps, 8)
 *   E1RM = weight × (1 + (cappedReps + (10 − rpe)) / 30)
 */
export function dailyE1RM(set: SetInput): number {
  const cappedReps = Math.min(set.reps, 8);
  return set.weight_kg * (1 + (cappedReps + (10 - set.rpe)) / 30);
}

export function eaKoefficient(set: SetInput, baseline1RM: number): number {
  if (!baseline1RM || baseline1RM <= 0) return 0;
  return (dailyE1RM(set) / baseline1RM) * 100;
}

export function readinessFromEAk(eak: number): ReadinessStatus {
  if (!eak || eak <= 0) return "unknown";
  if (eak < 92) return "exhausted";
  if (eak <= 97) return "undertrained";
  if (eak <= 102) return "adapting";
  return "peaking";
}

export function readinessLabel(status: ReadinessStatus): string {
  switch (status) {
    case "exhausted":
      return "Exhausted";
    case "undertrained":
      return "Undertrained";
    case "adapting":
      return "Adapting";
    case "peaking":
      return "Peaking";
    default:
      return "—";
  }
}

/**
 * Tailwind classes for status pills, mapped to the design tokens defined in
 * src/styles.css. Always use these — never hardcode bg-red-100 etc.
 */
export function readinessClasses(status: ReadinessStatus): string {
  switch (status) {
    case "exhausted":
      return "bg-status-exhausted text-status-exhausted-foreground";
    case "undertrained":
      return "bg-status-undertrained text-status-undertrained-foreground";
    case "adapting":
      return "bg-status-adapting text-status-adapting-foreground";
    case "peaking":
      return "bg-status-peaking text-status-peaking-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Volume quality based on E1RM drop from set 1 of the same day & exercise.
 *  - Set 1 itself is the baseline reference (no drop yet).
 *  - drop ≤ 4%   → Optimal
 *  - 4% < drop < 5% → Acceptable
 *  - drop ≥ 5%   → Fatigue limit reached
 */
export function volumeQualityFromDrop(
  setNumber: number,
  dropPercent: number,
): VolumeQuality {
  if (setNumber <= 1) return "baseline";
  if (dropPercent < -SANDBAG_SET1_THRESHOLD_PCT) return "sandbag";
  if (dropPercent <= 4) return "optimal";
  if (dropPercent >= 5) return "fatigue_limit";
  return "acceptable";
}

export function volumeQualityLabel(q: VolumeQuality): string {
  switch (q) {
    case "baseline":
      return "Set 1 ref.";
    case "optimal":
      return "Optimal";
    case "acceptable":
      return "Acceptable";
    case "fatigue_limit":
      return "Fatigue limit";
    case "sandbag":
      return "Set 1 sandbagged?";
    default:
      return "—";
  }
}

export function volumeQualityClasses(q: VolumeQuality): string {
  switch (q) {
    case "optimal":
      return "bg-status-adapting text-status-adapting-foreground";
    case "acceptable":
      return "bg-status-peaking text-status-peaking-foreground";
    case "fatigue_limit":
      return "bg-status-exhausted text-status-exhausted-foreground";
    case "sandbag":
      return "bg-status-exhausted text-status-exhausted-foreground ring-1 ring-status-exhausted-foreground/30";
    case "baseline":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Process a list of logged sets (already sorted by date/exercise/set is fine
 * but not required) and attach EAkoefficient + volume metrics.
 */
export interface ProcessedSet<T extends SetInput> {
  source: T;
  dailyE1RM: number;
  eaKoefficient: number;
  baseline1RM: number;
  status: ReadinessStatus;
  set1E1RM: number;
  dropPercent: number;
  volume: VolumeQuality;
}

export interface RawLog extends SetInput {
  id: string;
  date: string;
  exercise: string;
  variation: string | null;
  set_number: number;
}

export function processLogs<T extends RawLog>(
  logs: T[],
  baselines: Record<string, number>,
): Array<ProcessedSet<T>> {
  // Build set-1 reference per (date, exercise)
  const set1Map = new Map<string, number>();
  for (const log of logs) {
    if (log.set_number === 1) {
      const key = `${log.date}::${log.exercise}`;
      set1Map.set(key, dailyE1RM(log));
    }
  }

  return logs.map((log) => {
    const baseline = baselines[log.exercise] ?? 0;
    const e1rm = dailyE1RM(log);
    const eak = eaKoefficient(log, baseline);
    const status = readinessFromEAk(eak);

    const key = `${log.date}::${log.exercise}`;
    const set1 = set1Map.get(key) ?? 0;
    const drop = set1 > 0 && log.set_number > 1 ? ((set1 - e1rm) / set1) * 100 : 0;
    const volume =
      log.set_number === 1
        ? "baseline"
        : set1 > 0
          ? volumeQualityFromDrop(log.set_number, drop)
          : "unknown";

    return {
      source: log,
      dailyE1RM: e1rm,
      eaKoefficient: eak,
      baseline1RM: baseline,
      status,
      set1E1RM: set1,
      dropPercent: drop,
      volume,
    };
  });
}
