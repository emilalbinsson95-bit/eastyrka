import { dailyE1RM, pickMeasurementSet } from "@/lib/eakoefficient";

export interface ComparisonLog { date: string; exercise: string; variation?: string | null; set_number: number; reps: number; weight_kg: number; rpe: number }
export function compareStrength(logs: ComparisonLog[], today: string) {
  const groups = new Map<string, ComparisonLog[]>();
  for (const l of logs) {
    if (l.date > today || !Number.isFinite(l.rpe) || l.reps > 8) continue;
    const key = JSON.stringify([l.date, l.exercise, l.variation ?? ""]);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const series = new Map<string, Array<{ date: string; value: number }>>();
  for (const g of groups.values()) {
    const m = pickMeasurementSet(g);
    if (!m) continue;
    // Same exercise, variant, rep count and half-RPE bucket on both sides.
    const key = JSON.stringify([m.exercise, m.variation ?? "", m.reps, Math.round(m.rpe * 2) / 2]);
    series.set(key, [...(series.get(key) ?? []), { date: m.date, value: dailyE1RM(m) }]);
  }
  return [...series.entries()].map(([key, values]) => {
    const [exercise, variation, reps, rpe] = JSON.parse(key) as [string, string, number, number];
    values.sort((a, b) => a.date.localeCompare(b.date));
    const recentValues = values.slice(-3);
    const previousValues = values.slice(-6, -3);
    const mean = (v: typeof values) => v.reduce((sum, x) => sum + x.value, 0) / v.length;
    return { key, exercise, variation, reps, rpe, count: values.length,
      recent: recentValues.length === 3 ? mean(recentValues) : null,
      prev: previousValues.length === 3 ? mean(previousValues) : null,
      pb: Math.max(...values.map((v) => v.value)), pbDate: [...values].sort((a,b) => b.value-a.value)[0].date,
    };
  }).sort((a,b) => b.count-a.count);
}