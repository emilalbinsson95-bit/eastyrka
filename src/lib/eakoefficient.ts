import { pctOf1RMInterp } from "@/lib/intensity";
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
  is_warmup_reference?: boolean;
}

/** Sets below this RPE are too far from failure to estimate strength. */
export const EAK_MIN_RPE = 7;
/** Single threshold for "Topp" and for baseline auto-float. */
export const EAK_PEAK_PCT = 103;

export function countsForEAk(set: SetInput): boolean {
  return !set.is_warmup_reference && set.rpe >= EAK_MIN_RPE && set.reps > 0 && set.weight_kg > 0;
}

/**
 * Daily Estimated 1RM — same RTS table as prescription:
 *   E1RM = weight ÷ RTS-%(reps, RPE)
 * RPE is interpolated between half steps, never rounded down.
 */
export function dailyE1RM(set: SetInput): number {
  if (!set.weight_kg || set.reps <= 0) return 0;
  return (set.weight_kg * 100) / pctOf1RMInterp(set.rpe, set.reps);
}

/** Single-set EAk (live previews). Sets under RPE 7 → 0. */
export function eaKoefficient(set: SetInput, baseline1RM: number): number {
  if (!baseline1RM || baseline1RM <= 0 || !countsForEAk(set)) return 0;
  return (dailyE1RM(set) / baseline1RM) * 100;
}

/**
 * Measurement set per session. A heavy single (1 rep, RPE ≥ 7) is the
 * measurement set only when it comes BEFORE the first working set with
 * reps > 1 (an over-warm/opener single). A single logged after the working
 * sets never replaces the first working set. Same rule every session so
 * values are comparable over time.
 */
export function pickMeasurementSet<T extends SetInput & { set_number: number }>(sets: T[]): T | null {
  const ok = sets.filter(countsForEAk).sort((a, b) => a.set_number - b.set_number);
  if (ok.length === 0) return null;
  const firstWorking = ok.find((s) => s.reps > 1);
  const leadingSingle = ok.find(
    (s) => s.reps === 1 && (!firstWorking || s.set_number < firstWorking.set_number),
  );
  return leadingSingle ?? firstWorking ?? ok[0];
}

/** Measurement-set E1RM per "date::exercise". */
export function measurementE1RMBySession(
  logs: Array<SetInput & { date: string; exercise: string; set_number: number }>,
): Map<string, number> {
  const groups = new Map<string, typeof logs>();
  for (const l of logs) {
    const k = `${l.date}::${l.exercise}`;
    const g = groups.get(k) ?? [];
    g.push(l);
    groups.set(k, g);
  }
  const out = new Map<string, number>();
  for (const [k, g] of groups) {
    const m = pickMeasurementSet(g);
    if (m) out.set(k, dailyE1RM(m));
  }
  return out;
}

/**
 * Trend: moving average of the measurement-set E1RM over this and the two
 * previous sessions of the same exercise. Used for coach decisions; the
 * single session drives today's adjustment.
 */
export function rollingE1RMBySession(
  logs: Array<SetInput & { date: string; exercise: string; set_number?: number }>,
  window = 3,
): Map<string, number> {
  const withNum = logs.map((l, i) => ({ ...l, set_number: l.set_number ?? i + 1 }));
  const meas = measurementE1RMBySession(withNum);
  const byEx = new Map<string, Array<[string, number]>>();
  for (const [k, v] of meas) {
    const separator = k.indexOf("::");
    const d = k.slice(0, separator);
    const ex = k.slice(separator + 2);
    const arr = byEx.get(ex) ?? [];
    arr.push([d, v]);
    byEx.set(ex, arr);
  }
  const out = new Map<string, number>();
  for (const [ex, arr] of byEx) {
    arr.sort((a, b) => a[0].localeCompare(b[0]));
    arr.forEach(([d], i) => {
      const slice = arr.slice(Math.max(0, i - window + 1), i + 1).map((x) => x[1]);
      out.set(`${d}::${ex}`, slice.reduce((a, b) => a + b, 0) / slice.length);
    });
  }
  return out;
}

export function readinessFromEAk(eak: number): ReadinessStatus {
  if (!eak || eak <= 0) return "unknown";
  if (eak < 92) return "exhausted";
  if (eak < 97) return "undertrained";
  if (eak <= EAK_PEAK_PCT) return "adapting";
  return "peaking";
}

/** Swedish labels. Internal keys kept for stored colour tokens. */
export function readinessLabel(status: ReadinessStatus): string {
  switch (status) {
    case "exhausted":
      return "Långt under baslinjen";
    case "undertrained":
      return "Under baslinjen";
    case "adapting":
      return "Vid baslinjen";
    case "peaking":
      return "Över baslinjen";
    default:
      return "—";
  }
}

