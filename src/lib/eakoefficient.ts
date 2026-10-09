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
  | "planned"
  | "unknown";

/**
 * Threshold (percent) above set 1's E1RM that a later set must exceed to be
 * flagged as a probable "set 1 sandbag" — i.e. the athlete underperformed
 * set 1 (skipped warm-up, low effort, mis-logged RPE) and a later, harder
 * set produced a clearly higher E1RM than physiologically plausible within
 * the same session.
 */
export const SANDBAG_SET1_THRESHOLD_PCT = 5;

export interface SetInput {
  reps: number;
  weight_kg: number;
  rpe: number;
}

/**
 * Daily Estimated 1RM (reps-to-failure Epley):
 */
/** Sets below this RPE are too far from failure to estimate strength. */
export const EAK_MIN_RPE = 7;

export function countsForEAk(set: SetInput): boolean {
  return set.rpe >= EAK_MIN_RPE && set.reps > 0 && set.weight_kg > 0;
}

/**
 *   RIR  = min(10 − RPE, 3)
 *   RTF  = min(reps + RIR, 10)
 *   E1RM = weight × (1 + (RTF − 1) / 30)
 */
export function dailyE1RM(set: SetInput): number {
  const rir = Math.min(Math.max(10 - set.rpe, 0), 3);
  const rtf = Math.min(set.reps + rir, 10);
  return set.weight_kg * (1 + (rtf - 1) / 30);
}

/** Single-set EAk (used for live previews). Sets under RPE 7 → 0. */
export function eaKoefficient(set: SetInput, baseline1RM: number): number {
  if (!baseline1RM || baseline1RM <= 0 || !countsForEAk(set)) return 0;
  return (dailyE1RM(set) / baseline1RM) * 100;
}

/**
 * Rolling EAk per (exercise, date): mean of the best qualifying E1RM from
 * this session and the two previous sessions of the same exercise.
 * Returns Map<"date::exercise", rollingE1RM>.
 */
export function rollingE1RMBySession(
  logs: Array<SetInput & { date: string; exercise: string }>,
  window = 3,
): Map<string, number> {
  const best = new Map<string, Map<string, number>>();
  for (const l of logs) {
    if (!countsForEAk(l)) continue;
    const m = best.get(l.exercise) ?? new Map<string, number>();
    m.set(l.date, Math.max(m.get(l.date) ?? 0, dailyE1RM(l)));
    best.set(l.exercise, m);
  }
  const out = new Map<string, number>();
  for (const [ex, m] of best) {
    const dates = [...m.keys()].sort();
    dates.forEach((d, i) => {
      const slice = dates.slice(Math.max(0, i - window + 1), i + 1).map((x) => m.get(x)!);
      out.set(`${d}::${ex}`, slice.reduce((a, b) => a + b, 0) / slice.length);
    });
  }
  return out;
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
  const base =
    "font-mono uppercase tracking-[0.12em] tabular-nums ring-1 ring-inset";
  switch (status) {
    case "exhausted":
      return `${base} bg-status-exhausted text-status-exhausted-foreground ring-status-exhausted-foreground/20`;
    case "undertrained":
      return `${base} bg-status-undertrained text-status-undertrained-foreground ring-status-undertrained-foreground/20`;
    case "adapting":
      return `${base} bg-status-adapting text-status-adapting-foreground ring-status-adapting-foreground/20`;
    case "peaking":
      return `${base} bg-status-peaking text-status-peaking-foreground ring-status-peaking-foreground/20`;
    default:
      return `${base} bg-muted text-muted-foreground ring-border`;
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
    case "planned":
      return "Planned light";
    default:
      return "—";
  }
}

export function volumeQualityClasses(q: VolumeQuality): string {
  const base =
    "font-mono uppercase tracking-[0.12em] tabular-nums ring-1 ring-inset";
  switch (q) {
    case "planned":
      return `${base} bg-muted text-muted-foreground ring-border`;
    case "optimal":
      return `${base} bg-status-adapting text-status-adapting-foreground ring-status-adapting-foreground/20`;
    case "acceptable":
      return `${base} bg-status-peaking text-status-peaking-foreground ring-status-peaking-foreground/20`;
    case "fatigue_limit":
      return `${base} bg-status-exhausted text-status-exhausted-foreground ring-status-exhausted-foreground/30`;
    case "sandbag":
      return `${base} bg-status-exhausted text-status-exhausted-foreground ring-status-exhausted-foreground/40`;
    case "baseline":
      return `${base} bg-muted text-muted-foreground ring-border`;
    default:
      return `${base} bg-muted text-muted-foreground ring-border`;
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
  plannedLightDates?: ReadonlySet<string>,
): Array<ProcessedSet<T>> {
  // Build set-1 reference per (date, exercise)
  const set1Map = new Map<string, number>();
  for (const log of logs) {
    if (log.set_number === 1) {
      const key = `${log.date}::${log.exercise}`;
      set1Map.set(key, dailyE1RM(log));
    }
  }

  const rolling = rollingE1RMBySession(logs);
  return logs.map((log) => {
    const baseline = baselines[log.exercise] ?? 0;
    const e1rm = dailyE1RM(log);
    const roll = rolling.get(`${log.date}::${log.exercise}`) ?? 0;
    const eak =
      baseline > 0 && roll > 0 && countsForEAk(log) ? (roll / baseline) * 100 : 0;
    const planned = plannedLightDates?.has(log.date) ?? false;
    // On a planned light / deload day the load is intentionally reduced, so a
    // low EAkoefficient is the plan working — never alarm "exhausted" for it.
    let status = readinessFromEAk(eak);
    if (planned && status === "exhausted") status = "adapting";

    const key = `${log.date}::${log.exercise}`;
    const set1 = set1Map.get(key) ?? 0;
    const drop = set1 > 0 && log.set_number > 1 ? ((set1 - e1rm) / set1) * 100 : 0;
    let volume =
      log.set_number === 1
        ? "baseline"
        : set1 > 0
          ? volumeQualityFromDrop(log.set_number, drop)
          : "unknown";
    // A within-session drop during a planned light day is expected, not a
    // fatigue alarm. Sandbagging stays flagged — inconsistent effort is still
    // inconsistent effort.
    if (planned && volume === "fatigue_limit") volume = "planned";

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
