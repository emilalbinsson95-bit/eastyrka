import { dailyE1RM, lookupBaseline, pickMeasurementSet, readinessFromEAk, type SetInput } from "./eakoefficient";
import { COMP_NAME, compLiftKey } from "./liftIdentity";

export interface ChartLog extends SetInput {
  date: string;
  exercise: string;
  variation?: string | null;
  set_number: number;
}
export const repInterval = (reps: number) => reps <= 3 ? "1–3" : reps <= 6 ? "4–6" : "7+";
/** Prescription notes are not separate exercises; real variants and deadlift stances remain distinct. */
export function chartLiftIdentity(exercise: string, variation?: string | null) {
  const descriptor = /^(competition stance|competition grip & pause|over[ -]?warm single|opener single)$/i;
  const embedded = exercise.trim().match(/^(back squat|squat|bench press|deadlift)\s+(competition stance|competition grip & pause|over[ -]?warm single|opener single)$/i);
  const name = embedded?.[1] ?? exercise.trim();
  const lift = compLiftKey(name);
  const note = (variation ?? "").trim();
  return { exercise: lift && !/^(sumo|conventional) deadlift$/i.test(name) ? COMP_NAME[lift] : name, variation: descriptor.test(note) ? "" : note };
}
export const chartExerciseKey = (exercise: string, variation?: string | null) => {
  const identity = chartLiftIdentity(exercise, variation);
  return JSON.stringify([identity.exercise.toLowerCase(), identity.variation.toLowerCase()]);
};

/** One shared measurement per exercise/variant/session, selected before plotting any period. */
export function chartMeasurements<T extends ChartLog>(logs: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const log of logs) {
    const key = `${log.date}::${chartExerciseKey(log.exercise, log.variation)}`;
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }
  return [...groups.values()].flatMap(group => {
    const measurement = pickMeasurementSet(group);
    return measurement ? [measurement] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function chartStrengthSeries(logs: ChartLog[], baselines: Record<string, number>) {
  const values = new Map<string, number[]>();
  return chartMeasurements(logs).map(log => {
    const key = chartExerciseKey(log.exercise, log.variation);
    const e1rm = dailyE1RM(log);
    const history = [...(values.get(key) ?? []), e1rm].slice(-3);
    values.set(key, history);
    const rolling = history.reduce((sum, value) => sum + value, 0) / history.length;
    const identity = chartLiftIdentity(log.exercise, log.variation);
    const baseline = lookupBaseline(baselines, identity.exercise) ?? 0;
    const eak = baseline > 0 ? rolling / baseline * 100 : null;
    return { ...log, ...identity, key, e1rm, rolling, baseline, eak, samples: history.length, status: readinessFromEAk(eak ?? 0) };
  });
}

export function latestChartStrength(logs: ChartLog[], baselines: Record<string, number>) {
  const latest = new Map<string, ReturnType<typeof chartStrengthSeries>[number]>();
  for (const point of chartStrengthSeries(logs, baselines)) latest.set(point.key, point);
  return [...latest.values()];
}

export function personalRecords<T extends ChartLog>(logs: T[]) {
  const measurement = new Set(chartMeasurements(logs));
  const actual = new Map<string, number>();
  const estimated = new Map<string, number>();
  const events: Array<{ log: T; kind: "actual" | "estimated"; value: number; previous: number }> = [];
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.set_number - b.set_number)) {
    if (log.is_warmup_reference || log.is_technique || log.weight_kg <= 0 || log.reps <= 0) continue;
    const key = chartExerciseKey(log.exercise, log.variation);
    const actualKey = `${key}::${log.reps}`;
    const previous = actual.get(actualKey) ?? 0;
    if (log.weight_kg > previous) {
      // First observation establishes a reference, not proof of a personal record.
      if (previous > 0) events.push({ log, kind: "actual", value: log.weight_kg, previous });
      actual.set(actualKey, log.weight_kg);
    }
    if (!measurement.has(log)) continue;
    const value = dailyE1RM(log);
    const priorEstimate = estimated.get(key) ?? 0;
    if (value > priorEstimate) {
      if (priorEstimate > 0) events.push({ log, kind: "estimated", value, previous: priorEstimate });
      estimated.set(key, value);
    }
  }
  return events.reverse();
}

export function adverseReadinessDeviation(value: number | null, history: number[], lowerIsWorse: boolean) {
  const valid = history.filter(Number.isFinite);
  if (value == null || valid.length < 3) return 0;
  const mean = valid.reduce((sum, n) => sum + n, 0) / valid.length;
  return Math.max(0, lowerIsWorse ? mean - value : value - mean);
}

export function paceRange(samples: Array<{ sessionId: string; sec: number; m: number }>) {
  const valid = samples.filter(s => s.sec > 0 && s.m > 0);
  if (new Set(valid.map(s => s.sessionId)).size < 10) return null;
  const values = valid.map(s => s.sec / s.m * 1000).sort((a, b) => a - b);
  const quantile = (p: number) => {
    const position = (values.length - 1) * p;
    const lower = Math.floor(position);
    return values[lower] + (values[Math.ceil(position)] - values[lower]) * (position - lower);
  };
  return { lower: quantile(.1), upper: quantile(.9), sessions: new Set(valid.map(s => s.sessionId)).size };
}

/** DOTS coefficient for raw three-lift total; no score without declared sex and all lifts. */
export function dotsScore(total: number, bodyweight: number, sex: string | null | undefined) {
  const male = sex === "male" || sex === "man" || sex === "m";
  const female = sex === "female" || sex === "woman" || sex === "f";
  if ((!male && !female) || total <= 0 || bodyweight < 40 || bodyweight > (male ? 210 : 150)) return null;
  const c = male ? [-307.75076, 24.0900756, -.1918759221, .0007391293, -.000001093] : [-57.96288, 13.6175032, -.1126655495, .0005158568, -.0000010706];
  const denominator = c.reduce((sum, coefficient, power) => sum + coefficient * bodyweight ** power, 0);
  return denominator > 0 ? total * 500 / denominator : null;
}

export const limbSymmetryIndex = (injured: number | null, healthy: number | null) =>
  injured != null && healthy != null && injured >= 0 && healthy > 0 ? injured / healthy * 100 : null;