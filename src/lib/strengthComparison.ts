import { dailyE1RM, pickMeasurementSet } from "@/lib/eakoefficient";
import { repInterval } from "@/lib/chartMetrics";

export interface ComparisonLog { date: string; exercise: string; variation?: string | null; set_number: number; reps: number; weight_kg: number; rpe: number; is_warmup_reference?: boolean; is_technique?: boolean }
export function compareStrength(logs: ComparisonLog[], today: string) {
  const groups = new Map<string, ComparisonLog[]>();
  for (const l of logs) {
    if (l.date > today || !Number.isFinite(l.rpe)) continue;
    const key = JSON.stringify([l.date, l.exercise, l.variation ?? ""]);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const series = new Map<string, Array<{ date: string; value: number }>>();
  for (const g of groups.values()) {
    const m = pickMeasurementSet(g);
    if (!m) continue;
    // RTS normalizes RPE; comparisons retain exercise, variant and rep interval.
    const key = JSON.stringify([m.exercise, m.variation ?? "", repInterval(m.reps)]);
    series.set(key, [...(series.get(key) ?? []), { date: m.date, value: dailyE1RM(m) }]);
  }
  return [...series.entries()].map(([key, values]) => {
    const [exercise, variation, reps] = JSON.parse(key) as [string, string, string];
    values.sort((a, b) => a.date.localeCompare(b.date));
    const recentValues = values.slice(-3);
    const previousValues = values.slice(-6, -3);
    const mean = (v: typeof values) => v.reduce((sum, x) => sum + x.value, 0) / v.length;
    return { key, exercise, variation, reps, count: values.length,
      recent: recentValues.length === 3 ? mean(recentValues) : null,
      prev: previousValues.length === 3 ? mean(previousValues) : null,
      pb: Math.max(...values.map((v) => v.value)), pbDate: [...values].sort((a,b) => b.value-a.value)[0].date,
    };
  }).sort((a,b) => b.count-a.count);
}