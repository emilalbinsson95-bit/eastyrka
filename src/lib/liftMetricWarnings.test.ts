import { describe, expect, it } from "vitest";
import { blockMetricWarnings, plannedWeekMetrics, referenceMetrics, type PlanWeekInput } from "./liftMetrics";

const baselines = { "Bench press": 160, Squat: 200, Deadlift: 250 };
const bench = (sets: number, reps: number, kg: number) => ({ exercise: "Bench press", target_sets: sets, target_reps: reps, target_weight_kg: kg });
const week = (i: number, rows: PlanWeekInput["sessions"][0]["exercises"], kind = "working"): PlanWeekInput => ({ week_index: i, kind, sessions: [{ exercises: rows }] });
const logs = (date: string, n: number, reps: number, kg: number) =>
  Array.from({ length: n }, () => ({ date, exercise: "Bench press", variation: null, reps, weight_kg: kg, rpe: 8 }));

describe("referens: tre senaste genomförda arbetsveckorna", () => {
  it("snittar mängd och hoppar över avlastning och innevarande vecka", () => {
    const l = [
      ...logs("2026-10-19", 5, 5, 128), // mängd 20
      ...logs("2026-10-26", 5, 5, 128), // avlastning – räknas inte
      ...logs("2026-11-02", 4, 5, 128), // 16
      ...logs("2026-11-09", 3, 5, 128), // 12
      ...logs("2026-11-16", 10, 5, 128), // innevarande vecka – räknas inte
    ];
    const ref = referenceMetrics(l, baselines, ["2026-10-26"], "2026-11-16");
    expect(ref.weeks).toEqual(["2026-11-09", "2026-11-02", "2026-10-19"]);
    expect(ref.volume.bench).toBeCloseTo(16, 5);
  });
});

describe("varning Mängd (>30 % över referensen)", () => {
  const ref = referenceMetrics(logs("2026-11-09", 5, 5, 128), baselines, [], "2026-11-16"); // 20
  it("varnar över 130 % och visar båda talen", () => {
    const planned = plannedWeekMetrics([week(1, [bench(6, 6, 128)])], baselines); // 28,8
    const w = blockMetricWarnings({ planned, reference: ref, checkVolume: true, checkHeavy: false });
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain("28,8");
    expect(w[0].message).toContain("20,0");
  });
  it("varnar inte på exakt 130 %", () => {
    const planned = plannedWeekMetrics([week(1, [bench(5, 5, 166.4)])], baselines); // 26
    expect(blockMetricWarnings({ planned, reference: ref, checkVolume: true, checkHeavy: false })).toHaveLength(0);
  });
  it("ingen varning utan referens", () => {
    const planned = plannedWeekMetrics([week(1, [bench(10, 10, 100)])], baselines);
    const empty = referenceMetrics([], baselines, [], "2026-11-16");
    expect(blockMetricWarnings({ planned, reference: empty, checkVolume: true, checkHeavy: false })).toHaveLength(0);
  });
});

describe("varning Inga tunga set (två arbetsveckor i rad)", () => {
  const light = [bench(5, 5, 128)]; // 80 %
  const heavy = [bench(3, 1, 140)]; // 87,5 %
  it("varnar när två arbetsveckor saknar set på 85 %", () => {
    const planned = plannedWeekMetrics([week(1, light), week(2, light), week(3, heavy)], baselines);
    const w = blockMetricWarnings({ planned, reference: null, checkVolume: false, checkHeavy: true });
    expect(w.map((x) => [x.lift, x.weeks])).toEqual([["bench", [1, 2]]]);
  });
  it("en vecka utan tunga set räcker inte", () => {
    const planned = plannedWeekMetrics([week(1, light), week(2, heavy), week(3, light)], baselines);
    expect(blockMetricWarnings({ planned, reference: null, checkVolume: false, checkHeavy: true })).toHaveLength(0);
  });
  it("avlastning och uppstartsveckor räknas inte", () => {
    const planned = plannedWeekMetrics([week(1, light), week(2, heavy), week(3, light), week(4, light, "deload")], baselines);
    expect(blockMetricWarnings({ planned, reference: null, checkVolume: false, checkHeavy: true })).toHaveLength(0);
    const ramp = plannedWeekMetrics([week(1, light), week(2, light), week(3, heavy)], baselines);
    expect(blockMetricWarnings({ planned: ramp, reference: null, checkVolume: false, checkHeavy: true, rampWeeks: 1 })).toHaveLength(0);
  });
  it("avstängd varning (coachval) ger inget", () => {
    const planned = plannedWeekMetrics([week(1, light), week(2, light)], baselines);
    expect(blockMetricWarnings({ planned, reference: null, checkVolume: false, checkHeavy: false })).toHaveLength(0);
  });
  it("RPE-styrda rader får vikt från RTS: 5 @ 8 är inte tungt, 1 @ 8 är det", () => {
    const rpeRow = (reps: number) => ({ exercise: "Bench press", target_sets: 3, target_reps: reps, target_rpe: 8 });
    const planned = plannedWeekMetrics([week(1, [rpeRow(5)]), week(2, [rpeRow(5), rpeRow(1)])], baselines);
    expect(planned[0].metrics.bench.heavySets).toBe(0);
    expect(planned[1].metrics.bench.heavySets).toBe(3);
  });
});

describe("referens med toppningsveckor som börjar mitt i veckan", () => {
  it("lämnar ute båda ISO-veckorna som en lördagsstartad toppningsvecka rör", () => {
    const l = [
      ...logs("2026-10-12", 5, 5, 128), // 20
      ...logs("2026-10-19", 5, 5, 128), // 20
      ...logs("2026-10-27", 2, 1, 150), // toppning lör 31/10 rör veckan 26/10
      ...logs("2026-11-03", 2, 1, 150), // samma toppningsvecka
    ];
    const ref = referenceMetrics(l, baselines, ["2026-10-31"], "2026-11-16");
    expect(ref.weeks).toEqual(["2026-10-19", "2026-10-12"]);
    expect(ref.volume.bench).toBeCloseTo(20, 5);
  });
});