/** What to do today for a given status. */
export function readinessAction(status: ReadinessStatus): string {
  switch (status) {
    case "exhausted":
      return "Sänk vikten 5–10 % eller ta bort ett set";
    case "undertrained":
      return "Kör som planerat, ingen extra volym";
    case "adapting":
      return "Kör som planerat";
    case "peaking":
      return "Möjligt att gå tyngre eller testa — kräver två pass i rad";
    default:
      return "";
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
 *  - drop < 4%   → Optimal
 *  - 4% <= drop < 5% → Acceptable
 *  - drop ≥ 5%   → Fatigue limit reached
 */
export function volumeQualityFromDrop(
  setNumber: number,
  dropPercent: number,
): VolumeQuality {
  if (setNumber <= 1) return "baseline";
  if (dropPercent < -SANDBAG_SET1_THRESHOLD_PCT) return "sandbag";
  if (dropPercent < 4) return "optimal";
  if (dropPercent >= 5) return "fatigue_limit";
  return "acceptable";
}

export function volumeQualityLabel(q: VolumeQuality): string {
  switch (q) {
    case "baseline":
      return "Mätset";
    case "optimal":
      return "Bra";
    case "acceptable":
      return "Godtagbart";
    case "fatigue_limit":
      return "Trötthetsgräns";
    case "sandbag":
      return "Mätset för lätt?";
    case "planned":
      return "Planerat lätt";
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

const READINESS_LIFT = /squat|b[äa]nk|bench|deadlift|marklyft|b[öo]j|\bmark\b|clean|snatch|jerk|ryck|st[öo]t|v[äa]ndning/i;
const NOT_READINESS_LIFT = /split|bulgar|goblet|hack|leg press|dumbbell|\bdb\b|hantel|smith|machine|maskin|belt squat|sissy|jump|hopp|box squat jump|incline db|floor press db/i;
/** EAk/readiness uses the big 3 (squat, bench, deadlift), their barbell
 *  variations and Olympic lifts — accessory margins distort readiness. */
export function isReadinessLift(exercise: string): boolean {
  return READINESS_LIFT.test(exercise) && !NOT_READINESS_LIFT.test(exercise);
}

const BIG3_LIFT = /squat|b[äa]nk|bench|deadlift|marklyft|b[öo]j|\bmark\b/i;
/** Strictly the big 3 — squat, bench and deadlift plus their barbell
 *  variations. Olympic lifts and accessories are excluded, used by charts
 *  that should follow only the three competition lifts. */
export function isBig3Lift(exercise: string): boolean {
  return BIG3_LIFT.test(exercise) && !NOT_READINESS_LIFT.test(exercise);
}

export interface ProcessedSetExtra {
  /** Trend: 3-session moving average EAk (coach decisions). */
  eakTrend: number;
  isMeasurement: boolean;
}

export function processLogs<T extends RawLog>(
  logs: T[],
  baselines: Record<string, number>,
  plannedLightDates?: ReadonlySet<string>,
): Array<ProcessedSet<T> & ProcessedSetExtra> {
  const groups = new Map<string, T[]>();
  for (const l of logs) {
    const k = `${l.date}::${l.exercise}`;
    const g = groups.get(k) ?? [];
    g.push(l);
    groups.set(k, g);
  }
  const measurement = new Map<string, T>();
  for (const [k, g] of groups) {
    const m = pickMeasurementSet(g);
    if (m) measurement.set(k, m);
  }
  const rolling = rollingE1RMBySession(logs);

  return logs.filter((log) => !log.is_warmup_reference).map((log) => {
    const key = `${log.date}::${log.exercise}`;
    const baseline = lookupBaseline(baselines, log.exercise) ?? 0;
    const e1rm = dailyE1RM(log);
    const meas = measurement.get(key);
    const measE1 = meas ? dailyE1RM(meas) : 0;
    const readiness = baseline > 0 && isReadinessLift(log.exercise);
    // Day decision: today's measurement set. Trend: 3-session average.
    const eak = readiness && measE1 > 0 ? (measE1 / baseline) * 100 : 0;
    const roll = rolling.get(key) ?? 0;
    const eakTrend = readiness && roll > 0 ? (roll / baseline) * 100 : 0;
    const planned = plannedLightDates?.has(log.date) ?? false;
    const status = readinessFromEAk(eakTrend || eak);

    const isMeasurement = meas === log;
    let volume: VolumeQuality;
    let drop = 0;
    if (isMeasurement) volume = "baseline";
    else if (!countsForEAk(log) || !meas || log.set_number < meas.set_number) volume = "unknown";
    else {
      drop = ((measE1 - e1rm) / measE1) * 100;
      volume = volumeQualityFromDrop(2, drop);
    }
    if (planned && volume === "fatigue_limit") volume = "planned";

    return {
      source: log,
      dailyE1RM: e1rm,
      eaKoefficient: eak,
      eakTrend,
      isMeasurement,
      baseline1RM: baseline,
      status,
      set1E1RM: measE1,
      dropPercent: drop,
      volume,
    };
  });
}

/** Case/whitespace-insensitive baseline lookup ("Sumo deadlift" == "Sumo Deadlift"). */
export function lookupBaseline(
  baselines: Record<string, number> | undefined | null,
  exercise: string,
): number | undefined {
  if (!baselines) return undefined;
  const direct = baselines[exercise];
  if (direct !== undefined) return direct;
  const norm = exercise.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [k, v] of Object.entries(baselines)) {
    if (k.trim().toLowerCase().replace(/\s+/g, " ") === norm) return v;
  }
  return undefined;
}
